import type { Cell, Role, Step } from '../../types/visualization';
import { allIndices, arrayView, toCells, val, withRoles } from './cells';

export const mergeSortCode = `function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

function merge(left: number[], right: number[]): number[] {
  const result: number[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) result.push(left[i++]);
    else result.push(right[j++]);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}`;

export function mergeSort(input: number[]): number[] {
  if (input.length <= 1) return [...input];
  const mid = Math.floor(input.length / 2);
  const left = mergeSort(input.slice(0, mid));
  const right = mergeSort(input.slice(mid));
  const result: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i]! <= right[j]!) result.push(left[i++]!);
    else result.push(right[j++]!);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}

export function mergeSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Merge sort splits the array in half until each piece has one value, then merges the pieces back in order.',
      next: n > 1 ? 'Split the array into two halves.' : undefined,
      codeLine: 1,
      view: arrayView(cells),
    },
  ];

  const list = (lo: number, hi: number) => `[${cells.slice(lo, hi).map((c) => c.value).join(', ')}]`;
  const halves = (lo: number, mid: number, hi: number): Record<number, Role> => {
    const roles: Record<number, Role> = {};
    for (let k = lo; k < hi; k++) roles[k] = cells[k]!.id.startsWith('hole') ? 'discarded' : k < mid ? 'active' : 'frontier';
    return roles;
  };

  const sortRange = (lo: number, hi: number): void => {
    if (hi - lo <= 1) return;
    const mid = lo + Math.floor((hi - lo) / 2);
    steps.push({
      title: `Split ${list(lo, hi)} into ${list(lo, mid)} and ${list(mid, hi)}`,
      why: 'A piece with one value is already sorted, so keep halving until every piece is that small.',
      codeLine: 3,
      variables: { left: list(lo, mid), right: list(mid, hi) },
      view: arrayView(cells, halves(lo, mid, hi)),
    });
    sortRange(lo, mid);
    sortRange(mid, hi);

    const merged: Cell[] = [];
    let i = lo;
    let j = mid;
    const snapshot = (roles: Record<number, Role>, movedLast = false) => ({
      ...arrayView(cells, { ...halves(lo, mid, hi), ...roles }),
      aux: {
        label: 'Merged',
        cells: withRoles(merged, movedLast ? { [merged.length - 1]: 'swap' } : {}),
      },
    });
    const take = (index: number) => {
      merged.push(cells[index]!);
      cells[index] = { id: `hole${index}`, value: '', role: 'discarded' };
    };

    steps.push({
      title: `Merge ${list(lo, mid)} and ${list(mid, hi)}`,
      why: 'Both halves are sorted, so the smallest remaining value is always at the front of one of them.',
      next: 'Compare the front values of the two halves.',
      codeLine: 6,
      variables: { left: list(lo, mid), right: list(mid, hi) },
      view: snapshot({}),
    });

    while (i < mid && j < hi) {
      const a = val(cells, i);
      const b = val(cells, j);
      const fromLeft = a <= b;
      steps.push({
        title: `Compare ${a} and ${b}`,
        why: fromLeft
          ? `${a} ≤ ${b}, so ${a} is the smallest value left in either half.`
          : `${b} < ${a}, so ${b} is the smallest value left in either half.`,
        next: `Move ${fromLeft ? a : b} to the merged list.`,
        codeLine: 12,
        variables: { i: i - lo, j: j - mid },
        view: snapshot({ [i]: 'compare', [j]: 'compare' }),
      });
      take(fromLeft ? i++ : j++);
      steps.push({
        title: `Move ${fromLeft ? a : b} to the merged list`,
        why: 'Taking the smaller front value each time keeps the merged list in order.',
        codeLine: fromLeft ? 13 : 14,
        variables: { i: i - lo, j: j - mid },
        view: snapshot({}, true),
      });
    }

    if (i < mid || j < hi) {
      const rest = i < mid ? list(i, mid) : list(j, hi);
      while (i < mid) take(i++);
      while (j < hi) take(j++);
      steps.push({
        title: `Append the remaining ${rest}`,
        why: 'One half is empty. The other half is already sorted, so its remaining values go straight to the end.',
        codeLine: 16,
        view: snapshot({}),
      });
    }

    merged.forEach((cell, k) => (cells[lo + k] = cell));
    const roles: Record<number, Role> = {};
    for (let k = lo; k < hi; k++) roles[k] = 'found';
    steps.push({
      title: `${list(lo, hi)} is merged`,
      why: 'This section is now sorted and can be merged with its neighbour.',
      codeLine: 6,
      view: arrayView(cells, roles),
    });
  };

  sortRange(0, n);
  steps.push({
    title: 'The array is sorted',
    why: 'The last merge combined two sorted halves into the full sorted array.',
    codeLine: 6,
    view: arrayView(cells, {}, allIndices(cells)),
  });
  return steps;
}
