import type { Category, Lesson, LessonContent, LessonMeta } from '../types/lesson';
import { algorithmsMeta } from './meta/algorithms';
import { dataStructuresMeta } from './meta/data-structures';
import { sqlMeta } from './meta/sql';

/**
 * Every live lesson's metadata, in recommended learning order. Pages read this without loading
 * any lesson; a lesson's content (src/lessons/<category>/<id>.ts) loads when it is opened.
 */
export const lessons: LessonMeta[] = [...dataStructuresMeta, ...algorithmsMeta, ...sqlMeta];

const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));

export function getLesson(id: string): LessonMeta | undefined {
  return byId.get(id);
}

export function lessonsIn(category: Category): LessonMeta[] {
  return lessons.filter((lesson) => lesson.category === category);
}

/** Previous and next lesson within the same category. */
export function adjacentLessons(id: string): { prev?: LessonMeta; next?: LessonMeta } {
  const lesson = byId.get(id);
  if (!lesson) return {};
  const siblings = lessonsIn(lesson.category);
  const index = siblings.indexOf(lesson);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  return { ...(prev && { prev }), ...(next && { next }) };
}

export function lessonPath(lesson: Pick<Lesson, 'category' | 'id'>): string {
  return `/${lesson.category}/${lesson.id}`;
}

type ContentImporters = Record<string, () => Promise<{ default: LessonContent }>>;

/**
 * Loads a lesson's content and merges it with its metadata. Each id gets one promise, kept even
 * when it fails: React's use() must see the same promise on every render, or a failed load would
 * suspend again on a fresh attempt instead of showing its error. Retrying reloads the page.
 */
export function createLessonLoader(metas: LessonMeta[], importers: ContentImporters): (id: string) => Promise<Lesson> {
  const known = new Map(metas.map((meta) => [meta.id, meta]));
  const loading = new Map<string, Promise<Lesson>>();
  return (id) => {
    let promise = loading.get(id);
    if (!promise) {
      const meta = known.get(id);
      const importer = meta && importers[`.${lessonPath(meta)}.ts`];
      promise = importer ? importer().then((module) => ({ ...meta, ...module.default })) : Promise.reject(new Error(`Unknown lesson: ${id}`));
      loading.set(id, promise);
    }
    return promise;
  };
}

/** One chunk per lesson: the bundler splits each matched file into its own lazily loaded module. */
export const loadLesson = createLessonLoader(
  lessons,
  import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql}/*.ts', '!./**/*.test.ts']),
);
