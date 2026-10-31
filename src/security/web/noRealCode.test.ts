import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const filesIn = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });

const code = (folder: string) => filesIn(folder).filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));

/** Typed payloads are data. These checks fail if any path could hand one to the real browser. */
describe('no real code runs', () => {
  it.each(code('src/security/web'))('%s has no way to run text', (path) => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/\beval\(|new Function|\.innerHTML\s*=|\bfetch\(['"`]https?:|document\.write/);
  });

  it('adds no dangerouslySetInnerHTML to the components', () => {
    const uses = code('src/components').flatMap((path) => readFileSync(path, 'utf8').match(/dangerouslySetInnerHTML/g) ?? []);
    expect(uses).toHaveLength(0);
  });
});
