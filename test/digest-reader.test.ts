import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readNight } from '../src/digest/reader.js'

const night = '2026-10-28'
const event = (fields: Record<string, unknown> = {}) => ({
  at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'owner', ...fields,
})

function found(runsDir: string, selectedNight = night) {
  const result = readNight(runsDir, selectedNight)
  expect(result.kind).toBe('found')
  if (result.kind !== 'found') throw new Error('Expected an existing night')
  return result
}

describe('readNight fixtures (read only)', () => {
  it('aggregates all 15 valid events and the malformed record on October 28', () => {
    const result = found('runs')
    expect(result.malformedRecords).toBe(1)
    expect(result.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ])
    expect(result.rows.reduce((total, row) => total + row.runs, 0)).toBe(15)
    expect(result.rows).toEqual([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, status: 'ok', lastError: null,
        first: '2026-10-29T05:41:09+01:00', last: '2026-10-29T05:41:09+01:00', hasFailed: false },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, status: 'ok', lastError: 'upstream 503',
        first: '2026-10-29T01:30:00+01:00', last: '2026-10-29T01:37:00+01:00', hasFailed: false },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, status: 'ok', lastError: 'lock held',
        first: '2026-10-28T23:00:06+01:00', last: '2026-10-29T05:00:04+01:00', hasFailed: false },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, status: 'fail', lastError: 'quota exceeded',
        first: '2026-10-29T04:00:01+01:00', last: '2026-10-29T04:00:01+01:00', hasFailed: true },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, status: 'ok', lastError: null,
        first: '2026-10-28T23:00:02+01:00', last: '2026-10-28T23:00:02+01:00', hasFailed: false },
    ])
  })

  it('aggregates seven valid events into four jobs on October 27', () => {
    const result = found('runs', '2026-10-27')
    expect(result.malformedRecords).toBe(0)
    expect(result.rows.map(row => row.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'])
    expect(result.rows.reduce((total, row) => total + row.runs, 0)).toBe(7)
    expect(result.rows.every(row => row.status === 'ok' && row.retries === 0 && !row.hasFailed)).toBe(true)
  })
})

