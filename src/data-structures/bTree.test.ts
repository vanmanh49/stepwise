import { describe, expect, it } from 'vitest';
import type { BTreeView, Step } from '../types/visualization';
import { bTreeStructure, MAX_BTREE_KEYS, type BNode } from './bTree';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: BNode, value: number) {
  const op = bTreeStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, [value], []);
}

const leaf = (...keys: number[]): BNode => ({ keys, children: [] });
const inner = (keys: number[], ...children: BNode[]): BNode => ({ keys, children });
const titles = (steps: Step[]) => steps.map((s) => s.title);
const keysOf = (n: BNode): number[] => (n.children.length === 0 ? n.keys : n.children.flatMap((c, i) => [...keysOf(c), ...(i < n.keys.length ? [n.keys[i]!] : [])]));
const depths = (n: BNode, d = 0): number[] => (n.children.length === 0 ? [d] : n.children.flatMap((c) => depths(c, d + 1)));

function checkShape(n: BNode, isRoot = true): void {
  expect(n.keys.length).toBeLessThanOrEqual(3);
  if (!isRoot) expect(n.keys.length).toBeGreaterThanOrEqual(1);
  if (n.children.length > 0) expect(n.children).toHaveLength(n.keys.length + 1);
  for (const c of n.children) checkShape(c, false);
}

describe('B-tree', () => {
  it('splits a leaf of 4 keys, moving the third key up into a new root', () => {
    let state: BNode = leaf();
    let steps: Step[] = [];
    for (const v of [1, 2, 3, 4]) ({ state, steps } = run('insert', state, v));
    expect(state).toEqual(inner([3], leaf(1, 2), leaf(4)));
    expect(titles(steps).some((t) => t.startsWith('Split'))).toBe(true);
  });

  it('draws nodes without leaf links', () => {
    const view = bTreeStructure.view(inner([3], leaf(1, 2), leaf(4))) as BTreeView;
    expect(view.linked).toBe(false);
    expect(view.nodes.map((n) => n.keys)).toEqual([['3'], ['1', '2'], ['4']]);
  });

  it('finds a key in an inner node and reports a missing key', () => {
    const state = inner([10], leaf(5), leaf(20));
    expect(titles(run('search', state, 10).steps).at(-1)).toBe('Found 10');
    expect(titles(run('search', state, 7).steps).at(-1)).toBe('7 is not in the tree');
  });

  it('borrows from the left sibling', () => {
    const { steps, state } = run('delete', inner([10], leaf(3, 5), leaf(20)), 20);
    expect(titles(steps).some((t) => t.startsWith('Borrow from the left'))).toBe(true);
    expect(state).toEqual(inner([5], leaf(3), leaf(10)));
  });

  it('borrows from the right sibling', () => {
    const { steps, state } = run('delete', inner([10], leaf(5), leaf(20, 30)), 5);
    expect(titles(steps).some((t) => t.startsWith('Borrow from the right'))).toBe(true);
    expect(state).toEqual(inner([20], leaf(10), leaf(30)));
  });

  it('merges with a sibling and shrinks the root', () => {
    const { steps, state } = run('delete', inner([10], leaf(5), leaf(20)), 20);
    expect(titles(steps).some((t) => t.startsWith('Merge'))).toBe(true);
    expect(titles(steps).some((t) => t.startsWith('The root is empty'))).toBe(true);
    expect(state).toEqual(leaf(5, 10));
  });

  it('replaces an inner key with its predecessor and fixes the leaf it came from', () => {
    const { steps, state } = run('delete', inner([10], leaf(5), leaf(20)), 10);
    expect(titles(steps).some((t) => t.includes('predecessor 5'))).toBe(true);
    expect(state).toEqual(leaf(5, 20));
  });

  it('borrows through an inner node, moving a child across', () => {
    const tree = inner([20], inner([5, 10], leaf(1), leaf(7), leaf(15)), inner([30], leaf(25), leaf(35)));
    const { state } = run('delete', tree, 35);
    checkShape(state);
    expect(keysOf(state)).toEqual([1, 5, 7, 10, 15, 20, 25, 30]);
    expect(new Set(depths(state)).size).toBe(1);
  });

  it('leaves an empty root leaf after deleting the last key', () => {
    const { state, steps } = run('delete', leaf(4), 4);
    expect(state).toEqual(leaf());
    expect((steps.at(-1)!.view as BTreeView).nodes[0]!.keys).toEqual([]);
  });

  it('refuses a 16th key', () => {
    let state: BNode = leaf();
    for (let v = 1; v <= MAX_BTREE_KEYS; v++) state = run('insert', state, v).state;
    const result = run('insert', state, 99);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toBe(state);
  });

  it('keeps its shape and matches a sorted set over random operations', () => {
    const r = rng(21);
    let state = bTreeStructure.initial;
    const reference = new Set(keysOf(state));
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const op = pick(r, ['insert', 'insert', 'delete', 'delete', 'search']);
      const value = int(r, 1, 30);
      const result = run(op, state, value);
      state = result.state;
      for (const t of titles(result.steps)) seen.add(t.split(/[:\d]/)[0]!.trim());
      if (op === 'insert' && reference.size < MAX_BTREE_KEYS) reference.add(value);
      if (op === 'delete') reference.delete(value);
      checkShape(state);
      expect(new Set(depths(state)).size).toBe(1);
      expect(keysOf(state)).toEqual([...reference].sort((a, b) => a - b));
    }
    for (const name of ['Borrow from the left sibling', 'Borrow from the right sibling', 'Merge with the left sibling', 'Merge with the right sibling', 'Split']) {
      expect([...seen].some((t) => t.startsWith(name)), name).toBe(true);
    }
  });
});
