import { describe, expect, it } from 'vitest';
import { curveForNotation } from '../components/bigo/complexities';
import type { Lesson } from '../types/lesson';
import type { Step } from '../types/visualization';
import { curriculum, roadmap } from './curriculum';
import { adjacentLessons, getLesson, lessonPath, lessons, lessonsIn } from './registry';

const EXPECTED_IDS = [
  'array',
  'string',
  'linked-list',
  'stack',
  'queue',
  'binary-tree',
  'binary-search-tree',
  'heap',
  'priority-queue',
  'graph',
  'linear-search',
  'binary-search',
  'bubble-sort',
  'selection-sort',
  'insertion-sort',
  'two-pointers',
  'sliding-window',
  'prefix-sum',
  'merge-sort',
  'quick-sort',
  'heap-sort',
  'bfs',
  'dfs',
  'topological-sort',
  'tree-traversal',
  'dijkstra',
  'bellman-ford',
  'kruskal',
  'prim',
];

function defaultSteps(lesson: Lesson): Step[] {
  const config = lesson.visualization;
  switch (config.kind) {
    case 'sort':
      return config.generate(config.initial);
    case 'search':
      return config.generate(config.initial, config.target);
    case 'structure': {
      const op = config.structure.ops[0]!;
      return op.run(config.structure.initial, op.args.map((a) => a.sample)).steps;
    }
    case 'text': {
      const op = config.text.ops[0]!;
      return op.run(config.text.initial, op.arg?.sample ?? '').steps;
    }
    case 'graph':
      return config.generate(config.graphs[0]!, config.graphs[0]!.nodes[0]!.id);
  }
}

describe('lesson registry', () => {
  it('contains every lesson in learning order', () => {
    expect(lessons.map((l) => l.id)).toEqual(EXPECTED_IDS);
    expect(lessonsIn('data-structures')).toHaveLength(10);
    expect(lessonsIn('algorithms')).toHaveLength(19);
  });

  it('links previous and next lessons within a category', () => {
    expect(adjacentLessons('array').prev).toBeUndefined();
    expect(adjacentLessons('array').next?.id).toBe('string');
    expect(adjacentLessons('graph').next).toBeUndefined();
    expect(adjacentLessons('linear-search').prev).toBeUndefined();
    expect(adjacentLessons('prim').next).toBeUndefined();
    expect(adjacentLessons('unknown')).toEqual({});
  });

  it('builds lesson paths from category and id', () => {
    expect(lessonPath(getLesson('bfs')!)).toBe('/algorithms/bfs');
    expect(getLesson('nope')).toBeUndefined();
  });
});

describe.each(lessons.map((l) => [l.id, l] as const))('lesson %s', (_id, lesson) => {
  it('references only lessons that exist', () => {
    for (const id of [...lesson.prerequisites, ...(lesson.compareWith ?? [])]) {
      expect(getLesson(id), id).toBeDefined();
    }
  });

  it('has complete content', () => {
    expect(lesson.overview.length).toBeGreaterThan(40);
    expect(lesson.concept.length).toBeGreaterThanOrEqual(2);
    expect(lesson.howItWorks.length).toBeGreaterThanOrEqual(4);
    expect(lesson.applications.length).toBeGreaterThanOrEqual(3);
    expect(lesson.commonMistakes.length).toBeGreaterThanOrEqual(3);
    expect(lesson.summary.length).toBeGreaterThanOrEqual(3);
    expect(lesson.complexity.rows.length).toBeGreaterThanOrEqual(1);
    expect(lesson.complexity.curves.length).toBeGreaterThanOrEqual(1);
    for (const list of Object.values(lesson.prosCons)) expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('has a valid quiz', () => {
    expect(lesson.quiz.length).toBeGreaterThanOrEqual(4);
    expect(new Set(lesson.quiz.map((q) => q.id)).size).toBe(lesson.quiz.length);
    expect(new Set(lesson.quiz.map((q) => q.type)).size).toBeGreaterThanOrEqual(3);
    expect(lesson.quiz.some((q) => q.view !== undefined)).toBe(true);
    for (const question of lesson.quiz) {
      expect(question.options.length).toBeGreaterThanOrEqual(3);
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThan(question.options.length);
      expect(new Set(question.options).size).toBe(question.options.length);
      expect(question.explanation.length).toBeGreaterThan(20);
    }
  });

  it('runs its default visualization with code lines inside its code', () => {
    const steps = defaultSteps(lesson);
    const lines = lesson.code.split('\n').length;
    expect(steps.length).toBeGreaterThanOrEqual(lesson.visualization.kind === 'structure' || lesson.visualization.kind === 'text' ? 2 : 3);
    for (const step of steps) {
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });
});

describe('curriculum', () => {
  it('lists every planned topic once', () => {
    expect(curriculum.length).toBeGreaterThanOrEqual(55);
    expect(new Set(curriculum.map((t) => t.id)).size).toBe(curriculum.length);
  });

  it('includes every lesson with matching metadata', () => {
    for (const lesson of lessons) {
      const topic = curriculum.find((t) => t.id === lesson.id);
      expect(topic, lesson.id).toBeDefined();
      expect(topic).toMatchObject({ title: lesson.title, category: lesson.category, difficulty: lesson.difficulty });
    }
  });

  it('drops the topic that duplicated the Binary Search Tree lesson', () => {
    expect(curriculum.some((t) => t.id === 'bst-operations')).toBe(false);
    expect(getLesson('binary-search-tree')!.keywords).toContain('bst operations');
  });

  it('maps every algorithm to a Big O curve', () => {
    for (const lesson of lessonsIn('algorithms')) {
      const average = lesson.complexity.rows[0]!.average;
      expect(curveForNotation(average), lesson.id + ' ' + average).toBeDefined();
    }
  });

  it('builds the roadmap from known topics', () => {
    expect(roadmap.map((s) => s.stage)).toEqual(['Foundations', 'Data Structures', 'Algorithms']);
    for (const stage of roadmap) {
      for (const step of stage.steps) {
        expect(step.topicIds.length).toBeGreaterThanOrEqual(1);
        for (const id of step.topicIds) expect(curriculum.some((t) => t.id === id), id).toBe(true);
      }
    }
  });
});
