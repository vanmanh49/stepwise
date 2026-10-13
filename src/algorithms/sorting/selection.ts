import type { Step } from '../../types/visualization';
import { allIndices, arrayView, swapCells, toCells, val } from './cells';

export const selectionSortCode = `function selectionSort(arr: number[]): number[] {
  for (let i = 0; i < arr.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j] < arr[min]) {
        min = j;
      }
    }
    if (min !== i) {
      [arr[i], arr[min]] = [arr[min], arr[i]];
    }
  }
  return arr;
}`;

export function selectionSort(input: number[]): number[] {
  const arr = [...input];
  for (let i = 0; i < arr.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j]! < arr[min]!) min = j;
    }
    if (min !== i) [arr[i], arr[min]] = [arr[min]!, arr[i]!];
  }
  return arr;
}

export function selectionSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const sorted = new Set<number>();
  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Selection sort repeatedly finds the smallest remaining value and moves it to the front.',
      next: n > 1 ? 'Assume the first value is the smallest so far.' : undefined,
      codeLine: 1,
      view: arrayView(cells),
    },
  ];

  for (let i = 0; i < n - 1; i++) {
    let min = i;
    steps.push({
      title: `Assume ${val(cells, i)} is the smallest`,
      why: `Position ${i} is the next slot to fill. Start by treating its value as the minimum of the unsorted part.`,
      next: 'Scan the rest of the array for something smaller.',
      codeLine: 3,
      variables: { i, min },
      view: arrayView(cells, { [i]: 'active' }, sorted, { i, min }),
    });
    for (let j = i + 1; j < n; j++) {
      const candidate = val(cells, j);
      const current = val(cells, min);
      const smaller = candidate < current;
      steps.push({
        title: `Compare ${candidate} with the minimum ${current}`,
        why: smaller
          ? `${candidate} < ${current}, so ${candidate} is the new smallest value seen.`
          : `${candidate} ≥ ${current}, so the minimum stays ${current}.`,
        next: smaller ? `Remember index ${j} as the new minimum.` : 'Keep scanning.',
        codeLine: 5,
        variables: { i, j, min },
        view: arrayView(cells, { [min]: 'active', [j]: 'compare' }, sorted, { i, j, min }),
      });
      if (smaller) {
        min = j;
        steps.push({
          title: `New minimum: ${candidate}`,
          why: 'The algorithm only remembers the index of the smallest value. Nothing moves yet.',
          next: 'Keep scanning the rest of the array.',
          codeLine: 6,
          variables: { i, j, min },
          view: arrayView(cells, { [min]: 'active' }, sorted, { i, j, min }),
        });
      }
    }
    if (min !== i) {
      const a = val(cells, i);
      const b = val(cells, min);
      swapCells(cells, i, min);
      steps.push({
        title: `Swap ${b} into position ${i}`,
        why: `${b} is the smallest remaining value, so it swaps with ${a} to take the next sorted slot.`,
        codeLine: 10,
        variables: { i, min },
        view: arrayView(cells, { [i]: 'swap', [min]: 'swap' }, sorted, { i, min }),
      });
    } else {
      steps.push({
        title: `${val(cells, i)} is already in place`,
        why: 'Nothing smaller was found, so no swap is needed.',
        codeLine: 9,
        variables: { i, min },
        view: arrayView(cells, { [i]: 'active' }, sorted, { i, min }),
      });
    }
    sorted.add(i);
  }

  steps.push({
    title: 'The array is sorted',
    why: 'Each position was filled with the smallest value that was left, so the last value is also in place.',
    codeLine: 13,
    view: arrayView(cells, {}, allIndices(cells)),
  });
  return steps;
}
