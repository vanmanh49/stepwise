import type { HeapView, Role, Step } from '../../types/visualization';
import { allIndices, swapCells, toCells, val, withRoles } from './cells';

export const heapSortCode = `function heapSort(arr: number[]): number[] {
  const n = arr.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    siftDown(arr, i, n); // build a max-heap
  }
  for (let end = n - 1; end > 0; end--) {
    [arr[0], arr[end]] = [arr[end], arr[0]]; // move the max to its place
    siftDown(arr, 0, end);
  }
  return arr;
}

function siftDown(arr: number[], i: number, size: number): void {
  while (true) {
    const left = 2 * i + 1, right = 2 * i + 2;
    let largest = i;
    if (left < size && arr[left] > arr[largest]) largest = left;
    if (right < size && arr[right] > arr[largest]) largest = right;
    if (largest === i) return;
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    i = largest;
  }
}`;

function siftDown(arr: number[], start: number, size: number): void {
  let i = start;
  for (;;) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    let largest = i;
    if (left < size && arr[left]! > arr[largest]!) largest = left;
    if (right < size && arr[right]! > arr[largest]!) largest = right;
    if (largest === i) return;
    [arr[i], arr[largest]] = [arr[largest]!, arr[i]!];
    i = largest;
  }
}

export function heapSort(input: number[]): number[] {
  const arr = [...input];
  const n = arr.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) siftDown(arr, i, n);
  for (let end = n - 1; end > 0; end--) {
    [arr[0], arr[end]] = [arr[end]!, arr[0]!];
    siftDown(arr, 0, end);
  }
  return arr;
}

export function heapSortSteps(input: number[]): Step[] {
  const cells = toCells(input);
  const n = cells.length;
  const sorted = new Set<number>();
  const view = (roles: Record<number, Role> = {}): HeapView => ({ kind: 'heap', items: withRoles(cells, roles, sorted) });

  const steps: Step[] = [
    {
      title: 'Start with the unsorted array',
      why: 'Heap sort first rearranges the array into a max-heap, so the largest value is at the root. The tree and the array below are the same data.',
      next: n > 1 ? 'Build the heap, starting from the last node that has a child.' : undefined,
      codeLine: 1,
      view: view(),
    },
  ];

  // Mirrors siftDown in the displayed code, recording a step per comparison and swap.
  const sift = (start: number, size: number, phase: string) => {
    let i = start;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left >= size) return;
      let largest = i;
      if (val(cells, left) > val(cells, largest)) largest = left;
      if (right < size && val(cells, right) > val(cells, largest)) largest = right;
      const kids = [left, right].filter((k) => k < size);
      const current = val(cells, i);
      steps.push({
        title: `Compare ${current} with its ${kids.length === 1 ? 'child' : 'children'} ${kids.map((k) => val(cells, k)).join(' and ')}`,
        why:
          largest === i
            ? `${current} is at least as large as ${kids.length === 1 ? 'its child' : 'both children'}, so this part already obeys the heap rule.`
            : `${val(cells, largest)} is larger than ${current}. A parent must not be smaller than its child in a max-heap.`,
        next: largest === i ? undefined : `Swap ${current} with ${val(cells, largest)}.`,
        codeLine: largest === right ? 18 : 17,
        variables: { phase, i, size },
        view: view({ [i]: 'active', ...Object.fromEntries(kids.map((k) => [k, 'compare'])) }),
      });
      if (largest === i) return;
      const moved = val(cells, largest);
      swapCells(cells, i, largest);
      steps.push({
        title: `Swap ${current} and ${moved}`,
        why: `${moved} moves up to be the parent and ${current} sifts down one level, where it is checked again.`,
        codeLine: 20,
        variables: { phase, i: largest, size },
        view: view({ [i]: 'swap', [largest]: 'swap' }),
      });
      i = largest;
    }
  };

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) sift(i, n, 'build heap');

  if (n > 1) {
    steps.push({
      title: `The max-heap is built: ${val(cells, 0)} is at the root`,
      why: 'Every parent is now at least as large as its children, so the largest value of the whole array sits at index 0.',
      next: 'Swap it with the last item, where the largest value belongs.',
      codeLine: 4,
      variables: { phase: 'build heap', size: n },
      view: view({ 0: 'found' }),
    });
  }

  for (let end = n - 1; end > 0; end--) {
    const max = val(cells, 0);
    const last = val(cells, end);
    swapCells(cells, 0, end);
    sorted.add(end);
    steps.push({
      title: `Move the largest value, ${max}, to index ${end}`,
      why: `${max} is the largest of the unsorted values, so its final position is the end of the unsorted part. ${last} takes its place at the root for now.`,
      next: end > 1 ? `The heap is one smaller. Sift ${last} down to restore it.` : undefined,
      codeLine: 7,
      variables: { phase: 'sort', end, size: end },
      view: view({ 0: 'swap' }),
    });
    sift(0, end, 'sort');
  }

  steps.push({
    title: 'The array is sorted',
    why: 'Each round removed the largest remaining value from the heap and placed it at the end, so the values are now in ascending order.',
    codeLine: 10,
    view: { kind: 'heap', items: withRoles(cells, {}, allIndices(cells)) },
  });
  return steps;
}