describe('readNight edge cases', () => {
  let runsDir: string
  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')) })
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }) })
  function write(records: unknown[], ending = '\n') {
    writeFileSync(join(runsDir, `${night}.jsonl`), records.map(record => JSON.stringify(record)).join(ending) + ending)
  }

  it('distinguishes missing, empty, and malformed-only files', () => {
    expect(readNight(runsDir, night)).toEqual({ kind: 'missing', night })
    writeFileSync(join(runsDir, `${night}.jsonl`), '')
    expect(readNight(runsDir, night)).toEqual({ kind: 'found', night, rows: [], malformedRecords: 0 })
    writeFileSync(join(runsDir, `${night}.jsonl`), '{broken\nnull\n')
    expect(readNight(runsDir, night)).toEqual({ kind: 'found', night, rows: [], malformedRecords: 2 })
  })

  it('orders by instant, keeps offsets, and uses the later line on a tie', () => {
    write([
      event({ at: '2026-10-29T01:30:00+02:00', status: 'retry', error: 'older error', owner: 'middle' }),
      event({ at: '2026-10-29T00:00:00Z', status: 'fail', error: ' last error ', owner: 'failed' }),
      event({ at: '2026-10-28T23:00:00+01:00', owner: 'first', error: 'first error' }),
      event({ at: '2026-10-28T19:00:00-05:00', status: 'ok', owner: null, error: '' }),
    ])
    expect(found(runsDir).rows).toEqual([{
      job: 'job', owner: null, runs: 4, retries: 1, status: 'ok', lastError: ' last error ',
      first: '2026-10-28T23:00:00+01:00', last: '2026-10-28T19:00:00-05:00', hasFailed: true,
    }])
  })

  it('retains a nonempty error through an absent or empty error after recovery', () => {
    write([
      event({ at: '2026-10-28T22:00:00Z', status: 'fail', error: 'failure' }),
      event({ at: '2026-10-28T22:01:00Z', status: 'retry', error: 'retry' }),
      event({ at: '2026-10-28T22:02:00Z', error: '' }),
      event({ at: '2026-10-28T22:03:00Z' }),
    ])
    expect(found(runsDir).rows[0]).toMatchObject({ runs: 4, retries: 1, status: 'ok', lastError: 'retry', hasFailed: true })
  })

  it('preserves fractional precision and treats equivalent fractions as ties', () => {
    write([
      event({ at: '2026-10-28T22:00:00.0002Z', owner: 'later' }),
      event({ at: '2026-10-28T22:00:00.0001Z', owner: 'earlier' }),
      event({ at: '2026-10-28T23:00:00.000200+01:00', owner: 'tie winner' }),
    ])
    expect(found(runsDir).rows[0]).toMatchObject({
      first: '2026-10-28T22:00:00.0001Z', last: '2026-10-28T23:00:00.000200+01:00', owner: 'tie winner',
    })
  })

  it('uses deterministic code-unit job order and accepts null/empty owners and extra fields', () => {
    write(['ä', 'a', '__proto__', 'Z', 'A'].map(job => event({ job, owner: job === 'a' ? null : '', extra: 42 })))
    expect(found(runsDir).rows.map(row => row.job)).toEqual(['A', 'Z', '__proto__', 'a', 'ä'])
    expect(found(runsDir).rows.find(row => row.job === 'a')?.owner).toBeNull()
  })

  it.each(['\n', '\r\n'])('accepts %j endings and counts internal blank records only', ending => {
    const record = JSON.stringify(event())
    writeFileSync(join(runsDir, `${night}.jsonl`), record + ending + ending + '  ' + ending + record + ending)
    expect(found(runsDir)).toMatchObject({ malformedRecords: 2, rows: [{ runs: 2 }] })
    writeFileSync(join(runsDir, `${night}.jsonl`), record)
    expect(found(runsDir).malformedRecords).toBe(0)
    writeFileSync(join(runsDir, `${night}.jsonl`), ending)
    expect(found(runsDir)).toEqual({ kind: 'found', night, rows: [], malformedRecords: 1 })
  })

  it('counts each invalid JSON shape or field once without contributing events', () => {
    const invalid = [null, [], 1, 'text', true, {}, event({ at: 1 }), event({ at: undefined }),
      event({ job: '' }), event({ job: 1 }), event({ job: undefined }), event({ status: 'unknown' }),
      event({ status: null }), event({ owner: undefined }), event({ owner: 1 }),
      event({ error: null }), event({ error: 1 }), event({ status: 'retry', owner: [], error: {} })]
    write([...invalid, event({ owner: null })])
    const result = found(runsDir)
    expect(result.malformedRecords).toBe(invalid.length)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ runs: 1, retries: 0, owner: null, lastError: null, hasFailed: false })
  })

  it.each([
    'not a time', '2026-10-28', '2026-10-28T22:00:00', '2026-02-29T22:00:00Z',
    '1900-02-29T22:00:00Z', '2026-04-31T22:00:00Z', '2026-00-01T22:00:00Z',
    '2026-13-01T22:00:00Z', '2026-01-00T22:00:00Z', '2026-10-28T24:00:00Z',
    '2026-10-28T23:60:00Z', '2026-10-28T23:59:60Z', '2026-10-28T22:00:00+24:00',
    '2026-10-28T22:00:00+01:60', '2026-10-28T22:00:00+0100', '2026-10-28T22:00:00.Z',
  ])('rejects invalid timestamp %j', at => {
    write([event({ at })])
    expect(found(runsDir)).toEqual({ kind: 'found', night, rows: [], malformedRecords: 1 })
  })

  it('accepts real leap days and preserves timestamp strings', () => {
    write([event({ at: '2000-02-29T23:59:59.100z' }), event({ at: '2024-02-29t12:00:00-05:30' })])
    expect(found(runsDir).rows[0]).toMatchObject({ runs: 2, first: '2000-02-29T23:59:59.100z', last: '2024-02-29t12:00:00-05:30' })
    expect(readNight(runsDir, '2000-02-29')).toEqual({ kind: 'missing', night: '2000-02-29' })
  })

  it.each(['', '..', '../2026-10-28', '..\\2026-10-28', '/2026-10-28', 'C:\\2026-10-28',
    '2026-10-28.jsonl', '2026-1-01', '2026-02-29', '1900-02-29', '2026-04-31',
    '2026-13-01', '2026-00-01', '2026-01-00', '2026-10-28\n', '2026-10-28\0'])('rejects invalid night %j before I/O', invalid => {
    expect(() => readNight(join(runsDir, 'nonexistent'), invalid)).toThrow(RangeError)
  })

  it('propagates unexpected filesystem errors', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`))
    expect(() => readNight(runsDir, night)).toThrow()
  })
})
