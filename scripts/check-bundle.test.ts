import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBundle } from './check-bundle.mjs';

// The first quiz prompt in bubble-sort.ts, which the command line looks for.
const MARKER = 'Bubble sort is comparing the two highlighted values. What happens next?';

/** A fake dist folder: index.html plus assets/<name> files of the given contents. */
function dist(html: string, assets: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'check-bundle-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), html);
  for (const [name, text] of Object.entries(assets)) writeFileSync(join(dir, 'assets', name), text);
  return dir;
}

const entryTag = '<script type="module" crossorigin src="/stepwise/assets/index.js"></script>';
const preload = '<link rel="modulepreload" crossorigin href="/stepwise/assets/shared.js">';
const lessonChunk = { 'bubble-sort.js': `export default {prompt:"${MARKER}"}` };

describe('checkBundle', () => {
  it('passes when first-load files are under budget and lesson text is only in its own chunk', () => {
    const result = checkBundle(dist(entryTag + preload, { 'index.js': 'a', 'shared.js': 'b', ...lessonChunk }), MARKER);
    expect(result.problems).toEqual([]);
    expect(result.files.map((f) => f.file.split('/').pop())).toEqual(['index.js', 'shared.js']);
  });

  it('finds the entry script whatever the order of its attributes', () => {
    const html = '<script src="/stepwise/assets/index.js" type="module" crossorigin></script>';
    expect(checkBundle(dist(html, { 'index.js': 'a', ...lessonChunk }), MARKER).problems).toEqual([]);
  });

  it('fails over budget', () => {
    const result = checkBundle(dist(entryTag, { 'index.js': 'x'.repeat(2048), ...lessonChunk }), MARKER, 1);
    expect(result.problems.join()).toMatch(/over the 1 kB budget/);
  });

  it('fails when lesson text is in a first-load file', () => {
    const result = checkBundle(dist(entryTag, { 'index.js': `const q = "${MARKER}"`, ...lessonChunk }), MARKER);
    expect(result.problems.join()).toMatch(/contains lesson content/);
  });

  it('fails when it finds no entry script, rather than checking nothing', () => {
    const result = checkBundle(dist(preload, { 'shared.js': 'b', ...lessonChunk }), MARKER);
    expect(result.problems.join()).toMatch(/expected exactly one entry script, found 0/);
  });

  it('fails when it finds two entry scripts', () => {
    const result = checkBundle(dist(entryTag + entryTag.replace('index.js', 'other.js'), { 'index.js': 'a', 'other.js': 'b', ...lessonChunk }), MARKER);
    expect(result.problems.join()).toMatch(/expected exactly one entry script, found 2/);
  });

  it('ignores data-type and data-rel attributes', () => {
    const decoys = '<script data-type="module" src="/stepwise/assets/other.js"></script><link data-rel="modulepreload" href="/stepwise/assets/other.js">';
    const result = checkBundle(dist(entryTag + decoys, { 'index.js': 'a', 'other.js': 'b', ...lessonChunk }), MARKER);
    expect(result.problems).toEqual([]);
    expect(result.files.map((f) => f.file.split('/').pop())).toEqual(['index.js']);
  });

  it('runs from the command line through a symlinked path', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const link = join(mkdtempSync(join(tmpdir(), 'check-bundle-link-')), 'check-bundle.mjs');
    symlinkSync(join(root, 'scripts', 'check-bundle.mjs'), link);
    const fake = dist(entryTag, { 'index.js': 'a', ...lessonChunk });
    const run = spawnSync(process.execPath, [link, fake], { cwd: root, encoding: 'utf8' });
    expect(run.stdout).toMatch(/first load \(budget 600 kB\)/);
    expect(run.status).toBe(0);
  });

  it('fails when the lesson text is in no file at all, so the leak check would be meaningless', () => {
    const result = checkBundle(dist(entryTag, { 'index.js': 'a', 'bubble-sort.js': 'export default {}' }), MARKER);
    expect(result.problems.join()).toMatch(/not found in any built file/);
  });
});
