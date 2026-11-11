import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { readNight } from './digest/reader.js';
import type { DigestResult } from './digest/types.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { DigestPage } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    let result: DigestResult;
    try {
      result = readNight(config.runsDir, c.req.param('night'));
    } catch (error) {
      if (error instanceof RangeError) return c.text('invalid night', 400);
      throw error;
    }

    if (result.kind === 'missing') return c.text('night not found', 404);

    return c.html(
      <Layout title={`digest · ${result.night}`} lane={lane()}>
        <DigestPage result={result} />
      </Layout>,
    );
  });

  return app;
}
