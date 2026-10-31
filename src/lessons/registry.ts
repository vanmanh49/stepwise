import type { Category, Lesson, LessonContent, LessonMeta } from '../types/lesson';
import { lessons } from './lessonList';

export { lessons };

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

/** The lesson an address opens, if it is exactly `<base><category>/<id>` for a live lesson. */
export function lessonIdFromPath(pathname: string, base: string): string | undefined {
  if (!pathname.startsWith(base)) return undefined;
  const [category, id, ...rest] = pathname.slice(base.length).replace(/\/$/, '').split('/');
  if (!id || rest.length > 0) return undefined;
  const lesson = byId.get(id);
  return lesson?.category === category ? id : undefined;
}

type ContentImporters = Record<string, () => Promise<{ default: LessonContent }>>;

/** A lesson's content could not be downloaded (as opposed to a bug while loading or showing it). */
export class LessonLoadError extends Error {
  constructor(id: string, cause: unknown) {
    super(`Lesson ${id} could not be downloaded`, { cause });
    this.name = 'LessonLoadError';
  }
}

/**
 * What Chrome, Firefox and Safari report when a chunk can't be fetched, and what Vite reports when
 * it can't preload one. Anything else came from running the lesson's own code.
 */
const DOWNLOAD_FAILURE = /dynamically imported module|importing a module script failed|unable to preload/i;
const isDownloadFailure = (error: unknown) => error instanceof Error && DOWNLOAD_FAILURE.test(error.message);

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
      promise = importer
        ? importer().then(
            (module) => ({ ...meta, ...module.default }),
            (error: unknown) => {
              throw isDownloadFailure(error) ? new LessonLoadError(id, error) : error;
            },
          )
        : Promise.reject(new Error(`Unknown lesson: ${id}`));
      loading.set(id, promise);
    }
    return promise;
  };
}

/** One chunk per lesson: the bundler splits each matched file into its own lazily loaded module. */
export const loadLesson = createLessonLoader(
  lessons,
  import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql,microservices,kubernetes,ai,security,networking}/*.ts', '!./**/*.test.ts']),
);
