import type { Role, Step } from '../../types/visualization';
import { arrayView, toCells } from '../sorting/cells';

export const slidingWindowCode = `function maxWindowSum(arr: number[], k: number): number {
  if (k < 1 || k > arr.length) return NaN; // no window of that size fits
  let sum = 0;
  for (let i = 0; i < k; i++) sum += arr[i]; // first window
  let best = sum;
  for (let i = k; i < arr.length; i++) {
    sum += arr[i] - arr[i - k]; // slide: add one, drop one
    if (sum > best) best = sum;
  }
  return best;
}`;

const validSize = (n: number, k: number) => Number.isInteger(k) && k >= 1 && k <= n;
// Negative values are bracketed so the arithmetic in an explanation stays readable.
const fmt = (value: number) => (value < 0 ? `(${value})` : String(value));

/** Largest sum of k neighbouring values and where that window starts; null when k is not in 1..n. */
export function maxWindowSum(arr: number[], k: number): { sum: number; start: number } | null {
  if (!validSize(arr.length, k)) return null;
  let sum = 0;
  for (let i = 0; i < k; i++) sum += arr[i]!;
  let best = { sum, start: 0 };
  for (let i = k; i < arr.length; i++) {
    sum += arr[i]! - arr[i - k]!;
    if (sum > best.sum) best = { sum, start: i - k + 1 };
  }
  return best;
}

export function slidingWindowSteps(arr: number[], k: number): Step[] {
  const cells = toCells(arr);
  const n = arr.length;
  if (!validSize(n, k)) {
    return [
      {
        title: `A window of size ${k} does not fit`,
        why:
          n === 0
            ? 'The list is empty, so there is nothing to slide over.'
            : `The window size must be a whole number from 1 to ${n}, the length of the list.`,
        codeLine: 2,
        view: arrayView(cells),
      },
    ];
  }

  const window = (start: number, extra: Record<number, Role> = {}): Record<number, Role> => {
    const roles: Record<number, Role> = {};
    for (let i = start; i < start + k; i++) roles[i] = 'active';
    return { ...roles, ...extra };
  };

  const steps: Step[] = [
    {
      title: k === 1 ? 'Find the largest window of one value' : `Find the ${k} neighbouring values with the largest sum`,
      why:
        k === 1
          ? 'A window of one value shares nothing with its neighbour, so this is simply a scan for the largest value. Wider windows are where the technique saves work.'
          : `Adding up every possible window from scratch repeats work: neighbouring windows share ${k - 1} of their ${k} values. A sliding window reuses the previous sum.`,
      next: 'Add up the first window.',
      codeLine: 3,
      variables: { k, sum: 0 },
      view: arrayView(cells),
    },
  ];

  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += arr[i]!;
    const roles: Record<number, Role> = {};
    for (let j = 0; j < i; j++) roles[j] = 'active';
    steps.push({
      title: `Add ${fmt(arr[i]!)} to the first window`,
      why: 'The first window has no previous sum to reuse, so it is the only one added up value by value.',
      codeLine: 4,
      variables: { k, sum },
      view: arrayView(cells, { ...roles, [i]: 'compare' }, [], { i }),
    });
  }

  let best = { sum, start: 0 };
  for (let i = k; i < n; i++) {
    const entering = arr[i]!;
    const leaving = arr[i - k]!;
    const before = sum;
    sum += entering - leaving;
    const improved = sum > best.sum;
    if (improved) best = { sum, start: i - k + 1 };
    steps.push({
      title: `Slide right: add ${fmt(entering)}, drop ${fmt(leaving)}`,
      why: `${fmt(before)} + ${fmt(entering)} − ${fmt(leaving)} = ${fmt(sum)}. Two operations update the sum, however wide the window is. ${
        improved ? `${fmt(sum)} beats the best so far, so remember this window.` : `${fmt(sum)} does not beat the best so far (${fmt(best.sum)}).`
      }`,
      codeLine: improved ? 8 : 7,
      variables: { k, sum, best: best.sum },
      view: arrayView(cells, window(i - k + 1, { [i]: 'compare', [i - k]: 'discarded' }), [], { i }),
    });
  }

  const found: Record<number, Role> = {};
  for (let i = best.start; i < best.start + k; i++) found[i] = 'found';
  steps.push({
    title: `The largest window sum is ${best.sum}`,
    why: `The window starting at index ${best.start} wins. Each value entered the window once and left once, so the whole search is O(n).`,
    codeLine: 10,
    variables: { k, best: best.sum, start: best.start },
    view: arrayView(cells, found),
  });
  return steps;
}
