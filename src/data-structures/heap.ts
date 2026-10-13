import { swapCells, toCells, val, withRoles } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, HeapView, Role, Step } from '../types/visualization';
import { refuse } from './shared';

const MAX_ITEMS = 15;

const code = `class MaxHeap {
  private heap: number[] = [];

  insert(value: number): void {
    this.heap.push(value);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent] >= this.heap[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  extractMax(): number | undefined {
    if (this.heap.length === 0) return undefined;
    const max = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return max;
    this.heap[0] = last;
    let i = 0;
    while (true) {
      const left = 2 * i + 1, right = 2 * i + 2;
      let largest = i;
      if (left < this.heap.length && this.heap[left] > this.heap[largest]) largest = left;
      if (right < this.heap.length && this.heap[right] > this.heap[largest]) largest = right;
      if (largest === i) break;
      this.swap(i, largest);
      i = largest;
    }
    return max;
  }
}`;

const heapView = (cells: Cell[], roles: Record<number, Role> = {}): HeapView => ({
  kind: 'heap',
  items: withRoles(cells, roles),
});
const view = (state: number[]) => heapView(toCells(state));
const values = (cells: Cell[]) => cells.map((c) => c.value as number);

export const heapStructure: StructureDef = {
  initial: [50, 30, 40, 10, 20],
  view,
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 45 }],
      run(state, [value = 0]) {
        if (state.length >= MAX_ITEMS) {
          return refuse(
            state,
            view(state),
            'The heap is full',
            `This visualization holds at most ${MAX_ITEMS} items so the tree stays readable. Extract something first.`,
            4,
          );
        }
        const cells = [...toCells(state), { id: 'new', value, role: 'default' as Role }];
        let i = cells.length - 1;
        const steps: Step[] = [
          {
            title: `Add ${value} at the end`,
            why: 'The new value goes in the next free slot of the array, which is the next free position on the bottom level of the tree. That keeps the tree complete.',
            next: i > 0 ? 'Compare it with its parent.' : undefined,
            codeLine: 5,
            variables: { i },
            view: heapView(cells, { [i]: 'found' }),
          },
        ];
        while (i > 0) {
          const parent = Math.floor((i - 1) / 2);
          const p = val(cells, parent);
          const inOrder = p >= value;
          steps.push({
            title: `Compare ${value} with its parent ${p}`,
            why: inOrder
              ? `${p} ≥ ${value}, so the parent is still the larger one. The heap rule holds.`
              : `${value} > ${p}. A child must never be larger than its parent in a max-heap.`,
            next: inOrder ? 'Stop here.' : 'Swap them to move the larger value up.',
            codeLine: 9,
            variables: { i, parent },
            view: heapView(cells, { [i]: 'compare', [parent]: 'compare' }),
          });
          if (inOrder) break;
          swapCells(cells, i, parent);
          steps.push({
            title: `Swap ${value} and ${p}`,
            why: `${value} moves up one level. This is called sifting up. Only one path to the root is touched, so it takes at most log n swaps.`,
            codeLine: 10,
            variables: { i: parent, parent },
            view: heapView(cells, { [i]: 'swap', [parent]: 'swap' }),
          });
          i = parent;
        }
        steps.push({
          title: i === 0 ? `${value} is the new maximum` : `${value} has found its place`,
          why: 'Every parent is at least as large as its children again, so the largest value is at the root.',
          codeLine: 12,
          variables: { i },
          view: heapView(cells, { [i]: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'extractMax',
      label: 'Extract max',
      args: [],
      run(state) {
        if (state.length === 0) {
          return refuse(state, view(state), 'The heap is empty', 'There is no maximum to extract.', 16);
        }
        const cells = toCells(state);
        const max = state[0]!;
        const steps: Step[] = [
          {
            title: `The maximum is ${max}, at the root`,
            why: 'In a max-heap every parent is at least as large as its children, so the largest value is always at index 0.',
            next: state.length > 1 ? 'Move the last item into the root to fill the hole.' : 'Remove it.',
            codeLine: 17,
            variables: { max },
            view: heapView(cells, { 0: 'swap', ...(state.length > 1 && { [state.length - 1]: 'compare' }) }),
          },
        ];

        const last = cells.pop()!;
        if (cells.length === 0) {
          steps.push({
            title: 'The heap is now empty',
            why: `extractMax returned ${max}, which was the only item.`,
            codeLine: 19,
            variables: { max },
            view: heapView(cells),
          });
          return { steps, state: [] };
        }

        cells[0] = last;
        steps.push({
          title: `Move ${last.value} to the root`,
          why: 'Taking the last item keeps the tree complete, but it is probably too small to be at the top.',
          next: 'Compare it with its children.',
          codeLine: 20,
          variables: { max, i: 0 },
          view: heapView(cells, { 0: 'active' }),
        });

        let i = 0;
        for (;;) {
          const left = 2 * i + 1;
          const right = 2 * i + 2;
          if (left >= cells.length) break;
          let largest = i;
          if (val(cells, left) > val(cells, largest)) largest = left;
          if (right < cells.length && val(cells, right) > val(cells, largest)) largest = right;
          const kids = [left, right].filter((k) => k < cells.length);
          const current = val(cells, i);
          steps.push({
            title: `Compare ${current} with its ${kids.length === 1 ? 'child' : 'children'} ${kids.map((k) => val(cells, k)).join(' and ')}`,
            why:
              largest === i
                ? `${current} is at least as large as ${kids.length === 1 ? 'its child' : 'both children'}, so the heap rule holds here.`
                : `${val(cells, largest)} is the largest of the three, so it must become the parent.`,
            next: largest === i ? 'Stop here.' : `Swap ${current} with ${val(cells, largest)}.`,
            codeLine: largest === right ? 26 : 25,
            variables: { max, i, largest },
            view: heapView(cells, { [i]: 'active', ...Object.fromEntries(kids.map((k) => [k, 'compare'])) }),
          });
          if (largest === i) break;
          const moved = val(cells, largest);
          swapCells(cells, i, largest);
          steps.push({
            title: `Swap ${current} and ${moved}`,
            why: `${current} moves down one level. This is called sifting down. Always swapping with the larger child keeps the other child valid too.`,
            codeLine: 28,
            variables: { max, i: largest },
            view: heapView(cells, { [i]: 'swap', [largest]: 'swap' }),
          });
          i = largest;
        }

        steps.push({
          title: `The heap is valid again, with ${cells[0]!.value} on top`,
          why: `extractMax returned ${max}. Sifting down follows one path from root to leaf, so it takes at most log n swaps.`,
          codeLine: 31,
          variables: { max },
          view: heapView(cells, { 0: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
  ],
};
