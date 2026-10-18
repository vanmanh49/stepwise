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
 * Loads a lesson's content and merges it with its metadata. Each id is loaded once; a failed
 * load is forgotten so that trying again (after a network error) imports it again.
 */
export function createLessonLoader(metas: LessonMeta[], importers: ContentImporters): (id: string) => Promise<Lesson> {
  const known = new Map(metas.map((meta) => [meta.id, meta]));
  const loading = new Map<string, Promise<Lesson>>();
  return (id) => {
    const cached = loading.get(id);
    if (cached) return cached;
    const meta = known.get(id);
    const importer = meta && importers[`.${lessonPath(meta)}.ts`];
    const promise = importer
      ? importer().then(
          (module) => ({ ...meta, ...module.default }),
          (error: unknown) => {
            loading.delete(id);
            throw error;
          },
        )
      : Promise.reject(new Error(`Unknown lesson: ${id}`));
    if (importer) loading.set(id, promise);
    return promise;
  };
}

/** One chunk per lesson: the bundler splits each matched file into its own lazily loaded module. */
export const loadLesson = createLessonLoader(
  lessons,
  import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql}/*.ts', '!./**/*.test.ts']),
);
