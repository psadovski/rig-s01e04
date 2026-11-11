import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

describe('status board digest links', () => {
  it('links newest-first fixture nights with per-job final status counts', async () => {
    const app = createApp(config);
    const response = await app.request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('ok 4 · retry 0 · fail 1');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 4 · retry 0 · fail 0');
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));

    for (const night of ['2026-10-28', '2026-10-27']) {
      const page = await app.request(`/digest/${night}`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(`<h1>digest · ${night}</h1>`);
    }
  });

  it('counts each job once by final status after retries and recovery', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    const night = '2026-11-10';
    const record = (minute: number, job: string, status: 'ok' | 'retry' | 'fail') => JSON.stringify({
      at: `2026-11-10T01:${String(minute).padStart(2, '0')}:00+01:00`, job, status, owner: 'rook',
    });
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      record(0, 'retry-then-ok', 'retry'),
      record(1, 'failure-then-ok', 'fail'),
      record(2, 'retry-only', 'retry'),
      record(3, 'failure-only', 'fail'),
      record(4, 'retry-then-ok', 'ok'),
      record(5, 'failure-then-ok', 'ok'),
    ].join('\n') + '\n');

    try {
      const response = await createApp({ ...config, runsDir }).request('/');
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain(`<a href="/digest/${night}">${night}</a>`);
      expect(html).toContain('ok 2 · retry 1 · fail 1');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
