import type { Role, Step } from '../../types/visualization';
import { arrayView, toCells } from '../sorting/cells';

export const twoPointersCode = `function twoSumSorted(arr: number[], target: number): [number, number] | null {
  let left = 0;
  let right = arr.length - 1;
  while (left < right) {
    const sum = arr[left] + arr[right];
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return null;
}`;

/** Indices of two different positions in an ascending list whose values add up to the target. */
export function twoSumSorted(sorted: number[], target: number): [number, number] | null {
  let left = 0;
  let right = sorted.length - 1;
  while (left < right) {
    const sum = sorted[left]! + sorted[right]!;
    if (sum === target) return [left, right];
    if (sum < target) left++;
    else right--;
  }
  return null;
}

export function twoPointersSteps(sorted: number[], target: number): Step[] {
  const cells = toCells(sorted);
  const n = sorted.length;
  const outside = (left: number, right: number, extra: Record<number, Role> = {}): Record<number, Role> => {
    const roles: Record<number, Role> = {};
    for (let k = 0; k < n; k++) if (k < left || k > right) roles[k] = 'discarded';
    return { ...roles, ...extra };
  };

  let left = 0;
  let right = n - 1;
  const steps: Step[] = [
    {
      title: `Find two values that add up to ${target}`,
      why: 'The list is sorted, so the smallest value is on the left and the largest on the right. Start with one pointer at each end.',
      next: n >= 2 ? 'Add the two values under the pointers.' : 'There are fewer than two values, so no pair is possible.',
      codeLine: 2,
      variables: { target },
      view: arrayView(cells, {}, [], n >= 2 ? { left, right } : undefined),
    },
  ];

  while (left < right) {
    const a = sorted[left]!;
    const b = sorted[right]!;
    const sum = a + b;
    const variables = { target, left, right, sum };
    if (sum === target) {
      steps.push({
        title: `${a} + ${b} = ${sum}: found the pair`,
        why: `The sum equals the target after only ${steps.length} check${steps.length === 1 ? '' : 's'}. Checking every possible pair would have needed far more.`,
        codeLine: 6,
        variables,
        view: arrayView(cells, outside(left, right, { [left]: 'found', [right]: 'found' }), [], { left, right }),
      });
      return steps;
    }
    const tooSmall = sum < target;
    steps.push({
      title: `${a} + ${b} = ${sum}, which is too ${tooSmall ? 'small' : 'large'}`,
      why: tooSmall
        ? `${b} is the largest value still in play, so ${a} cannot reach ${target} with any partner. ${a} can be ruled out.`
        : `${a} is the smallest value still in play, so ${b} overshoots ${target} with any partner. ${b} can be ruled out.`,
      next: tooSmall ? 'Move the left pointer right to get a larger sum.' : 'Move the right pointer left to get a smaller sum.',
      codeLine: tooSmall ? 7 : 8,
      variables,
      view: arrayView(cells, outside(left, right, { [left]: 'compare', [right]: 'compare' }), [], { left, right }),
    });
    if (tooSmall) left++;
    else right--;
  }

  steps.push({
    title: `No two values add up to ${target}`,
    why:
      n < 2
        ? 'A pair needs two different positions.'
        : 'The pointers met. Every value was ruled out for a reason, so no pair was missed.',
    codeLine: 10,
    variables: { target, result: 'null' },
    view: arrayView(cells, outside(left, right, n > 0 && left === right ? { [left]: 'discarded' } : {})),
  });
  return steps;
}
