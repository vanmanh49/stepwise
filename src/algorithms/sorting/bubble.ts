import type { Step } from '../../types/visualization';
import { allIndices, arrayView, swapCells, toCells, val } from './cells';

export const bubbleSortCode = `function bubbleSort(arr: number[]): number[] {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swapped = true;
      }
    }
    if (!swapped) break; // no swaps: already sorted
  }
  return arr;
}`;

export function bubbleSort(input: number[]): number[] {
  const arr = [...input];
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j]! > arr[j + 1]!) {
        [arr[j], arr[j + 1]] = [arr[j + 1]!, arr[j]!];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return arr;
}

export function bubbleSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const sorted = new Set<number>();
  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Bubble sort walks through the array comparing neighbours, and swaps any pair that is out of order.',
      next: n > 1 ? 'Compare the first two values.' : undefined,
      codeLine: 1,
      view: arrayView(cells),
    },
  ];

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      const a = val(cells, j);
      const b = val(cells, j + 1);
      const pointers = { j, 'j+1': j + 1 };
      steps.push({
        title: `Compare ${a} and ${b}`,
        why: a > b ? `${a} > ${b}, so this pair is out of order.` : `${a} ≤ ${b}, so this pair is already in order.`,
        next: a > b ? 'Swap them so the larger value moves toward the end.' : 'Leave them and move to the next pair.',
        codeLine: 6,
        variables: { pass: i + 1, j, swapped: String(swapped) },
        view: arrayView(cells, { [j]: 'compare', [j + 1]: 'compare' }, sorted, pointers),
      });
      if (a > b) {
        swapCells(cells, j, j + 1);
        swapped = true;
        steps.push({
          title: `Swap ${a} and ${b}`,
          why: `${a} is larger than ${b}, so it moves one position toward the end.`,
          next: 'Move to the next pair.',
          codeLine: 7,
          variables: { pass: i + 1, j, swapped: 'true' },
          view: arrayView(cells, { [j]: 'swap', [j + 1]: 'swap' }, sorted, pointers),
        });
      }
    }
    if (!swapped) {
      steps.push({
        title: 'No swaps in this pass',
        why: 'A full pass without a swap means every pair is in order, so the array is already sorted.',
        next: 'Stop early instead of running more passes.',
        codeLine: 11,
        variables: { pass: i + 1, swapped: 'false' },
        view: arrayView(cells, {}, sorted),
      });
      break;
    }
    sorted.add(n - i - 1);
    steps.push({
      title: `${val(cells, n - i - 1)} is in its final position`,
      why: `Pass ${i + 1} carried the largest remaining value to the end of the unsorted part.`,
      next: 'Start the next pass over the values that are left.',
      codeLine: 10,
      variables: { pass: i + 1, swapped: 'true' },
      view: arrayView(cells, {}, sorted),
    });
  }

  steps.push({
    title: 'The array is sorted',
    why: 'Every value is now in its final position.',
    codeLine: 13,
    view: arrayView(cells, {}, allIndices(cells)),
  });
  return steps;
}
