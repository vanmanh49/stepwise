import type { Role, Step } from '../../types/visualization';
import { arrayView, toCells } from '../sorting/cells';

export const linearSearchCode = `function linearSearch(arr: number[], target: number): number {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) {
      return i;
    }
  }
  return -1;
}`;

export function linearSearch(arr: number[], target: number): number {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) return i;
  }
  return -1;
}

export function linearSearchSteps(arr: number[], target: number): Step[] {
  const cells = toCells(arr);
  const checked = (upTo: number, extra: Record<number, Role> = {}): Record<number, Role> => {
    const roles: Record<number, Role> = {};
    for (let k = 0; k < upTo; k++) roles[k] = 'discarded';
    return { ...roles, ...extra };
  };

  const steps: Step[] = [
    {
      title: `Look for ${target}`,
      why: 'Linear search makes no assumptions about order, so it checks every value from left to right.',
      next: arr.length > 0 ? 'Check the first value.' : 'The array is empty, so there is nothing to check.',
      codeLine: 1,
      variables: { target },
      view: arrayView(cells),
    },
  ];

  for (let i = 0; i < arr.length; i++) {
    const value = arr[i]!;
    const match = value === target;
    steps.push({
      title: `Check index ${i}: is ${value} equal to ${target}?`,
      why: match ? `${value} = ${target}. This is the value we want.` : `${value} ≠ ${target}, so this is not it.`,
      next: match ? 'Return this index.' : i < arr.length - 1 ? 'Move one position to the right.' : 'No values are left.',
      codeLine: 3,
      variables: { target, i, 'arr[i]': value },
      view: arrayView(cells, checked(i, { [i]: 'compare' }), [], { i }),
    });
    if (match) {
      steps.push({
        title: `Found ${target} at index ${i}`,
        why: `It took ${i + 1} comparison${i === 0 ? '' : 's'}. Linear search stops at the first match.`,
        codeLine: 4,
        variables: { target, i, result: i },
        view: arrayView(cells, checked(i, { [i]: 'found' }), [], { i }),
      });
      return steps;
    }
  }

  steps.push({
    title: `${target} is not in the array`,
    why: `All ${arr.length} values were checked without a match, so the search returns -1.`,
    codeLine: 7,
    variables: { target, result: -1 },
    view: arrayView(cells, checked(arr.length)),
  });
  return steps;
}
