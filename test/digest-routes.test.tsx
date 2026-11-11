import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestResult, DigestRow } from '../src/digest/types.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(night: string, contents: string): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

function app() {
  return createApp({ ...baseConfig, runsDir });
}

const records = [
  // Deliberately out of order: the latest instant is on the first line.
  { at: '2026-10-29T00:30:00+02:00', job: '<alpha>', status: 'ok', owner: '<owner>&' },
  { at: '2026-10-28T23:30:00+02:00', job: '<alpha>', status: 'retry', owner: 'older', error: '<script>&' },
  // Same instant as the preceding record; the later line wins the tie.
  { at: '2026-10-28T21:30:00Z', job: '<alpha>', status: 'fail', owner: null, error: '' },
  { at: '2026-10-28T02:00:00+01:00', job: 'beta', status: 'retry', owner: 'before-tie' },
  { at: '2026-10-28T01:00:00Z', job: 'beta', status: 'ok', owner: null },
  { at: '2026-10-28T05:00:00+01:00', job: 'recover', status: 'ok', owner: 'latest' },
  { at: '2026-10-28T04:00:00+01:00', job: 'recover', status: 'fail', owner: 'failed', error: 'quota <exceeded>' },
  { at: '2026-10-28T01:00:00+01:00', job: 'recover', status: 'retry', owner: 'retry-1' },
  { at: '2026-10-28T02:00:00+01:00', job: 'recover', status: 'retry', owner: 'retry-2' },
  { at: '2026-10-28T03:00:00+01:00', job: 'recover', status: 'retry', owner: 'retry-3' },
  { at: '2026-10-28T02:00:00+01:00', job: 'plain', status: 'ok', owner: 'plain-owner', extra: 'ignored' },
];

const validLog = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

describe('digest routes', () => {
  it('returns the same sorted rows in HTML and JSON, preserving aggregation and display values', async () => {
    writeNight('2026-10-28', `${validLog}{not-json}\n${JSON.stringify({ at: 'bad', job: 'invalid-date', status: 'ok', owner: null })}\n${JSON.stringify({ at: '2026-10-28T00:00:00Z', job: 'invalid-status', status: 'queued', owner: null })}\n${JSON.stringify({ at: '2026-10-28T00:00:00Z', job: 'invalid-error', status: 'ok', owner: null, error: 3 })}\n\n`);

    const response = await app().request('/api/digest/2026-10-28');
    expect(response.status).toBe(200);
    const result = (await response.json()) as DigestResult;
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') throw new Error('expected found digest');
    expect(result.night).toBe('2026-10-28');
    expect(result.malformedRecords).toBe(5);

    const page = await app().request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    const html = await page.text();

    const jobs = result.rows.map((row) => row.job);
    expect(jobs).toEqual(['<alpha>', 'beta', 'plain', 'recover']);
    let previousPosition = -1;
    for (const job of jobs) {
      const position = html.indexOf(escapeHtml(job));
      expect(position).toBeGreaterThan(previousPosition);
      previousPosition = position;
    }

    const htmlRows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
    for (const row of result.rows) {
      const renderedRow = htmlRows.find((candidate) => candidate.includes(escapeHtml(row.job)));
      expect(renderedRow, `HTML row for ${row.job}`).toBeDefined();
      if (!renderedRow) throw new Error(`missing HTML row for ${row.job}`);
      expect(renderedRow).toContain(escapeHtml(row.owner ?? '—'));
      expect(renderedRow).toContain(String(row.runs));
      expect(renderedRow).toContain(String(row.retries));
      expect(renderedRow).toContain(row.status);
      expect(renderedRow).toContain(escapeHtml(row.lastError ?? '—'));
      expect(renderedRow).toContain(escapeHtml(row.first));
      expect(renderedRow).toContain(escapeHtml(row.last));
      if (row.hasFailed || row.retries >= 3) expect(renderedRow).toContain('warn');
    }

    const alpha = rowFor(result.rows, '<alpha>');
    expect(alpha).toMatchObject({
      owner: '<owner>&',
      runs: 3,
      retries: 1,
      status: 'ok',
      lastError: '<script>&',
      first: '2026-10-28T23:30:00+02:00',
      last: '2026-10-29T00:30:00+02:00',
      hasFailed: true,
    });
    const beta = rowFor(result.rows, 'beta');
    expect(beta).toMatchObject({
      owner: null,
      runs: 2,
      retries: 1,
      status: 'ok',
      first: '2026-10-28T02:00:00+01:00',
      last: '2026-10-28T01:00:00Z',
      hasFailed: false,
    });
    const recovered = rowFor(result.rows, 'recover');
    expect(recovered).toMatchObject({
      owner: 'latest',
      runs: 5,
      retries: 3,
      status: 'ok',
      lastError: 'quota <exceeded>',
      first: '2026-10-28T01:00:00+01:00',
      last: '2026-10-28T05:00:00+01:00',
      hasFailed: true,
    });

    expect(html).toContain('&lt;script&gt;&amp;');
    expect(html).toContain('&lt;owner&gt;&amp;');
    expect(html).not.toContain('<script>');
  });

  it('returns 404 for a missing night from both endpoints', async () => {
    const page = await app().request('/digest/2026-10-28');
    const json = await app().request('/api/digest/2026-10-28');
    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('keeps an existing empty night distinct from a missing night', async () => {
    writeNight('2026-10-28', '');

    const page = await app().request('/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const json = await app().request('/api/digest/2026-10-28');
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({
      kind: 'found',
      night: '2026-10-28',
      rows: [],
      malformedRecords: 0,
    });
  });

  it('returns 400 for an invalid calendar date on both endpoints', async () => {
    const page = await app().request('/digest/2026-02-30');
    const json = await app().request('/api/digest/2026-02-30');
    expect(page.status).toBe(400);
    expect(json.status).toBe(400);
  });

  it('renders only synthetic marked and unmarked lane banners', async () => {
    writeNight('2026-10-28', '');
    const previousMarker = process.env.LANE_MARKER;
    const previousId = process.env.LANE_ID;
    try {
      process.env.LANE_ID = 'test-lane';
      process.env.LANE_MARKER = 'SYNTHETIC-ROUTE-TEST-MARKER';
      const marked = await app().request('/digest/2026-10-28');
      expect(await marked.text()).toContain('SYNTHETIC-ROUTE-TEST-MARKER');

      delete process.env.LANE_MARKER;
      const unmarked = await app().request('/digest/2026-10-28');
      expect(await unmarked.text()).toContain('no marker set');
    } finally {
      restoreEnv('LANE_MARKER', previousMarker);
      restoreEnv('LANE_ID', previousId);
    }
  });
});

function rowFor(rows: DigestRow[], job: string): DigestRow {
  const row = rows.find((candidate) => candidate.job === job);
  if (!row) throw new Error(`missing JSON row for ${job}`);
  return row;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
