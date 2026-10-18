import { describe, expect, it } from 'vitest';
import { simpleGraph } from '../algorithms/graph/graphs';
import type { StructureDef } from '../types/lesson';
import { sampleInputs } from './shared';
import type { Step, View } from '../types/visualization';
import { arrayStructure } from './array';
import { bstStructure } from './bst';
import { adjacencyCode, adjacencySteps } from './graph';
import { heapStructure } from './heap';
import { linkedListStructure } from './linkedList';
import { queueStructure } from './queue';
import { stackStructure } from './stack';

function run(def: StructureDef, opId: string, state: number[], ...args: number[]) {
  const op = def.ops.find((o) => o.id === opId);
  if (!op) throw new Error(`no op ${opId}`);
  return op.run(state, args, []);
}

/** The data a view shows, without roles or pointers. */
function shown(view: View): unknown {
  switch (view.kind) {
    case 'array':
      return view.cells.map((c) => c.value);
    case 'linked-list':
      return view.nodes.map((c) => c.value);
    case 'stack':
    case 'queue':
    case 'heap':
      return view.items.map((c) => c.value);
    case 'tree':
      return view.nodes.map((n) => [n.value, n.left, n.right]).sort();
    case 'graph':
      return view.nodes.map((n) => n.id);
  }
}

const hasRole = (step: Step, role: string) => JSON.stringify(step.view).includes(`"role":"${role}"`);

describe('array', () => {
  const base = [10, 20, 30];

  it('inserts, deletes, updates and swaps', () => {
    expect(run(arrayStructure, 'insert', base, 1, 9).state).toEqual([10, 9, 20, 30]);
    expect(run(arrayStructure, 'insert', base, 3, 9).state).toEqual([10, 20, 30, 9]);
    expect(run(arrayStructure, 'delete', base, 0).state).toEqual([20, 30]);
    expect(run(arrayStructure, 'update', base, 2, 5).state).toEqual([10, 20, 5]);
    expect(run(arrayStructure, 'swap', base, 0, 2).state).toEqual([30, 20, 10]);
  });

  it('marks the found cell when searching', () => {
    expect(hasRole(run(arrayStructure, 'search', base, 30).steps.at(-1)!, 'found')).toBe(true);
    expect(hasRole(run(arrayStructure, 'search', base, 99).steps.at(-1)!, 'found')).toBe(false);
  });

  it('explains an out-of-range index in one step', () => {
    const result = run(arrayStructure, 'access', base, 7);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual(base);
  });

  it('refuses to grow past 10 items', () => {
    const full = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = run(arrayStructure, 'insert', full, 0, 11);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual(full);
  });
});

describe('linked list', () => {
  const base = [10, 20, 30];

  it('inserts at the head and the tail', () => {
    expect(run(linkedListStructure, 'insertHead', base, 5).state).toEqual([5, 10, 20, 30]);
    expect(run(linkedListStructure, 'insertTail', base, 5).state).toEqual([10, 20, 30, 5]);
    expect(run(linkedListStructure, 'insertTail', [], 5).state).toEqual([5]);
  });

  it('deletes the first node holding a value', () => {
    expect(run(linkedListStructure, 'delete', base, 20).state).toEqual([10, 30]);
    expect(run(linkedListStructure, 'delete', base, 10).state).toEqual([20, 30]);
    expect(run(linkedListStructure, 'delete', base, 99).state).toEqual(base);
    expect(run(linkedListStructure, 'delete', [], 1).steps).toHaveLength(1);
  });

  it('marks the found node when searching', () => {
    expect(hasRole(run(linkedListStructure, 'search', base, 30).steps.at(-1)!, 'found')).toBe(true);
    expect(hasRole(run(linkedListStructure, 'search', base, 99).steps.at(-1)!, 'found')).toBe(false);
  });
});

describe('stack', () => {
  it('pushes and pops at the top', () => {
    const pushed = run(stackStructure, 'push', [1, 2], 4).state;
    expect(pushed).toEqual([1, 2, 4]);
    expect(run(stackStructure, 'pop', pushed).state).toEqual([1, 2]);
  });

  it('explains popping an empty stack in one step', () => {
    const result = run(stackStructure, 'pop', []);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual([]);
  });

  it('peek leaves the stack unchanged', () => {
    expect(run(stackStructure, 'peek', [1, 2]).state).toEqual([1, 2]);
  });
});

describe('queue', () => {
  it('enqueues at the rear and dequeues from the front', () => {
    expect(run(queueStructure, 'enqueue', [1, 2], 4).state).toEqual([1, 2, 4]);
    expect(run(queueStructure, 'dequeue', [1, 2, 4]).state).toEqual([2, 4]);
  });

  it('explains dequeuing an empty queue in one step', () => {
    const result = run(queueStructure, 'dequeue', []);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual([]);
  });
});

