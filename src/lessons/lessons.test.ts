import { describe, expect, it } from 'vitest';
import { curveForNotation } from '../components/bigo/complexities';
import { sampleInputs } from '../data-structures/shared';
import { checkExercise, probeOutcomes } from '../sql/check';
import { scriptSteps } from '../sql/scriptSteps';
import { datasets } from '../sql/datasets';
import type { Lesson } from '../types/lesson';
import type { Step } from '../types/visualization';
import { curriculum, roadmap, topicsIn } from './curriculum';
import { allLessons, fullLesson } from './all.testutil';
import { adjacentLessons, getLesson, lessonPath, lessons, lessonsIn } from './registry';

const EXPECTED_IDS = [
  'array',
  'string',
  'linked-list',
  'stack',
  'queue',
  'hash-table',
  'binary-tree',
  'binary-search-tree',
  'heap',
  'priority-queue',
  'graph',
  'trie',
  'avl-tree',
  'red-black-tree',
  'disjoint-set',
  'segment-tree',
  'fenwick-tree',
  'b-tree',
  'advanced-graph-structures',
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
  'counting-sort',
  'radix-sort',
  'recursion-fundamentals',
  'backtracking',
  'divide-and-conquer',
  'bfs',
  'dfs',
  'topological-sort',
  'tree-traversal',
  'lowest-common-ancestor',
  'dijkstra',
  'bellman-ford',
  'floyd-warshall',
  'kruskal',
  'prim',
  'fibonacci-dp',
  'knapsack',
  'coin-change',
  'lcs',
  'lis',
  'grid-dp',
  'greedy',
  'union-find',
  'kmp',
  'rabin-karp',
  'a-star',
  'network-flow',
  'advanced-graph-algorithms',
  'select-from',
  'where',
  'null-values',
  'order-by-limit',
  'distinct',
  'aggregates',
  'insert',
  'update',
  'delete',
  'group-by-having',
  'inner-join',
  'left-join',
  'subqueries',
  'self-join',
  'many-to-many',
  'create-table',
  'constraints',
  'case-expressions',
  'set-operations',
  'ctes',
  'recursive-ctes',
  'window-functions',
  'views',
  'indexes',
  'query-plans',
  'transactions',
  'isolation-levels',
  'normalization',
  'monolith-vs-microservices',
  'service-boundaries',
  'synchronous-calls',
  'api-gateway',
  'service-discovery',
  'load-balancing',
  'database-per-service',
  'timeouts',
  'retries-backoff',
  'circuit-breaker',
  'bulkhead',
  'rate-limiting',
  'message-queues',
  'pub-sub',
  'idempotency',
  'saga',
  'transactional-outbox',
  'cqrs',
  'event-sourcing',
  'distributed-tracing',
  'deployment-strategies',
  'strangler-fig',
  'service-mesh',
  'cluster-architecture',
  'pods',
  'labels-selectors',
  'desired-state-controllers',
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

describe('lesson registry', () => {
  it('contains every lesson in learning order', () => {
    expect(lessons.map((l) => l.id)).toEqual(EXPECTED_IDS);
    expect(lessonsIn('data-structures')).toHaveLength(19);
    expect(lessonsIn('algorithms')).toHaveLength(39);
    expect(lessonsIn('sql')).toHaveLength(28);
    expect(lessonsIn('microservices')).toHaveLength(23);
    expect(lessonsIn('kubernetes')).toHaveLength(4);
  });

  it('links previous and next lessons within a category', () => {
    expect(adjacentLessons('array').prev).toBeUndefined();
    expect(adjacentLessons('array').next?.id).toBe('string');
    expect(adjacentLessons('graph').next?.id).toBe('trie');
    expect(adjacentLessons('linear-search').prev).toBeUndefined();
    expect(adjacentLessons('prim').next?.id).toBe('fibonacci-dp');
    expect(adjacentLessons('unknown')).toEqual({});
  });

  it('builds lesson paths from category and id', () => {
    expect(lessonPath(getLesson('bfs')!)).toBe('/algorithms/bfs');
    expect(getLesson('nope')).toBeUndefined();
  });
});

describe.each(allLessons.map((l) => [l.id, l] as const))('lesson %s', (_id, lesson) => {
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
    if (lesson.category !== 'sql' && lesson.category !== 'microservices' && lesson.category !== 'kubernetes') {
      expect(lesson.complexity!.rows.length).toBeGreaterThanOrEqual(1);
      expect(lesson.complexity!.curves.length).toBeGreaterThanOrEqual(1);
    }
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

  it('runs every form preset', () => {
    const config = lesson.visualization;
    if (config.kind !== 'form') return;
    expect(config.presets.length).toBeGreaterThanOrEqual(1);
    for (const preset of config.presets) expect(config.generate(preset.values).length, preset.label).toBeGreaterThanOrEqual(3);
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

describe.each(allLessons.filter((l) => l.category === 'sql').map((l) => [l.id, l] as const))('SQL lesson %s', (_id, lesson) => {
  const config = lesson.visualization;
  if (config.kind !== 'sql') throw new Error(`${lesson.id} must use the sql visualization`);
  const db = datasets[config.dataset];

  it('starts from its example query and has no Big O section', () => {
    expect(lesson.complexity).toBeUndefined();
    expect(lesson.code).toBe(config.initialQuery);
  });

  it('offers examples that run, failing only when their label says so', () => {
    expect(config.examples.length).toBeGreaterThanOrEqual(3);
    expect(config.examples.length).toBeLessThanOrEqual(4);
    for (const example of [{ label: 'opening script', query: config.initialQuery }, ...config.examples]) {
      const result = scriptSteps(db, example.query);
      if (!result.ok) throw new Error(`${example.label}: ${result.error.message}`);
      // An example meant to show a broken rule is labelled "Fails: …"; the opening script may also show one.
      if (example.label.startsWith('Fails:')) expect(result.result.ok, example.label).toBe(false);
      else if (example.label !== 'opening script') expect(result.result.ok, example.label).toBe(true);
    }
  });

  it('has exercises whose solutions pass their own check', () => {
    expect(config.exercises.length).toBeGreaterThanOrEqual(2);
    expect(config.exercises.length).toBeLessThanOrEqual(3);
    expect(new Set(config.exercises.map((e) => e.id)).size).toBe(config.exercises.length);
    for (const exercise of config.exercises) {
      expect(checkExercise(db, exercise.solution, exercise), exercise.id).toEqual({ status: 'correct' });
    }
  });

  it('has probes that check something real', () => {
    for (const exercise of config.exercises.filter((e) => e.probes)) {
      const outcomes = probeOutcomes(db, exercise.solution, exercise.probes!);
      if (!Array.isArray(outcomes)) throw new Error(`${exercise.id}: ${outcomes.message}`);
      expect(outcomes.filter((o) => o.kind === 'error'), exercise.id).toEqual([]);
      // Doing nothing must never pass.
      expect(checkExercise(db, '', exercise).status, exercise.id).not.toBe('correct');
    }
  });

  it('asks a quiz question about a table', () => {
    expect(lesson.quiz.some((q) => q.view?.kind === 'table')).toBe(true);
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

  it('lists the SQL course in order', () => {
    expect(topicsIn('sql').map((t) => t.id)).toEqual([
      'select-from',
      'where',
      'null-values',
      'order-by-limit',
      'distinct',
      'aggregates',
      'insert',
      'update',
      'delete',
      'group-by-having',
      'inner-join',
      'left-join',
      'subqueries',
      'self-join',
      'many-to-many',
      'create-table',
      'constraints',
      'case-expressions',
      'set-operations',
      'ctes',
      'recursive-ctes',
      'window-functions',
      'views',
      'indexes',
      'query-plans',
      'transactions',
      'isolation-levels',
      'normalization',
    ]);
  });

  it('lists the Microservices course in order', () => {
    expect(topicsIn('microservices').map((t) => t.id)).toEqual([
      'monolith-vs-microservices',
      'service-boundaries',
      'synchronous-calls',
      'api-gateway',
      'service-discovery',
      'load-balancing',
      'database-per-service',
      'timeouts',
      'retries-backoff',
      'circuit-breaker',
      'bulkhead',
      'rate-limiting',
      'message-queues',
      'pub-sub',
      'idempotency',
      'saga',
      'transactional-outbox',
      'cqrs',
      'event-sourcing',
      'distributed-tracing',
      'deployment-strategies',
      'strangler-fig',
      'service-mesh',
    ]);
    expect(topicsIn('microservices').map((t) => t.group)).toEqual([
      ...Array<string>(7).fill('Foundations'),
      ...Array<string>(8).fill('Communication & Resilience'),
      ...Array<string>(8).fill('Data & Operations'),
    ]);
  });

  it('lists the Kubernetes course in order', () => {
    expect(topicsIn('kubernetes').map((t) => t.id)).toEqual([
      'cluster-architecture',
      'pods',
      'labels-selectors',
      'desired-state-controllers',
      'replicasets',
      'deployments-rolling-updates',
      'services-kube-proxy',
      'scheduler',
      'requests-limits',
      'probes',
      'taints-tolerations',
      'affinity',
      'hpa',
      'cluster-autoscaler',
      'draining-pdb',
      'configmaps-secrets',
      'volumes-pv-pvc',
      'statefulsets',
      'daemonsets',
      'jobs-cronjobs',
      'ingress',
      'network-policies',
      'operators-crds',
    ]);
    expect(topicsIn('kubernetes').map((t) => t.group)).toEqual([
      ...Array<string>(7).fill('Foundations'),
      ...Array<string>(8).fill('Scheduling & Health'),
      ...Array<string>(8).fill('Workloads & Operations'),
    ]);
  });

  it('drops the topic that duplicated the Binary Search Tree lesson', () => {
    expect(curriculum.some((t) => t.id === 'bst-operations')).toBe(false);
    expect(getLesson('binary-search-tree')!.keywords).toContain('bst operations');
  });

  it('gives Divide and Conquer random data with negative values, so the best run is not always everything', () => {
    const config = fullLesson('divide-and-conquer').visualization;
    expect(config.kind === 'sort' && (config.randomMin ?? 1)).toBeLessThan(0);
  });

  it('has a live lesson for every algorithms topic', () => {
    expect(topicsIn('algorithms').filter((t) => !getLesson(t.id)).map((t) => t.id)).toEqual([]);
    expect(lessonsIn('algorithms').map((l) => l.id)).toEqual(topicsIn('algorithms').map((t) => t.id));
  });

  it('has a live lesson for every microservices topic', () => {
    expect(topicsIn('microservices').filter((t) => !getLesson(t.id)).map((t) => t.id)).toEqual([]);
    expect(lessonsIn('microservices').map((l) => l.id)).toEqual(topicsIn('microservices').map((t) => t.id));
  });

  it('maps every algorithm to a Big O curve', () => {
    for (const lesson of lessonsIn('algorithms')) {
      const average = lesson.complexity!.rows[0]!.average;
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
