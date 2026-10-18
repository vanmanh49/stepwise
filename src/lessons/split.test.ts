import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonContent, LessonMeta } from '../types/lesson';
import { topicsIn } from './curriculum';
import { createLessonLoader, lessonPath, lessons, lessonsIn, loadLesson } from './registry';

const contentModules = Object.keys(import.meta.glob(['./{data-structures,algorithms,sql}/*.ts', '!./**/*.test.ts']));
const metaDir = new URL('./meta/', import.meta.url);

describe('lesson metadata and content', () => {
  it('pairs every metadata entry with exactly one content module, and the reverse', () => {
    const expected = lessons.map((l) => `.${lessonPath(l)}.ts`).toSorted();
    expect(contentModules.toSorted()).toEqual(expected);
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
  });

  it('keeps the curriculum order in every category', () => {
    for (const category of ['data-structures', 'algorithms', 'sql'] as const) {
      expect(lessonsIn(category).map((l) => l.id)).toEqual(topicsIn(category).map((t) => t.id));
    }
  });

  it('keeps metadata modules free of anything but types', () => {
    const files = readdirSync(metaDir).filter((f) => f.endsWith('.ts'));
    expect(files.toSorted()).toEqual(['algorithms.ts', 'data-structures.ts', 'sql.ts']);
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

  it('does not keep a failed load, so trying again loads again', async () => {
    const meta = { id: 'x', title: 'X', category: 'algorithms' } as LessonMeta;
    let calls = 0;
    const load = createLessonLoader([meta], {
      './algorithms/x.ts': async () => {
        calls++;
        if (calls === 1) throw new Error('network down');
        return { default: { overview: 'ok' } as LessonContent };
      },
    });
    await expect(load('x')).rejects.toThrow('network down');
    await expect(load('x')).resolves.toMatchObject({ id: 'x', overview: 'ok' });
    expect(calls).toBe(2);
  });
});