describe('binary search tree', () => {
  const build = (values: number[]) =>
    values.reduce<number[]>((state, v) => run(bstStructure, 'insert', state, v).state, []);
  const inorderOutput = (state: number[]) => run(bstStructure, 'inorder', state).steps.at(-1)!.variables!.output;
  const tree = build([8, 3, 10, 1, 6, 14]);

  it('stores the tree as its preorder traversal', () => {
    expect(tree).toEqual([8, 3, 1, 6, 10, 14]);
  });

  it('reads values in ascending order with an inorder traversal', () => {
    expect(inorderOutput(tree)).toBe('1, 3, 6, 8, 10, 14');
  });

  it('deletes a node with two children using its inorder successor', () => {
    expect(run(bstStructure, 'delete', tree, 3).state).toEqual([8, 6, 1, 10, 14]);
    expect(run(bstStructure, 'delete', tree, 8).state).toEqual([10, 3, 1, 6, 14]);
  });

  it('deletes a leaf and a node with one child', () => {
    expect(inorderOutput(run(bstStructure, 'delete', tree, 14).state)).toBe('1, 3, 6, 8, 10');
    expect(inorderOutput(run(bstStructure, 'delete', tree, 10).state)).toBe('1, 3, 6, 8, 14');
  });

  it('ignores duplicates and missing values', () => {
    expect(run(bstStructure, 'insert', tree, 6).state).toEqual(tree);
    expect(run(bstStructure, 'delete', tree, 99).state).toEqual(tree);
  });

  it('marks the found node when searching', () => {
    expect(hasRole(run(bstStructure, 'search', tree, 6).steps.at(-1)!, 'found')).toBe(true);
    expect(hasRole(run(bstStructure, 'search', tree, 7).steps.at(-1)!, 'found')).toBe(false);
  });

  it('refuses to grow past 12 nodes', () => {
    const full = build([50, 25, 75, 12, 37, 62, 87, 6, 18, 31, 43, 56]);
    expect(full).toHaveLength(12);
    const result = run(bstStructure, 'insert', full, 99);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual(full);
  });
});

describe('heap', () => {
  const isMaxHeap = (h: number[]) => h.every((v, i) => i === 0 || h[Math.floor((i - 1) / 2)]! >= v);

  it('keeps every parent at least as large as its children', () => {
    let state: number[] = [];
    for (const v of [10, 20, 5, 30, 25, 30, 1]) {
      state = run(heapStructure, 'insert', state, v).state;
      expect(isMaxHeap(state)).toBe(true);
    }
    expect(state).toHaveLength(7);
  });

  it('extracts values in descending order', () => {
    let state = [50, 30, 40, 10, 20];
    const out: number[] = [];
    while (state.length > 0) {
      out.push(state[0]!);
      state = run(heapStructure, 'extractMax', state).state;
      expect(isMaxHeap(state)).toBe(true);
    }
    expect(out).toEqual([50, 40, 30, 20, 10]);
  });

  it('explains extracting from an empty heap in one step', () => {
    const result = run(heapStructure, 'extractMax', []);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual([]);
  });
});

describe.each([
  ['array', arrayStructure],
  ['linked list', linkedListStructure],
  ['stack', stackStructure],
  ['queue', queueStructure],
  ['binary search tree', bstStructure],
  ['heap', heapStructure],
] as const)('%s operations', (_name, def) => {
  it.each(def.ops.map((op) => [op.id, op] as const))('%s is consistent', (_id, op) => {
    const before = [...def.initial];
    const result = op.run(def.initial, sampleInputs(op).args, []);
    const lines = def.code.split('\n').length;

    expect(def.initial).toEqual(before);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(shown(result.steps.at(-1)!.view)).toEqual(shown(def.view(result.state)));
    expect(result.steps[0]!.view.kind).toBe(def.view(def.initial).kind);
    for (const step of result.steps) {
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });
});

describe('adjacencySteps', () => {
  it('ends with every node listing its neighbours', () => {
    const steps = adjacencySteps(simpleGraph, 'A');
    const last = steps.at(-1)!;
    if (last.view.kind !== 'graph') throw new Error('expected a graph view');
    const rows = last.view.table!.rows;
    expect(Object.keys(rows)).toHaveLength(simpleGraph.nodes.length);
    expect(rows['A']).toEqual(['B, C']);
    expect(rows['E']).toEqual(['B, C, G']);
    const lines = adjacencyCode.split('\n').length;
    expect(steps.every((s) => s.codeLine! >= 1 && s.codeLine! <= lines)).toBe(true);
  });
});

describe('step explanations match what happens', () => {
  it('does not talk about three values when a heap node has one child', () => {
    const steps = run(heapStructure, 'extractMax', [9, 8, 7, 6, 5]).steps;
    const oneChild = steps.filter((s) => s.title.includes('its child '));
    expect(oneChild.length).toBeGreaterThan(0);
    expect(oneChild.every((s) => !s.why.includes('three'))).toBe(true);
  });

  it('does not claim values move when deleting the last array item', () => {
    const steps = run(arrayStructure, 'delete', [10, 20, 30], 2).steps;
    expect(steps[0]!.why).not.toMatch(/must move/);
  });

  it('keeps head on null until the new node is linked into an empty list', () => {
    const steps = run(linkedListStructure, 'insertHead', [], 5).steps;
    const linking = steps[1]!.view;
    if (linking.kind !== 'linked-list') throw new Error('expected a list view');
    expect(linking.pointers).toEqual({ head: 1 });
  });

  it('reports a duplicate, not a full tree, when the value already exists', () => {
    const full = [50, 25, 12, 6, 18, 37, 31, 43, 75, 62, 56, 87];
    const result = run(bstStructure, 'insert', full, 43);
    expect(result.steps.at(-1)!.title).toBe('43 is already in the tree');
    expect(result.state).toEqual(full);
  });

  it('explains that a directed edge skips the reverse entry', () => {
    const directed = { ...simpleGraph, directed: true };
    expect(adjacencySteps(directed, 'A')[1]!.why).toMatch(/undirected/);
  });
});
