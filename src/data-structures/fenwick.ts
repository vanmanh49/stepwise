import type { StructureDef } from '../types/lesson';
import type { Cell, GridView, Role, Step } from '../types/visualization';
import { lineOf } from './shared';

const SIZE = 8;

const code = `// tree[i] holds the sum of a[i - (i & -i) + 1 .. i] (positions from 1).
function prefix(i: number): number {
  let total = 0;
  while (i > 0) {
    total += tree[i];
    i -= i & -i; // drop the lowest set bit
  }
  return total;
}

const rangeSum = (l: number, r: number) => prefix(r) - prefix(l - 1);

function add(i: number, delta: number): void {
  while (i <= n) {
    tree[i] += delta;
    i += i & -i; // move to the next entry covering i
  }
}`;

const LINE = {
  prefixAdd: lineOf(code, 'total += tree[i];'),
  prefixDone: lineOf(code, 'return total;'),
  range: lineOf(code, 'const rangeSum'),
  add: lineOf(code, 'tree[i] += delta;'),
  addDone: lineOf(code, 'while (i <= n)'),
};

const low = (i: number) => i & -i;
const covers = (i: number) => (low(i) === 1 ? `${i}` : `${i - low(i) + 1}–${i}`);

/** The Fenwick array for 1-based positions; index 0 is unused. */
export function fenwickArray(values: number[]): number[] {
  return [0, ...values.map((_, k) => values.slice(k + 1 - low(k + 1), k + 1).reduce((a, b) => a + b, 0))];
}

/** `roles` colour the tree columns (1-based); `cells` colour the a[i] row. */
function view(values: number[], roles: Record<number, Role> = {}, cells: Record<number, Role> = {}, tree = fenwickArray(values)): GridView {
  const row = (label: string, value: (i: number) => number | string, role: (i: number) => Role) => ({
    label,
    cells: values.map((_, k): Cell => ({ id: `${label}:${k + 1}`, value: value(k + 1), role: role(k + 1) })),
  });
  const treeRole = (i: number) => roles[i] ?? 'default';
  return {
    kind: 'grid',
    colLabels: values.map((_, k) => String(k + 1)),
    rows: [
      row('a[i]', (i) => values[i - 1]!, (i) => cells[i] ?? 'default'),
      row('tree[i]', (i) => tree[i]!, treeRole),
      row('covers', covers, treeRole),
      row('i in binary', (i) => i.toString(2).padStart(4, '0'), treeRole),
      row('i & -i', low, (i) => (roles[i] === 'active' ? 'compare' : 'default')),
    ],
  };
}

const valid = (i: number) => Number.isInteger(i) && i >= 1 && i <= SIZE;

function refuse(values: number[], title: string, why: string, codeLine: number) {
  return { steps: [{ title, why, codeLine, view: view(values) }], state: values };
}

/** One step per tree entry added; returns the prefix sum of positions 1..i. */
function prefixSteps(values: number[], start: number, steps: Step[], extra: Record<number, Role> = {}): number {
  const tree = fenwickArray(values);
  const done: Record<number, Role> = { ...extra };
  let total = 0;
  for (let i = start; i > 0; i -= low(i)) {
    total += tree[i]!;
    const next = i - low(i);
    steps.push({
      title: `Add tree[${i}] = ${tree[i]} (positions ${covers(i)})`,
      why: `tree[${i}] already holds the sum of positions ${covers(i)}. Then drop the lowest set bit: ${i} − ${low(i)} = ${next}${next === 0 ? ', so the sum is complete.' : `, the entry just before that block.`}`,
      codeLine: LINE.prefixAdd,
      variables: { i, 'i & -i': low(i), total },
      view: view(values, { ...done, [i]: 'active' }, Object.fromEntries(Array.from({ length: start }, (_, k) => [k + 1, 'frontier' as Role]))),
    });
    done[i] = 'found';
  }
  return total;
}

