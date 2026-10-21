// Test-only: every lesson in full, loaded eagerly, so tests can check all content at once.
import type { Lesson, LessonContent } from '../types/lesson';
import { getLesson, lessonPath, lessons } from './registry';

const modules = import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql,microservices}/*.ts', '!./**/*.test.ts'], { eager: true });

/** Every lesson, metadata merged with content, in learning order. */
export const allLessons: Lesson[] = lessons.map((meta) => {
  const module = modules[`.${lessonPath(meta)}.ts`];
  if (!module) throw new Error(`No content module for ${meta.id}`);
  return { ...meta, ...module.default };
});

const byId = new Map(allLessons.map((lesson) => [lesson.id, lesson]));

export function fullLesson(id: string): Lesson {
  const lesson = byId.get(id);
  if (!lesson || !getLesson(id)) throw new Error(`Unknown lesson: ${id}`);
  return lesson;
}
