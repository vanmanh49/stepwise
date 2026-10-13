import type { Role, Step } from '../../types/visualization';
import { allIndices, arrayView, swapCells, toCells, val } from './cells';

export const quickSortCode = `function quickSort(arr: number[], lo = 0, hi = arr.length - 1): number[] {
  if (lo < hi) {
    const p = partition(arr, lo, hi);
    quickSort(arr, lo, p - 1);
    quickSort(arr, p + 1, hi);
  }
  return arr;
}

function partition(arr: number[], lo: number, hi: number): number {
  const pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
    }
  }
  [arr[i], arr[hi]] = [arr[hi], arr[i]];
  return i;
}`;

function partition(arr: number[], lo: number, hi: number): number {
  const pivot = arr[hi]!;
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j]! < pivot) {
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      i++;
    }
  }
  [arr[i], arr[hi]] = [arr[hi]!, arr[i]!];
  return i;
}

export function quickSort(input: number[]): number[] {
  const arr = [...input];
  const sort = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const p = partition(arr, lo, hi);
    sort(lo, p - 1);
    sort(p + 1, hi);
  };
  sort(0, arr.length - 1);
  return arr;
}

export function quickSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const sorted = new Set<number>();
  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Quick sort picks a pivot, moves smaller values to its left and larger values to its right, then repeats on each side.',
      next: n > 1 ? 'Choose the last value as the pivot.' : undefined,
      codeLine: 1,
      view: arrayView(cells),
    },
  ];

  // Cells outside the section being partitioned are dimmed unless already final.
  const inRange = (lo: number, hi: number, roles: Record<number, Role>): Record<number, Role> => {
    const all: Record<number, Role> = { ...roles };
    for (let k = 0; k < n; k++) if ((k < lo || k > hi) && !sorted.has(k)) all[k] = 'discarded';
    return all;
  };

  const sort = (lo: number, hi: number): void => {
    if (lo > hi) return;
    if (lo === hi) {
      sorted.add(lo);
      steps.push({
        title: `${val(cells, lo)} is alone, so it is in place`,
        why: 'A section with one value is already sorted.',
        codeLine: 2,
        variables: { lo, hi },
        view: arrayView(cells, inRange(lo, hi, {}), sorted),
      });
      return;
    }

    const pivot = val(cells, hi);
    steps.push({
      title: `Choose ${pivot} as the pivot`,
      why: `This version always uses the last value of the section (positions ${lo}–${hi}) as the pivot.`,
      next: 'Compare every other value in the section with the pivot.',
      codeLine: 11,
      variables: { lo, hi, pivot },
      view: arrayView(cells, inRange(lo, hi, { [hi]: 'pivot' }), sorted, { i: lo }),
    });

    let i = lo;
    for (let j = lo; j < hi; j++) {
      const v = val(cells, j);
      const smaller = v < pivot;
      steps.push({
        title: `Compare ${v} with the pivot ${pivot}`,
        why: smaller
          ? `${v} < ${pivot}, so it belongs on the left side of the pivot.`
          : `${v} ≥ ${pivot}, so it stays on the right side.`,
        next: smaller
          ? i === j
            ? 'It already sits at the boundary i, so just move the boundary forward.'
            : `Swap it with the value at the boundary i (${val(cells, i)}).`
          : 'Leave it and look at the next value.',
        codeLine: 14,
        variables: { lo, hi, pivot, i, j },
        view: arrayView(cells, inRange(lo, hi, { [j]: 'compare', [hi]: 'pivot' }), sorted, { i, j }),
      });
      if (smaller) {
        if (i !== j) {
          const other = val(cells, i);
          swapCells(cells, i, j);
          steps.push({
            title: `Swap ${v} and ${other}`,
            why: `${v} joins the group of values smaller than the pivot, which ends at the boundary i.`,
            codeLine: 15,
            variables: { lo, hi, pivot, i, j },
            view: arrayView(cells, inRange(lo, hi, { [i]: 'swap', [j]: 'swap', [hi]: 'pivot' }), sorted, { i, j }),
          });
        }
        i++;
      }
    }

    if (i !== hi) swapCells(cells, i, hi);
    sorted.add(i);
    steps.push({
      title: `Place the pivot ${pivot} at position ${i}`,
      why: 'Everything to its left is smaller and everything to its right is greater or equal, so the pivot is in its final position.',
      next: 'Sort the left side and the right side the same way.',
      codeLine: 19,
      variables: { lo, hi, pivot, p: i },
      view: arrayView(cells, inRange(lo, hi, {}), sorted),
    });

    sort(lo, i - 1);
    sort(i + 1, hi);
  };

  sort(0, n - 1);
  steps.push({
    title: 'The array is sorted',
    why: 'Every value has been placed as a pivot or left alone in a section of one.',
    codeLine: 7,
    view: arrayView(cells, {}, allIndices(cells)),
  });
  return steps;
}
