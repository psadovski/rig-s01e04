import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const directories: string[] = [];
const failure = {
  code: 1, stdout: '',
  stderr: 'Preview export failed; check the runtime marker, sample fixtures, and fresh output directory outside git.\n',
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rig-preview-test-'));
  directories.push(directory);
  return directory;
}

async function fixtureHashes(): Promise<string[]> {
  return Promise.all(['2026-10-27', '2026-10-28'].map(async (night) =>
    createHash('sha256').update(await readFile(join(root, 'runs', `${night}.jsonl`))).digest('hex')));
}

const syntheticMarker = 'synthetic-preview<&"\'marker';

function exportCommand(output: string, marker: string | undefined, unmarked = false) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANE_ID: 'unrelated-private-lane',
    PREVIEW_ENV_SENTINEL: 'unrelated-private-environment-value',
  };
  delete env.LANE_MARKER;
  if (marker !== undefined) env.LANE_MARKER = marker;
  return run(process.execPath, [
    '--import', 'tsx', 'scripts/export-preview.ts', output, ...(unmarked ? ['--unmarked'] : []),
  ], {
    cwd: root,
    timeout: 15_000,
    env,
  });
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    // Only remove fresh test directories resolved beneath the OS temp directory.
    if (!resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/'))) {
      throw new Error('Invalid test directory.');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('initial preview export command', () => {
  it('fetches the live digest into one self-contained file without changing fixtures or logging HTML', async () => {
    const before = await fixtureHashes();
    const output = join(await temporaryDirectory(), 'preview');
    const { stdout, stderr } = await exportCommand(output, syntheticMarker);
    expect(stdout.trim()).toBe('Initial marked preview exported and verified.');
    expect(stderr).toBe('');
    expect(await readdir(output)).toEqual(['index.html']);
    const html = await readFile(join(output, 'index.html'), 'utf8');
    expect(html).toContain('<span class="marker">synthetic-preview&lt;&amp;&quot;&#39;marker</span>');
    expect(html).toContain('<span>lane-07</span>');
    expect(html).not.toContain('unrelated-private');
    expect(html).toContain('malformed records: 1');
    expect(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g)).toHaveLength(5);
    expect(html).not.toMatch(/<(?:script|link|img)\b/i);
    expect(await fixtureHashes()).toEqual(before);
  });

  it('rejects a repository output path without writing generated HTML', async () => {
    const output = join(root, 'forbidden-preview');
    await expect(exportCommand(output, syntheticMarker)).rejects.toMatchObject(failure);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects a missing marker before creating output', async () => {
    const output = join(await temporaryDirectory(), 'preview');
    await expect(exportCommand(output, '')).rejects.toMatchObject(failure);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects an existing output directory so unrelated files cannot enter the artifact', async () => {
    const output = await temporaryDirectory();
    await expect(exportCommand(output, syntheticMarker)).rejects.toMatchObject(failure);
    expect(await readdir(output)).toEqual([]);
  });
});

describe('reviewed preview export command', () => {
  it('exports the same live digest with the marker truly unset and leaves fixtures unchanged', async () => {
    const before = await fixtureHashes();
    const parent = await temporaryDirectory();
    const markedOutput = join(parent, 'marked');
    const output = join(parent, 'unmarked');
    await exportCommand(markedOutput, syntheticMarker);
    const markedHtml = await readFile(join(markedOutput, 'index.html'), 'utf8');

    const { stdout, stderr } = await exportCommand(output, undefined, true);
    expect(stdout.trim()).toBe('Unmarked preview exported and verified.');
    expect(stderr).toBe('');
    expect(await readdir(output)).toEqual(['index.html']);
    const html = await readFile(join(output, 'index.html'), 'utf8');
    expect(html).toContain('<span class="marker">no marker set</span>');
    expect(html).not.toContain('synthetic-preview');
    expect(html).not.toContain('unrelated-private');
    expect(html).toBe(markedHtml.replace(
      '<span class="marker">synthetic-preview&lt;&amp;&quot;&#39;marker</span>',
      '<span class="marker">no marker set</span>',
    ));
    expect(await fixtureHashes()).toEqual(before);
  });

  it.each([syntheticMarker, '', ' '])('rejects a present marker (%j) before creating output', async (marker) => {
    const output = join(await temporaryDirectory(), 'preview');
    await expect(exportCommand(output, marker, true)).rejects.toMatchObject(failure);
    expect(existsSync(output)).toBe(false);
  });

  it('still rejects output inside the repository', async () => {
    const output = join(root, 'forbidden-preview');
    await expect(exportCommand(output, undefined, true)).rejects.toMatchObject(failure);
    expect(existsSync(output)).toBe(false);
  });
});
