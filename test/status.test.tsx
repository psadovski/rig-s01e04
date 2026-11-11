import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    const previousMarker = process.env.LANE_MARKER;
    const previousId = process.env.LANE_ID;
    try {
      process.env.LANE_MARKER = 'TEST-MARKER';
      process.env.LANE_ID = 'lane-07';
      const res = await createApp(config).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('TEST-MARKER');
      expect(html).toContain('2026-10-28');
    } finally {
      restoreEnv('LANE_MARKER', previousMarker);
      restoreEnv('LANE_ID', previousId);
    }
  });

  it('health answers with the lane id', async () => {
    const previousId = process.env.LANE_ID;
    try {
      process.env.LANE_ID = 'lane-07';
      const res = await createApp(config).request('/health');
      expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
    } finally {
      restoreEnv('LANE_ID', previousId);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
