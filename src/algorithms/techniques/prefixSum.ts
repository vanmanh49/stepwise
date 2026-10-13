import type { ArrayView, Cell, Role, Step } from '../../types/visualization';
import { toCells, withRoles } from '../sorting/cells';

export const prefixSumCode = `function prefixSums(arr: number[]): number[] {
  const prefix = [0];
  for (let i = 0; i < arr.length; i++) {
    prefix.push(prefix[i] + arr[i]);
  }
  return prefix;
}

function rangeSum(prefix: number[], left: number, right: number): number {
  return prefix[right + 1] - prefix[left];
}`;

/** prefix[i] is the sum of the first i values, so prefix has one more entry than arr. */
export function prefixSums(arr: number[]): number[] {
  const prefix = [0];
  for (let i = 0; i < arr.length; i++) prefix.push(prefix[i]! + arr[i]!);
  return prefix;
}

/** Sum of arr[left..right], both inclusive. */
export function rangeSum(prefix: number[], left: number, right: number): number {
  return prefix[right + 1]! - prefix[left]!;
}

export function prefixSumSteps(arr: number[]): Step[] {
  const cells = toCells(arr);
  const n = arr.length;
  const prefix: Cell[] = [{ id: 'p0', value: 0, role: 'default' }];
  const view = (main: Record<number, Role> = {}, aux: Record<number, Role> = {}, pointers?: Record<string, number>): ArrayView => ({
    kind: 'array',
    cells: withRoles(cells, main),
    aux: { label: 'Prefix sums', cells: withRoles(prefix, aux) },
    ...(pointers && { pointers }),
  });

  const steps: Step[] = [
    {
      title: 'Start the prefix row with 0',
      why: 'prefix[i] will hold the sum of the first i values. The sum of the first zero values is 0, and that extra entry removes special cases later.',
      next: n > 0 ? 'Add the values one at a time.' : undefined,
      codeLine: 2,
      view: view(),
    },
  ];

  for (let i = 0; i < n; i++) {
    const previous = prefix[i]!.value as number;
    const total = previous + arr[i]!;
    prefix.push({ id: `p${i + 1}`, value: total, role: 'default' });
    steps.push({
      title: `prefix[${i + 1}] = ${previous} + ${arr[i]} = ${total}`,
      why: `The sum of the first ${i + 1} value${i === 0 ? '' : 's'} is the previous running total plus the next value. Nothing is ever added up twice.`,
      codeLine: 4,
      variables: { i, 'prefix[i]': previous, 'arr[i]': arr[i]! },
      view: view({ [i]: 'active' }, { [i]: 'compare', [i + 1]: 'found' }, { i }),
    });
  }

  if (n === 0) {
    steps.push({
      title: 'There is nothing to add up',
      why: 'An empty list has only the starting 0 in its prefix row.',
      codeLine: 6,
      view: view(),
    });
    return steps;
  }

  const left = n < 3 ? 0 : 1;
  const right = n < 3 ? n - 1 : n - 2;
  const range: Record<number, Role> = {};
  for (let i = left; i <= right; i++) range[i] = 'active';
  const result = (prefix[right + 1]!.value as number) - (prefix[left]!.value as number);

  steps.push({
    title: `Query: what is the sum from index ${left} to index ${right}?`,
    why: `Adding those ${right - left + 1} values directly would take ${right - left + 1} steps, and every new query would start over. The prefix row can answer it with one subtraction.`,
    next: 'Take the running total up to the end of the range, and subtract the running total before the range starts.',
    codeLine: 9,
    variables: { left, right },
    view: view(range),
  });
  steps.push({
    title: `prefix[${right + 1}] − prefix[${left}] = ${prefix[right + 1]!.value} − ${prefix[left]!.value} = ${result}`,
    why: `prefix[${right + 1}] covers everything up to index ${right}. Subtracting prefix[${left}] removes the part before index ${left}. Any range costs O(1) once the row is built.`,
    codeLine: 10,
    variables: { left, right, result },
    view: view(range, { [right + 1]: 'compare', [left]: 'compare' }),
  });
  return steps;
}
