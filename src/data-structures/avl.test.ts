import { describe, expect, it } from 'vitest';
import type { Step, TreeView } from '../types/visualization';
import { avlStructure, MAX_AVL_NODES } from './avl';
import { build, type Node } from './bst';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: number[], value: number) {
  const op = avlStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, [value], []);
}

const insertAll = (values: number[], state: number[] = []) =>
  values.reduce<{ state: number[]; steps: Step[] }>((acc, v) => {
    const result = run('insert', acc.state, v);
    return { state: result.state, steps: [...acc.steps, ...result.steps] };
  }, { state, steps: [] });

const rotations = (steps: Step[]) => steps.filter((s) => s.title.includes('rotation')).map((s) => s.title);
const height = (n?: Node): number => (n ? 1 + Math.max(height(n.left), height(n.right)) : 0);
const inorder = (n?: Node): number[] => (n ? [...inorder(n.left), n.value, ...inorder(n.right)] : []);

function checkBalanced(n?: Node): void {
  if (!n) return;
  expect(Math.abs(height(n.left) - height(n.right)), `node ${n.value}`).toBeLessThanOrEqual(1);
  checkBalanced(n.left);
  checkBalanced(n.right);
}

describe('AVL tree', () => {
  it('fixes a left-left imbalance with one right rotation', () => {
    const { state, steps } = insertAll([30, 20, 10]);
    expect(rotations(steps)).toEqual(['Right rotation at 30 (LL case)']);
    expect(state[0]).toBe(20);
  });

  it('fixes a right-right imbalance with one left rotation', () => {
    const { state, steps } = insertAll([10, 20, 30]);
    expect(rotations(steps)).toEqual(['Left rotation at 10 (RR case)']);
    expect(state[0]).toBe(20);
  });

  it('fixes a left-right imbalance with two rotations', () => {
    const { state, steps } = insertAll([30, 10, 20]);
    expect(rotations(steps)).toEqual(['Left rotation at 10 (LR case, step 1 of 2)', 'Right rotation at 30 (LR case, step 2 of 2)']);
    expect(state).toEqual([20, 10, 30]);
  });

  it('fixes a right-left imbalance with two rotations', () => {
    const { state, steps } = insertAll([10, 30, 20]);
    expect(rotations(steps)).toEqual(['Right rotation at 30 (RL case, step 1 of 2)', 'Left rotation at 10 (RL case, step 2 of 2)']);
    expect(state).toEqual([20, 10, 30]);
  });

  it('rebalances after a delete', () => {
    const { state, steps } = run('delete', [20, 10, 30, 40], 10);
    expect(rotations(steps)).toEqual(['Left rotation at 20 (RR case)']);
    expect(state).toEqual([30, 20, 40]);
  });

  it('shows each node’s balance factor as its badge', () => {
    const view = avlStructure.view([20, 10, 30, 40]) as TreeView;
    expect(Object.fromEntries(view.nodes.map((n) => [n.value, n.badge]))).toEqual({ 20: '-1', 10: '0', 30: '-1', 40: '0' });
  });

  it('checks every ancestor on the way back up', () => {
    const { steps } = run('insert', [20, 10, 30, 40], 50);
    expect(steps.filter((s) => s.title.startsWith('Check')).map((s) => s.title.split(':')[0])).toEqual(['Check 40', 'Check 30']);
  });

  it('empties the tree when the last node is deleted', () => {
    const { state, steps } = run('delete', [7], 7);
    expect(state).toEqual([]);
    expect((steps.at(-1)!.view as TreeView).nodes).toEqual([]);
  });

  it('refuses a 16th node', () => {
    const full = insertAll(Array.from({ length: MAX_AVL_NODES }, (_, i) => i + 1)).state;
    const result = run('insert', full, 99);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toBe(full);
  });

  it('stays a balanced BST holding the same values as a set over random operations', () => {
    const r = rng(5);
    let state = avlStructure.initial;
    const reference = new Set(state);
    for (let i = 0; i < 300; i++) {
      const op = pick(r, ['insert', 'insert', 'delete', 'search']);
      const value = int(r, 1, 40);
      state = run(op, state, value).state;
      if (op === 'insert' && reference.size < MAX_AVL_NODES) reference.add(value);
      if (op === 'delete') reference.delete(value);
      const root = build(state);
      expect(inorder(root)).toEqual([...reference].sort((a, b) => a - b));
      checkBalanced(root);
    }
  });
});
