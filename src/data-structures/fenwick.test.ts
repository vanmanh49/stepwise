import { describe, expect, it } from 'vitest';
import type { GridView } from '../types/visualization';
import { fenwickArray, fenwickStructure } from './fenwick';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: number[], ...args: number[]) {
  const op = fenwickStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, args, []);
}

const initial = fenwickStructure.initial;
const brute = (values: number[], l: number, r: number) => values.slice(l - 1, r).reduce((a, b) => a + b, 0);

describe('Fenwick tree', () => {
  it('builds tree[i] as the sum of the i & -i positions ending at i', () => {
    expect(fenwickArray(initial)).toEqual([0, 5, 8, 7, 24, 6, 10, 1, 37]);
  });

  it('shows the values, the tree, what each entry covers and i in binary', () => {
    const view = fenwickStructure.view(initial) as GridView;
    expect(view.colLabels).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(view.rows.map((r) => r.label)).toEqual(['a[i]', 'tree[i]', 'covers', 'i in binary', 'i & -i']);
    expect(view.rows[2]!.cells.map((c) => c?.value)).toEqual(['1', '1–2', '3', '1–4', '5', '5–6', '7', '1–8']);
    expect(view.rows[3]!.cells[5]!.value).toBe('0110');
  });

  it('adds tree entries while dropping the lowest set bit for a prefix sum', () => {
    const { steps, state } = run('prefix', initial, 6);
    expect(steps.filter((s) => s.title.startsWith('Add tree')).map((s) => s.variables?.i)).toEqual([6, 4]);
    expect(steps.at(-1)!.variables?.sum).toBe(34);
    expect(state).toBe(initial);
  });

  it('answers a range sum as the difference of two prefix sums', () => {
    expect(run('range', initial, 2, 6).steps.at(-1)!.variables?.sum).toBe(29);
    expect(run('range', initial, 1, 8).steps.at(-1)!.variables?.sum).toBe(37);
  });

  it('adds to every entry covering i, climbing by the lowest set bit', () => {
    const { steps, state } = run('add', initial, 3, 2);
    expect(steps.filter((s) => s.title.startsWith('Add 2 to tree')).map((s) => s.variables?.i)).toEqual([3, 4, 8]);
    expect(state).toEqual([5, 3, 9, 9, 6, 4, 1, 2]);
  });

  it('refuses positions outside 1–8 and backwards ranges', () => {
    for (const [op, args] of [['prefix', [0]], ['prefix', [9]], ['range', [5, 2]], ['range', [0, 3]], ['add', [9, 1]]] as const) {
      const result = run(op, initial, ...args);
      expect(result.steps, `${op} ${args}`).toHaveLength(1);
      expect(result.state).toBe(initial);
    }
  });

  it('matches brute force over random updates and queries', () => {
    const r = rng(17);
    let state = initial;
    for (let i = 0; i < 200; i++) {
      const op = pick(r, ['add', 'prefix', 'range']);
      if (op === 'add') {
        const at = int(r, 1, 8);
        const delta = int(r, -20, 20);
        const before = state[at - 1]!;
        state = run('add', state, at, delta).state;
        expect(state[at - 1]).toBe(before + delta);
        expect(fenwickArray(state).slice(1)).toEqual(state.map((_, k) => brute(state, k + 1 - ((k + 1) & -(k + 1)) + 1, k + 1)));
      } else if (op === 'prefix') {
        const at = int(r, 1, 8);
        expect(run('prefix', state, at).steps.at(-1)!.variables?.sum).toBe(brute(state, 1, at));
      } else {
        const l = int(r, 1, 8);
        const h = int(r, l, 8);
        expect(run('range', state, l, h).steps.at(-1)!.variables?.sum).toBe(brute(state, l, h));
      }
    }
  });
});
