import type { Step } from '../../types/visualization';
import { allIndices, arrayView, swapCells, toCells, val } from './cells';

export const insertionSortCode = `function insertionSort(arr: number[]): number[] {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
  return arr;
}`;

export function insertionSort(input: number[]): number[] {
  const arr = [...input];
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i]!;
    let j = i - 1;
    while (j >= 0 && arr[j]! > key) {
      arr[j + 1] = arr[j]!;
      j--;
    }
    arr[j + 1] = key;
  }
  return arr;
}

export function insertionSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const range = (end: number) => Array.from({ length: end }, (_, k) => k);
  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Insertion sort grows a sorted section on the left, inserting one new value into it at a time.',
      next: n > 1 ? 'A single value is already sorted, so begin with the second value.' : undefined,
      codeLine: 1,
      view: arrayView(cells, {}, n > 0 ? [0] : []),
    },
  ];

  for (let i = 1; i < n; i++) {
    const key = val(cells, i);
    steps.push({
      title: `Pick ${key} as the key`,
      why: `Everything left of position ${i} is sorted. ${key} is the next value to insert into that section.`,
      next: 'Compare it with the value on its left.',
      codeLine: 3,
      variables: { i, key },
      view: arrayView(cells, { [i]: 'active' }, range(i), { i }),
    });

    // The key cell travels left by adjacent swaps; visually the larger value shifts right.
    let pos = i;
    while (pos > 0) {
      const left = val(cells, pos - 1);
      const larger = left > key;
      steps.push({
        title: `Compare ${left} with the key ${key}`,
        why: larger
          ? `${left} > ${key}, so ${left} must sit to the right of the key.`
          : `${left} ≤ ${key}, so the key has found its place.`,
        next: larger ? `Shift ${left} one position to the right.` : `Insert ${key} here.`,
        codeLine: 5,
        variables: { i, j: pos - 1, key },
        view: arrayView(cells, { [pos - 1]: 'compare', [pos]: 'active' }, range(i + 1), { j: pos - 1 }),
      });
      if (!larger) break;
      swapCells(cells, pos - 1, pos);
      pos--;
      steps.push({
        title: `Shift ${left} right`,
        why: `Moving ${left} over opens a gap for the key one position to the left.`,
        codeLine: 6,
        variables: { i, j: pos - 1, key },
        view: arrayView(cells, { [pos + 1]: 'swap', [pos]: 'active' }, range(i + 1), { j: pos - 1 }),
      });
    }

    steps.push({
      title: `Insert ${key} at position ${pos}`,
      why:
        pos === 0
          ? `Nothing is left of it, so ${key} is the smallest value in the sorted section.`
          : `Everything to its left is ≤ ${key} and everything shifted is larger, so the left section stays sorted.`,
      next: i < n - 1 ? 'Take the next unsorted value as the key.' : undefined,
      codeLine: 9,
      variables: { i, key },
      view: arrayView(cells, { [pos]: 'found' }, range(i + 1)),
    });
  }

  steps.push({
    title: 'The array is sorted',
    why: 'Every value has been inserted into the sorted section.',
    codeLine: 11,
    view: arrayView(cells, {}, allIndices(cells)),
  });
  return steps;
}
