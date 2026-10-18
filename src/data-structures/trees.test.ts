import { describe, expect, it } from 'vitest';
import type { StructureDef } from '../types/lesson';
import { sampleInputs } from './shared';
import type { View } from '../types/visualization';
import { binaryTreeStructure, levelOrderTree } from './binaryTree';
import { priorityQueueStructure } from './priorityQueue';

function run(def: StructureDef, opId: string, state: number[], ...args: number[]) {
  const op = def.ops.find((o) => o.id === opId);
  if (!op) throw new Error(`no op ${opId}`);
  return op.run(state, args, []);
}

const shown = (view: View): unknown =>
  view.kind === 'tree'
    ? view.nodes.map((n) => [n.id, n.value, n.left, n.right])
    : view.kind === 'heap'
      ? view.items.map((c) => c.value)
      : [];

const full = Array.from({ length: 15 }, (_, i) => i + 1);

describe('levelOrderTree', () => {
  it('links node i to the children at 2i+1 and 2i+2', () => {
    const tree = levelOrderTree([1, 2, 3, 4]);
    const at = Object.fromEntries(tree.nodes.map((n) => [n.id, n]));
    expect(tree.root).toBe('n0');
    expect([at['n0']!.left, at['n0']!.right]).toEqual(['n1', 'n2']);
    expect([at['n1']!.left, at['n1']!.right]).toEqual(['n3', undefined]);
  });

  it('is empty for no values', () => {
    expect(levelOrderTree([])).toEqual({ kind: 'tree', nodes: [] });
  });

  it('applies roles by position', () => {
    expect(levelOrderTree([5, 6], { 1: 'active' }).nodes[1]!.role).toBe('active');
  });
});

describe('binary tree', () => {
  const base = [1, 2, 3, 4, 5];

  it('inserts at the first free position in level order', () => {
    const result = run(binaryTreeStructure, 'insert', base, 6);
    expect(result.state).toEqual([1, 2, 3, 4, 5, 6]);
    const last = result.steps.at(-1)!.view;
    if (last.kind !== 'tree') throw new Error('expected a tree');
    expect(last.nodes.find((n) => n.value === 3)!.left).toBe('n5');
  });

  it('allows duplicate values and an empty start', () => {
    expect(run(binaryTreeStructure, 'insert', base, 1).state).toEqual([1, 2, 3, 4, 5, 1]);
    expect(run(binaryTreeStructure, 'insert', [], 9).state).toEqual([9]);
  });

  it('refuses to grow past 15 nodes', () => {
    const result = run(binaryTreeStructure, 'insert', full, 99);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual(full);
  });

  it('measures the height in levels', () => {
    expect(run(binaryTreeStructure, 'height', base).steps.at(-1)!.variables!.height).toBe(3);
    expect(run(binaryTreeStructure, 'height', [7]).steps.at(-1)!.variables!.height).toBe(1);
    expect(run(binaryTreeStructure, 'height', []).steps).toHaveLength(1);
  });

  it('walks level by level', () => {
    expect(run(binaryTreeStructure, 'levelOrder', base).steps.at(-1)!.variables!.output).toBe('1, 2, 3, 4, 5');
    expect(run(binaryTreeStructure, 'levelOrder', []).steps).toHaveLength(1);
  });
});

describe('priority queue', () => {
  const isMinHeap = (h: number[]) => h.every((v, i) => i === 0 || h[Math.floor((i - 1) / 2)]! <= v);

  it('keeps every parent no larger than its children', () => {
    let state: number[] = [];
    for (const v of [5, 2, 8, 1, 9, 3, 2]) {
      state = run(priorityQueueStructure, 'enqueue', state, v).state;
      expect(isMinHeap(state)).toBe(true);
    }
    expect(state).toHaveLength(7);
  });

  it('dequeues the smallest priority first', () => {
    let state = [2, 5, 3, 9, 7];
    const out: number[] = [];
    while (state.length > 0) {
      out.push(state[0]!);
      state = run(priorityQueueStructure, 'dequeue', state).state;
      expect(isMinHeap(state)).toBe(true);
    }
    expect(out).toEqual([2, 3, 5, 7, 9]);
  });

  it('explains empty and full queues in one step', () => {
    for (const op of ['dequeue', 'peek']) {
      const result = run(priorityQueueStructure, op, []);
      expect(result.steps).toHaveLength(1);
      expect(result.state).toEqual([]);
    }
    const result = run(priorityQueueStructure, 'enqueue', full, 0);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toEqual(full);
  });

  it('peek leaves the queue unchanged', () => {
    expect(run(priorityQueueStructure, 'peek', [2, 5, 3]).state).toEqual([2, 5, 3]);
  });
});

describe.each([
  ['binary tree', binaryTreeStructure],
  ['priority queue', priorityQueueStructure],
] as const)('%s operations', (_name, def) => {
  it.each(def.ops.map((op) => [op.id, op] as const))('%s is consistent', (_id, op) => {
    const before = [...def.initial];
    const result = op.run(def.initial, sampleInputs(op).args, []);
    const lines = def.code.split('\n').length;
    expect(def.initial).toEqual(before);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(shown(result.steps.at(-1)!.view)).toEqual(shown(def.view(result.state)));
    for (const step of result.steps) {
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });
});

describe('wording for edge cases', () => {
  it('uses the singular for a node with one child in the level-order walk', () => {
    const steps = run(binaryTreeStructure, 'levelOrder', [1, 2, 3, 4]).steps;
    const oneChild = steps.find((s) => s.title === 'Visit 2')!;
    expect(oneChild.why).toMatch(/Its child \(4\) joins the back, so it waits/);
  });
});
