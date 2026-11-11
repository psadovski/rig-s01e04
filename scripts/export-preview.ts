import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getRequestListener } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const night = '2026-10-28';
const fixtureHashes = {
  '2026-10-27': '6b70e7b7370e971394cd97fe79d92d79ef3604f92521cba3ad93b120ce738a7f',
  '2026-10-28': '1a04213e3bf5921e40764080788b8df168d4a9b783c27784a5a6ea8a2cffd20a',
};
const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

function requireCheck(condition: boolean): asserts condition {
  if (!condition) throw new Error('Preview validation failed.');
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function outputOutsideGit(outputDirectory: string): Promise<string> {
  requireCheck(isAbsolute(outputDirectory));
  const output = resolve(outputDirectory);
  // Resolve existing parents to catch symlinks and junctions back into a checkout.
  const parent = await realpath(dirname(output));
  const root = await realpath(repository);
  const fromRoot = relative(root, join(parent, basename(output)));
  requireCheck(fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot));
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    requireCheck(!existsSync(join(ancestor, '.git')));
    if (ancestor === dirname(ancestor)) break;
  }
  // A fresh directory ensures the Pages artifact cannot include stale files.
  await mkdir(output);
  return output;
}

export async function exportPreview(outputDirectory: string): Promise<void> {
  const marker = process.env.LANE_MARKER?.trim();
  requireCheck(marker !== undefined && marker.length > 0);
  const runsDir = join(repository, 'runs');
  for (const [fixtureNight, expected] of Object.entries(fixtureHashes)) {
    const content = await readFile(join(runsDir, `${fixtureNight}.jsonl`), 'utf8');
    const hash = createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex');
    requireCheck(hash === expected);
  }
  const result = readNight(runsDir, night);
  requireCheck(result.kind === 'found');
  requireCheck(result.malformedRecords === 1 && result.rows.length === 5);
  requireCheck(result.rows.every((row, index) => row.job === jobs[index]));

  const output = await outputOutsideGit(outputDirectory);
  const previousLane = process.env.LANE_ID;
  process.env.LANE_ID = 'lane-07';
  const server = createServer(getRequestListener(createApp({
    adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
  }).fetch));
  try {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('error', rejectListening);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', rejectListening);
        resolveListening();
      });
    });
    const address = server.address();
    requireCheck(address !== null && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/digest/${night}`, {
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    requireCheck(response.status === 200);
    requireCheck(response.headers.get('content-type')?.includes('text/html') === true);
    const html = await response.text();
    requireCheck(html.startsWith('<!doctype html>'));
    requireCheck(html.includes(`<span class="marker">${escapeText(marker)}</span>`));
    requireCheck(html.includes('malformed records: 1'));
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
    requireCheck(body !== undefined && (body.match(/<tr>/g) ?? []).length === 5);
    requireCheck(jobs.every((job) => body.includes(`<td>${job}</td>`)));
    requireCheck((html.match(/<style>/g) ?? []).length === 1);
    requireCheck(!/<(?:script|link|iframe|object|embed|img|source|video|audio|base)\b/i.test(html));
    requireCheck(!/\s(?:src|srcset|href|on\w+)\s*=/i.test(html));
    const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    requireCheck(css !== undefined && !/(?:url\s*\(|@import)/i.test(css));
    await writeFile(join(output, 'index.html'), html, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } finally {
    if (previousLane === undefined) delete process.env.LANE_ID;
    else process.env.LANE_ID = previousLane;
    if (server.listening) {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(error) : resolveClose());
        server.closeAllConnections();
      });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireCheck(process.argv.length === 3);
    await exportPreview(process.argv[2]);
    console.log('Initial marked preview exported and verified.');
  } catch {
    // Never print exception inputs, environment, response bodies, or the marker.
    console.error('Preview export failed; check the runtime marker, sample fixtures, and fresh output directory outside git.');
    process.exitCode = 1;
  }
}
