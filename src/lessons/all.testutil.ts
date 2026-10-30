// Test-only: every lesson in full, loaded eagerly, so tests can check all content at once.
import { sampleInputs } from '../data-structures/shared';
import { datasets } from '../sql/datasets';
import { scriptSteps } from '../sql/scriptSteps';
import type { Lesson, LessonContent } from '../types/lesson';
import type { Step } from '../types/visualization';
import { getLesson, lessonPath, lessons } from './registry';

const modules = import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql,microservices,kubernetes,ai,security}/*.ts', '!./**/*.test.ts'], { eager: true });

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

/** The steps a lesson shows when it opens (for structures and text, its first operation). */
export function defaultSteps(lesson: Lesson): Step[] {
  const config = lesson.visualization;
  switch (config.kind) {
    case 'sort':
      return config.generate(config.initial);
    case 'search':
      return config.generate(config.initial, config.target);
    case 'structure': {
      const op = config.structure.ops[0]!;
      const { args, words } = sampleInputs(op);
      return op.run(config.structure.initial, args, words).steps;
    }
    case 'text': {
      const op = config.text.ops[0]!;
      return op.run(config.text.initial, op.arg?.sample ?? '').steps;
    }
    case 'graph':
      return config.generate(config.graphs[0]!, config.graphs[0]!.nodes[0]!.id);
    case 'form':
      return config.generate(config.presets[0]!.values);
    case 'sql': {
      const result = scriptSteps(datasets[config.dataset], config.initialQuery);
      if (!result.ok) throw new Error(result.error.message);
      return result.steps;
    }
  }
}
