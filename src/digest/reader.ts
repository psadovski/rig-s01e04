import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DigestRow, DigestStatus, ReadNight } from './types.js'

type Event = {
  at: string
  job: string
  status: DigestStatus
  owner: string | null
  error?: string
  second: number
  fraction: string
  line: number
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

function timestamp(value: string): { second: number; fraction: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return null
  const [, date, hour, minute, second, fraction = '', offset] = match
  if (!validDate(date) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null
  if (offset.length > 1 && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return null
  const instant = Date.parse(`${date}T${hour}:${minute}:${second}${offset.toUpperCase()}`)
  if (!Number.isFinite(instant)) return null
  // Keep fractional precision beyond milliseconds when comparing event instants.
  return { second: instant / 1000, fraction: fraction.replace(/0+$/, '') }
}

function parseEvent(record: string, line: number): Event | null {
  let value: unknown
  try {
    value = JSON.parse(record)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  const { at, job, status, owner, error } = fields
  if (typeof at !== 'string' || typeof job !== 'string' || job.length === 0) return null
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null
  if (owner !== null && typeof owner !== 'string') return null
  if ('error' in fields && typeof error !== 'string') return null
  const time = timestamp(at)
  if (!time) return null
  return { at, job, status, owner, error: typeof error === 'string' ? error : undefined, ...time, line }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validDate(night)) throw new RangeError('Night must be a real date in YYYY-MM-DD form')
  let contents: string
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8')
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'missing', night }
    }
    throw error
  }

  const records = contents === '' ? [] : contents.split(/\r?\n/)
  if (contents.endsWith('\n')) records.pop()
  const events: Event[] = []
  let malformedRecords = 0
  for (const [line, record] of records.entries()) {
    const event = parseEvent(record, line)
    if (event) events.push(event)
    else malformedRecords++
  }
  events.sort((left, right) => left.second - right.second
    || compareStrings(left.fraction, right.fraction) || left.line - right.line)

  const jobs = new Map<string, DigestRow>()
  for (const event of events) {
    let row = jobs.get(event.job)
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        status: event.status, lastError: null, first: event.at, last: event.at, hasFailed: false,
      }
      jobs.set(event.job, row)
    }
    row.runs++
    if (event.status === 'retry') row.retries++
    row.status = event.status
    row.owner = event.owner
    row.last = event.at
    if (event.error) row.lastError = event.error
    if (event.status === 'fail') row.hasFailed = true
  }
  const rows = [...jobs.values()].sort((left, right) => compareStrings(left.job, right.job))
  return { kind: 'found', night, rows, malformedRecords }
}
