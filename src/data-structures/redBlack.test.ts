import { describe, expect, it } from 'vitest';
import type { Step, TreeView } from '../types/visualization';
import { int, pick, rng } from './random.testutil';
import { MAX_RB_NODES, redBlackStructure, type RBState } from './redBlack';

function run(opId: string, state: RBState, value: number) {
  const op = redBlackStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, [value], []);
}

const B = (v: number): [number, boolean] => [v, false];
const R = (v: number): [number, boolean] => [v, true];
const titles = (steps: Step[]) => steps.map((s) => s.title);

interface Tree {
  value: number;
  red: boolean;
  left?: Tree;
  right?: Tree;
}

function rebuild(state: RBState): Tree | undefined {
  let root: Tree | undefined;
  for (const [value, red] of state) {
    const node: Tree = { value, red };
    if (!root) root = node;
    else {
      let at = root;
      for (;;) {
        const side = value < at.value ? 'left' : 'right';
        if (!at[side]) {
          at[side] = node;
          break;
        }
        at = at[side]!;
      }
    }
  }
  return root;
}

/** Checks the red-black rules; returns the black height. */
function check(n: Tree | undefined, low = -Infinity, high = Infinity): number {
  if (!n) return 1;
  expect(n.value).toBeGreaterThan(low);
  expect(n.value).toBeLessThan(high);
  if (n.red) {
    expect(n.left?.red ?? false, `red ${n.value} has a red child`).toBe(false);
    expect(n.right?.red ?? false, `red ${n.value} has a red child`).toBe(false);
  }
  const left = check(n.left, low, n.value);
  const right = check(n.right, n.value, high);
  expect(left, `black heights differ under ${n.value}`).toBe(right);
  return left + (n.red ? 0 : 1);
}

const inorder = (n?: Tree): number[] => (n ? [...inorder(n.left), n.value, ...inorder(n.right)] : []);

describe('red-black insert', () => {
  it('recolours when the uncle is red, then blackens the root', () => {
    const { steps, state } = run('insert', [B(10), R(5), R(15)], 1);
    expect(titles(steps)).toContain('Uncle 15 is red: recolour');
    expect(titles(steps)).toContain('Make the root black');
    expect(state).toEqual([B(10), B(5), R(1), B(15)]);
  });

  it('rotates the parent in the triangle case, then the grandparent in the line case', () => {
    const { steps, state } = run('insert', [B(10), R(5)], 7);
    const names = titles(steps);
    expect(names.some((t) => t.startsWith('Triangle'))).toBe(true);
    expect(names.some((t) => t.startsWith('Line'))).toBe(true);
    expect(state).toEqual([B(7), R(5), R(10)]);
  });

  it('rotates the grandparent in the line case', () => {
    const { state } = run('insert', [B(10), R(5)], 1);
    expect(state).toEqual([B(5), R(1), R(10)]);
  });

  it('colours each node in the view', () => {
    const view = redBlackStructure.view([B(10), R(5)]) as TreeView;
    expect(view.nodes.map((n) => [n.value, n.color])).toEqual([[10, 'black'], [5, 'red']]);
  });
});

describe('red-black delete', () => {
  it('needs no fix-up when a red node is removed', () => {
    const { steps, state } = run('delete', [B(10), R(5), R(15)], 5);
    expect(titles(steps).some((t) => t.startsWith('Sibling'))).toBe(false);
    expect(state).toEqual([B(10), R(15)]);
  });

  it('fixes a double black left at an empty spot', () => {
    const { steps, state } = run('delete', [B(10), B(5), B(15)], 5);
    expect(titles(steps)).toContain('Sibling 15 and both its children are black: recolour and move up');
    expect(state).toEqual([B(10), R(15)]);
  });

  it('uses the successor for a node with two children', () => {
    const { state } = run('delete', [B(10), B(5), B(15), R(12), R(20)], 10);
    check(rebuild(state));
    expect(inorder(rebuild(state))).toEqual([5, 12, 15, 20]);
  });

  it('removes the last node', () => {
    const { steps, state } = run('delete', [B(4)], 4);
    expect(state).toEqual([]);
    expect((steps.at(-1)!.view as TreeView).nodes).toEqual([]);
  });

  it('refuses a 16th node', () => {
    let state: RBState = [];
    for (let v = 1; v <= MAX_RB_NODES; v++) state = run('insert', state, v).state;
    const result = run('insert', state, 99);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toBe(state);
  });
});

describe('red-black tree over random operations', () => {
  it('keeps every rule, matches a sorted set, and meets every fix-up case', () => {
    const r = rng(9);
    let state = redBlackStructure.initial;
    const reference = new Set(state.map(([v]) => v));
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) {
      const op = pick(r, ['insert', 'insert', 'delete', 'delete', 'search']);
      const value = int(r, 1, 30);
      const result = run(op, state, value);
      state = result.state;
      for (const t of titles(result.steps)) seen.add(t.replace(/\d+/g, '#'));
      if (op === 'insert' && reference.size < MAX_RB_NODES) reference.add(value);
      if (op === 'delete') reference.delete(value);
      const root = rebuild(state);
      expect(root?.red ?? false).toBe(false);
      check(root);
      expect(inorder(root)).toEqual([...reference].sort((a, b) => a - b));
    }
    for (const name of [
      'Uncle # is red: recolour',
      'Sibling # is red: rotate and recolour',
      'Sibling # is red: rotate and recolour (mirrored)',
      'Sibling # and both its children are black: recolour and move up',
      "Sibling #'s near child is red: rotate the sibling",
      "Sibling #'s near child is red: rotate the sibling (mirrored)",
      "Sibling #'s far child is red: rotate the parent and recolour",
      "Sibling #'s far child is red: rotate the parent and recolour (mirrored)",
    ]) {
      expect(seen, name).toContain(name);
    }
  });
});
