import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonMeta } from '../types/lesson';
import { topicsIn } from './curriculum';
import { createLessonLoader, LessonLoadError, lessonIdFromPath, lessonPath, lessons, lessonsIn, loadLesson } from './registry';

const contentModules = Object.keys(import.meta.glob(['./{data-structures,algorithms,sql,microservices,kubernetes,ai,security,networking}/*.ts', '!./**/*.test.ts']));
const metaDir = new URL('./meta/', import.meta.url);

describe('lesson metadata and content', () => {
  it('pairs every metadata entry with exactly one content module, and the reverse', () => {
    const expected = lessons.map((l) => `.${lessonPath(l)}.ts`).toSorted();
    expect(contentModules.toSorted()).toEqual(expected);
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
  });

  it('keeps the curriculum order in every category', () => {
    for (const category of ['data-structures', 'algorithms', 'sql', 'microservices', 'kubernetes', 'ai'] as const) {
      const live = new Set(lessonsIn(category).map((l) => l.id));
      expect(lessonsIn(category).map((l) => l.id)).toEqual(topicsIn(category).flatMap((t) => (live.has(t.id) ? [t.id] : [])));
    }
  });

  it('keeps metadata modules free of anything but types', () => {
    const files = readdirSync(metaDir).filter((f) => f.endsWith('.ts'));
    expect(files.toSorted()).toEqual(['ai.ts', 'algorithms.ts', 'data-structures.ts', 'kubernetes.ts', 'microservices.ts', 'networking.ts', 'security.ts', 'sql.ts']);
    for (const file of files) {
      const imports = readFileSync(new URL(file, metaDir), 'utf8').split('\n').filter((line) => /^\s*import\b/.test(line));
      expect(imports.filter((line) => !/^import type\b/.test(line)), file).toEqual([]);
    }
  });
});

describe('loadLesson', () => {
  it('merges content with metadata and returns the same promise for the same id', async () => {
    const first = loadLesson('bubble-sort');
    expect(loadLesson('bubble-sort')).toBe(first);
    const lesson = await first;
    expect(lesson.title).toBe('Bubble Sort');
    expect(lesson.category).toBe('algorithms');
    expect(lesson.quiz.length).toBeGreaterThan(0);
    expect(lesson.visualization.kind).toBe('sort');
  });

  it('rejects an unknown id', async () => {
    await expect(loadLesson('nope')).rejects.toThrow('Unknown lesson: nope');
  });

  it('keeps a failed load, so use() gets the same rejected promise and shows the error instead of retrying', async () => {
    const meta = { id: 'x', title: 'X', category: 'algorithms' } as LessonMeta;
    let calls = 0;
    const load = createLessonLoader([meta], {
      './algorithms/x.ts': async () => {
        calls++;
        throw new TypeError('Failed to fetch dynamically imported module: https://x/a.js');
      },
    });
    const first = load('x');
    await expect(first).rejects.toMatchObject({ name: 'LessonLoadError' });
    expect(load('x')).toBe(first);
    expect(calls).toBe(1);
  });

  it('returns the same rejected promise for an unknown id every time', async () => {
    const load = createLessonLoader([], {});
    const first = load('nope');
    expect(load('nope')).toBe(first);
    await expect(first).rejects.toThrow('Unknown lesson: nope');
  });
});

describe('lessonIdFromPath', () => {
  it('finds the lesson in a lesson address', () => {
    expect(lessonIdFromPath('/stepwise/algorithms/bubble-sort', '/stepwise/')).toBe('bubble-sort');
    expect(lessonIdFromPath('/sql/ctes', '/')).toBe('ctes');
  });

  it('accepts the trailing slash GitHub Pages adds to a generated page', () => {
    expect(lessonIdFromPath('/stepwise/algorithms/bubble-sort/', '/stepwise/')).toBe('bubble-sort');
  });

  it('finds nothing anywhere else, so no wrong chunk is downloaded', () => {
    for (const path of [
      '/stepwise/',
      '/stepwise/algorithms',
      '/stepwise/algorithms/array',
      '/stepwise/algorithms/nope',
      '/stepwise/algorithms/bubble-sort/extra',
      '/other/algorithms/bubble-sort',
    ]) {
      expect(lessonIdFromPath(path, '/stepwise/'), path).toBeUndefined();
    }
  });
});

describe('LessonLoadError', () => {
  const meta = { id: 'x', title: 'X', category: 'algorithms' } as LessonMeta;

  it.each([
    ['Chrome', new TypeError('Failed to fetch dynamically imported module: https://x/a.js')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://x/a.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['Vite preloading', new Error('Unable to preload CSS for /a.css')],
  ])('wraps a failed download (%s) and keeps the original as its cause', async (_, original) => {
    const load = createLessonLoader([meta], { './algorithms/x.ts': () => Promise.reject(original) });
    const error = await load('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LessonLoadError);
    expect((error as LessonLoadError).cause).toBe(original);
    expect(load('x')).toBe(load('x'));
  });

  it('passes on an error thrown by the lesson module itself, so it is not called a download failure', async () => {
    const original = new ReferenceError('quiz is not defined');
    const load = createLessonLoader([meta], { './algorithms/x.ts': () => Promise.reject(original) });
    const first = load('x');
    await expect(first).rejects.toBe(original);
    expect(load('x')).toBe(first);
  });

  it('is not used for an unknown id, which is a plain error', async () => {
    const error = await createLessonLoader([], {})('nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(LessonLoadError);
  });
});
