import type { ArrayView, Cell, Role, Step } from '../../types/visualization';
import { toCells } from './cells';

export const countingSortCode = `function countingSort(arr: number[]): number[] {
  const count = new Array(10).fill(0);
  for (const v of arr) count[v]++;
  for (let d = 1; d < 10; d++) {
    count[d] += count[d - 1];
  }
  const out = new Array(arr.length);
  for (let i = arr.length - 1; i >= 0; i--) {
    count[arr[i]]--;
    out[count[arr[i]]] = arr[i];
  }
  return out;
}`;

const DIGITS = 10;

export function countingSort(values: number[]): number[] {
  const count = new Array<number>(DIGITS).fill(0);
  for (const v of values) count[v]!++;
  for (let d = 1; d < DIGITS; d++) count[d]! += count[d - 1]!;
  const out = new Array<number>(values.length);
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]!;
    count[v]!--;
    out[count[v]!] = v;
  }
  return out;
}

function countCells(count: number[], roles: Record<number, Role> = {}): Cell[] {
  return count.map((value, d) => ({ id: `k${d}`, value, role: roles[d] ?? 'default' }));
}

function view(cells: Cell[], count: number[], countLabel: string, countRoles: Record<number, Role> = {}): ArrayView {
  return { kind: 'array', cells, aux: { label: countLabel, cells: countCells(count, countRoles) } };
}

const withRole = (cells: Cell[], roles: Record<number, Role>) => cells.map((c, i) => ({ ...c, role: roles[i] ?? c.role }));

export function countingSortSteps(values: number[]): Step[] {
  const input = toCells(values);
  if (values.some((v) => v < 0 || v >= DIGITS)) {
    return [
      {
        title: 'Counting sort needs small values',
        why: 'This lesson counts the digits 0 to 9, one counter each. Use whole numbers from 0 to 9.',
        codeLine: 1,
        view: { kind: 'array', cells: input },
      },
    ];
  }

  const count = new Array<number>(DIGITS).fill(0);
  const steps: Step[] = [
    {
      title: 'Start with ten empty counters',
      why: 'Counting sort never compares two values. It counts how often each value occurs, one counter per possible value.',
      next: 'Read every value and add one to its counter.',
      codeLine: 2,
      view: view(input, count, 'count of each value 0–9'),
    },
  ];

  values.forEach((v, i) => {
    count[v]!++;
    steps.push({
      title: `Count a ${v}`,
      why: `Counter ${v} goes up by one. It now says ${count[v]} value${count[v] === 1 ? ' equals' : 's equal'} ${v}.`,
      codeLine: 3,
      variables: { v },
      view: view(withRole(input, { [i]: 'active' }), count, 'count of each value 0–9', { [v]: 'active' }),
    });
  });

  for (let d = 1; d < DIGITS; d++) count[d]! += count[d - 1]!;
  steps.push({
    title: 'Turn the counts into end positions',
    why: 'Adding each counter to the one before it gives a running total. Counter d now says how many values are at most d, which is where the last d belongs in the output.',
    next: 'Place values from the right so equal values keep their order.',
    codeLine: 5,
    view: view(input, count, 'values ≤ d (running total)'),
  });

  const out: (Cell | null)[] = values.map(() => null);
  const outView = (roles: Record<number, Role>, countRoles: Record<number, Role> = {}) =>
    view(
      out.map((cell, i) => (cell ? { ...cell, role: roles[i] ?? 'sorted' } : { id: `hole${i}`, value: '', role: 'default' })),
      count,
      'values ≤ d (running total)',
      countRoles,
    );

  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]!;
    count[v]!--;
    const at = count[v]!;
    out[at] = input[i]!;
    steps.push({
      title: `Place ${v} at position ${at}`,
      why: `Counter ${v} said this ${v} ends at position ${at + 1}, so it goes to index ${at}. The counter drops by one for the next ${v}, which lands just to its left and so keeps its original order.`,
      codeLine: 10,
      variables: { i, v, position: at },
      view: outView({ [at]: 'found' }, { [v]: 'active' }),
    });
  }

  steps.push({
    title: 'Sorted',
    why: 'Every value sits at the position its counter gave it. No two values were ever compared.',
    codeLine: 12,
    view: outView({}),
  });
  return steps;
}
