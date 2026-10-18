import { describe, expect, it } from 'vitest';
import type { PanelsView, Step, TreeView } from '../types/visualization';
import { int, pick, rng } from './random.testutil';
import { segmentTreeStructure } from './segmentTree';

function run(opId: string, state: number[], ...args: number[]) {
  const op = segmentTreeStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, args, []);
}

const treeOf = (step: Step) => (step.view as PanelsView).panels[1]!.view as TreeView;
const node = (step: Step, id: string) => treeOf(step).nodes.find((n) => n.id === id)!;
const initial = segmentTreeStructure.initial;

describe('segment tree', () => {
  it('draws each node with its sum and its range as a badge', () => {
    const tree = segmentTreeStructure.view(initial) as PanelsView;
    const nodes = (tree.panels[1]!.view as TreeView).nodes;
    expect(nodes).toHaveLength(15);
    expect(nodes.find((n) => n.id === 's0-7')).toMatchObject({ value: 37, badge: '0–7' });
    expect(nodes.find((n) => n.id === 's3-3')).toMatchObject({ value: 9, badge: '3' });
  });

  it('answers a range sum, using whole nodes inside the range and skipping nodes outside', () => {
    const { steps, state } = run('query', initial, 2, 6);
    const last = steps.at(-1)!;
    expect(last.variables?.sum).toBe(27);
    expect(node(last, 's0-1').role).toBe('discarded');
    expect(node(last, 's2-3').role).toBe('found');
    expect(node(last, 's4-5').role).toBe('found');
    expect(node(last, 's6-6').role).toBe('found');
    expect(node(last, 's7-7').role).toBe('discarded');
    expect(state).toBe(initial);
  });

  it('updates a leaf and recomputes the sums on the way back up', () => {
    const { steps, state } = run('update', initial, 3, 1);
    expect(state).toEqual([5, 3, 7, 1, 6, 4, 1, 2]);
    expect(node(steps.at(-1)!, 's0-7').value).toBe(29);
    expect(steps.filter((s) => s.title.startsWith('Recompute'))).toHaveLength(3);
  });

  it('refuses a backwards or out-of-range query and an out-of-range update', () => {
    for (const [op, args] of [['query', [5, 2]], ['query', [0, 8]], ['query', [-1, 3]], ['update', [8, 1]]] as const) {
      const result = run(op, initial, ...args);
      expect(result.steps, `${op} ${args}`).toHaveLength(1);
      expect(result.state).toBe(initial);
    }
  });

  it('matches brute-force sums over random updates and queries', () => {
    const r = rng(13);
    let state = initial;
    for (let i = 0; i < 200; i++) {
      if (pick(r, [true, false])) {
        const index = int(r, 0, 7);
        const value = int(r, -50, 50);
        state = run('update', state, index, value).state;
        expect(state[index]).toBe(value);
      } else {
        const l = int(r, 0, 7);
        const h = int(r, l, 7);
        const { steps } = run('query', state, l, h);
        expect(steps.at(-1)!.variables?.sum).toBe(state.slice(l, h + 1).reduce((a, b) => a + b, 0));
      }
    }
  });
});