export const fenwickStructure: StructureDef = {
  initial: [5, 3, 7, 9, 6, 4, 1, 2],
  view: (values) => view(values),
  code,
  ops: [
    {
      id: 'prefix',
      label: 'Prefix sum',
      args: [{ name: 'i', label: 'Up to', sample: 6 }],
      run(values, [i = 0]) {
        if (!valid(i)) return refuse(values, `${i} is not a position`, `Positions run from 1 to ${SIZE}.`, LINE.prefixDone);
        const steps: Step[] = [];
        const total = prefixSteps(values, i, steps);
        const used = steps.length;
        steps.push({
          title: `Sum of positions 1..${i} = ${total}`,
          why: `${used} entr${used === 1 ? 'y' : 'ies'} instead of ${i} values: one per set bit of ${i} (${i.toString(2)} in binary), so never more than log₂ n + 1.`,
          codeLine: LINE.prefixDone,
          variables: { i, sum: total },
          view: view(values, {}, Object.fromEntries(Array.from({ length: i }, (_, k) => [k + 1, 'found' as Role]))),
        });
        return { steps, state: values };
      },
    },
    {
      id: 'range',
      label: 'Range sum',
      args: [
        { name: 'l', label: 'From', sample: 2 },
        { name: 'r', label: 'To', sample: 6 },
      ],
      run(values, [l = 0, r = 0]) {
        if (!valid(l) || !valid(r)) return refuse(values, 'That range is outside the array', `Positions run from 1 to ${SIZE}.`, LINE.range);
        if (l > r) return refuse(values, 'The range is backwards', `"From" must not be larger than "To". Try ${r} to ${l}.`, LINE.range);
        const steps: Step[] = [];
        const upper = prefixSteps(values, r, steps);
        const lower = l > 1 ? prefixSteps(values, l - 1, steps) : 0;
        const total = upper - lower;
        steps.push({
          title: `Sum of positions ${l}..${r} = ${upper} − ${lower} = ${total}`,
          why: `The sum up to ${r} includes positions 1..${l - 1} as well. Subtracting the sum up to ${l - 1} leaves exactly ${l}..${r}.`,
          codeLine: LINE.range,
          variables: { l, r, sum: total },
          view: view(values, {}, Object.fromEntries(Array.from({ length: r - l + 1 }, (_, k) => [l + k, 'found' as Role]))),
        });
        return { steps, state: values };
      },
    },
    {
      id: 'add',
      label: 'Add',
      args: [
        { name: 'i', label: 'Index', sample: 3 },
        { name: 'delta', label: 'Delta', sample: 2 },
      ],
      run(values, [i = 0, delta = 0]) {
        if (!valid(i)) return refuse(values, `${i} is not a position`, `Positions run from 1 to ${SIZE}.`, LINE.addDone);
        const steps: Step[] = [];
        const next = values.map((v, k) => (k === i - 1 ? v + delta : v));
        const done: Record<number, Role> = {};
        // Entries change one at a time; the ones not reached yet keep their old sums.
        const tree = fenwickArray(values);
        for (let j = i; j <= SIZE; j += low(j)) {
          tree[j] = tree[j]! + delta;
          const after = j + low(j);
          steps.push({
            title: `Add ${delta} to tree[${j}] (positions ${covers(j)})`,
            why: `tree[${j}] covers position ${i}, so it changes. Then add the lowest set bit: ${j} + ${low(j)} = ${after}${after > SIZE ? `, past the end, so the update is done.` : `, the next entry whose block contains ${j}.`}`,
            codeLine: LINE.add,
            variables: { i: j, 'i & -i': low(j), [`tree[${j}]`]: tree[j]! },
            view: view(next, { ...done, [j]: 'active' }, { [i]: 'found' }, [...tree]),
          });
          done[j] = 'found';
        }
        return { steps, state: next };
      },
    },
  ],
};
