import type { BucketsView, Cell, Role, Step } from '../../types/visualization';
import { toCells } from './cells';

export const radixSortCode = `function radixSort(arr: number[]): number[] {
  const digits = String(Math.max(...arr)).length;
  for (let pass = 0, place = 1; pass < digits; pass++, place *= 10) {
    const buckets: number[][] = Array.from({ length: 10 }, () => []);
    for (const v of arr) {
      buckets[Math.floor(v / place) % 10].push(v);
    }
    arr = buckets.flat();
  }
  return arr;
}`;

const MAX_VALUE = 999;
const PLACE_NAMES = ['ones', 'tens', 'hundreds'];

export function radixSort(values: number[]): number[] {
  let arr = [...values];
  const digits = String(Math.max(...arr)).length;
  for (let pass = 0, place = 1; pass < digits; pass++, place *= 10) {
    const buckets: number[][] = Array.from({ length: 10 }, () => []);
    for (const v of arr) buckets[Math.floor(v / place) % 10]!.push(v);
    arr = buckets.flat();
  }
  return arr;
}

const digitOf = (v: number, place: number) => Math.floor(v / place) % 10;

function view(label: string, input: Cell[], buckets: Cell[][]): BucketsView {
  return { kind: 'buckets', input: { label, cells: input }, buckets: buckets.map((cells, d) => ({ label: String(d), cells })) };
}

const paint = (cells: Cell[], role: Role) => cells.map((c) => ({ ...c, role }));

export function radixSortSteps(values: number[]): Step[] {
  let arr = toCells(values);
  if (values.some((v) => v < 0 || v > MAX_VALUE)) {
    return [
      {
        title: 'Radix sort here needs values from 0 to 999',
        why: 'This lesson sorts by up to three decimal digits. Use whole numbers from 0 to 999.',
        codeLine: 1,
        view: view('Input', arr, Array.from({ length: 10 }, () => [])),
      },
    ];
  }

  const digits = String(Math.max(...values)).length;
  const steps: Step[] = [
    {
      title: `Sort by ${digits} digit${digits === 1 ? '' : 's'}, starting with the ones`,
      why: `The largest value has ${digits} digit${digits === 1 ? '' : 's'}, so radix sort makes ${digits} pass${digits === 1 ? '' : 'es'}. Each pass drops the values into ten buckets by one digit, then collects them in bucket order.`,
      next: 'Distribute the values by their ones digit.',
      codeLine: 2,
      variables: { digits },
      view: view('Input', arr, Array.from({ length: 10 }, () => [])),
    },
  ];

  for (let pass = 0, place = 1; pass < digits; pass++, place *= 10) {
    const name = PLACE_NAMES[pass]!;
    const label = `Pass ${pass + 1}: ${name} digit`;
    const buckets: Cell[][] = Array.from({ length: 10 }, () => []);
    const waiting = [...arr];
    while (waiting.length > 0) {
      const cell = waiting.shift()!;
      const d = digitOf(cell.value as number, place);
      buckets.forEach((b, i) => (buckets[i] = paint(b, 'default')));
      buckets[d]!.push({ ...cell, role: 'active' });
      steps.push({
        title: `${cell.value} goes into bucket ${d}`,
        why: `Its ${name} digit is ${d}. Values join the end of their bucket, so values with the same digit keep the order they arrived in.`,
        codeLine: 6,
        variables: { place, digit: d },
        // A copy: waiting keeps shrinking after this step is recorded.
        view: view(label, [...waiting], buckets),
      });
    }
    arr = buckets.flat().map((c) => ({ ...c, role: 'default' as Role }));
    const last = pass === digits - 1;
    steps.push({
      title: last ? 'Collect the buckets: sorted' : `Collect the buckets in order 0 to 9`,
      why: last
        ? `After sorting by the ${name} digit, and earlier passes having ordered the smaller digits, every value is in its final place.`
        : `Reading the buckets from 0 to 9 orders the values by their ${name} digit. Because buckets keep arrival order, ties stay ordered by the digits sorted earlier.`,
      next: last ? undefined : `Distribute again by the ${PLACE_NAMES[pass + 1]} digit.`,
      codeLine: last ? 10 : 8,
      view: view(label, last ? paint(arr, 'sorted') : arr, Array.from({ length: 10 }, () => [])),
    });
  }
  return steps;
}
