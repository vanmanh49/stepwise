import type { Role, Step } from '../../types/visualization';
import { arrayView, toCells } from '../sorting/cells';

export const binarySearchCode = `function binarySearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}`;

export function binarySearch(sorted: number[], target: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = sorted[mid]!;
    if (value === target) return mid;
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** Binary search only works on ascending input, so custom input is sorted first. */
export function prepareSearchInput(values: number[], needsSorted: boolean): { values: number[]; wasSorted: boolean } {
  const isAscending = values.every((v, i) => i === 0 || values[i - 1]! <= v);
  if (!needsSorted || isAscending) return { values, wasSorted: false };
  return { values: values.toSorted((a, b) => a - b), wasSorted: true };
}

export function binarySearchSteps(sorted: number[], target: number): Step[] {
  const cells = toCells(sorted);
  const n = sorted.length;
  const outside = (low: number, high: number, extra: Record<number, Role> = {}): Record<number, Role> => {
    const roles: Record<number, Role> = {};
    for (let k = 0; k < n; k++) if (k < low || k > high) roles[k] = 'discarded';
    return { ...roles, ...extra };
  };

  let low = 0;
  let high = n - 1;
  let comparisons = 0;
  const steps: Step[] = [
    {
      title: `Look for ${target} in a sorted array`,
      why: 'Because the values are in order, one comparison with the middle value can rule out half of the array.',
      next: n > 0 ? 'Find the middle of the current range.' : 'The array is empty, so there is nothing to check.',
      codeLine: 2,
      variables: { target, low, high },
      view: arrayView(cells, {}, [], n > 0 ? { low, high } : undefined),
    },
  ];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = sorted[mid]!;
    comparisons++;
    const variables = { target, low, mid, high, 'arr[mid]': value };
    steps.push({
      title: `Check the middle: is ${value} equal to ${target}?`,
      why:
        value === target
          ? `${value} = ${target}. The middle value is the target.`
          : value < target
            ? `${value} < ${target}. The target can only be to the right of the middle.`
            : `${value} > ${target}. The target can only be to the left of the middle.`,
      next:
        value === target
          ? 'Return the middle index.'
          : value < target
            ? 'Discard the middle and everything to its left.'
            : 'Discard the middle and everything to its right.',
      codeLine: 6,
      variables,
      view: arrayView(cells, outside(low, high, { [mid]: 'compare' }), [], { low, mid, high }),
    });

    if (value === target) {
      steps.push({
        title: `Found ${target} at index ${mid}`,
        why: `It took ${comparisons} comparison${comparisons === 1 ? '' : 's'} to search ${n} value${n === 1 ? '' : 's'}, because each one halved the range that was left.`,
        codeLine: 6,
        variables: { ...variables, result: mid },
        view: arrayView(cells, outside(low, high, { [mid]: 'found' }), [], { mid }),
      });
      return steps;
    }

    if (value < target) low = mid + 1;
    else high = mid - 1;
    const remaining = Math.max(0, high - low + 1);
    steps.push({
      title: value < target ? `Move low to index ${low}` : `Move high to index ${high}`,
      why: `Every discarded value is ${value < target ? 'too small' : 'too large'}. ${remaining} value${remaining === 1 ? '' : 's'} remain${remaining === 1 ? 's' : ''} in range.`,
      next: remaining > 0 ? 'Find the middle of the smaller range.' : 'The range is empty.',
      codeLine: value < target ? 7 : 8,
      variables: { target, low, high },
      view: arrayView(cells, outside(low, high), [], remaining > 0 ? { low, high } : undefined),
    });
  }

  steps.push({
    title: `${target} is not in the array`,
    why: 'low has passed high, so no positions are left where the target could be. The search returns -1.',
    codeLine: 10,
    variables: { target, low, high, result: -1 },
    view: arrayView(cells, outside(low, high)),
  });
  return steps;
}
