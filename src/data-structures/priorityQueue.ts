import { swapCells, toCells, val, withRoles } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, HeapView, Role, Step } from '../types/visualization';
import { refuse } from './shared';

const MAX_ITEMS = 15;

const code = `class PriorityQueue {
  private heap: number[] = [];

  enqueue(priority: number): void {
    this.heap.push(priority);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent] <= this.heap[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  dequeue(): number | undefined {
    if (this.heap.length === 0) return undefined;
    const first = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return first;
    this.heap[0] = last;
    let i = 0;
    while (true) {
      const left = 2 * i + 1, right = 2 * i + 2;
      let smallest = i;
      if (left < this.heap.length && this.heap[left] < this.heap[smallest]) smallest = left;
      if (right < this.heap.length && this.heap[right] < this.heap[smallest]) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return first;
  }

  peek(): number | undefined {
    return this.heap[0];
  }
}`;

const heapView = (cells: Cell[], roles: Record<number, Role> = {}): HeapView => ({
  kind: 'heap',
  items: withRoles(cells, roles),
});
const view = (state: number[]) => heapView(toCells(state));
const values = (cells: Cell[]) => cells.map((c) => c.value as number);
const EMPTY_WHY = 'Nothing is waiting. Real code must check for an empty queue first.';

/** A min-heap: the smallest number is the most urgent and leaves first. */
export const priorityQueueStructure: StructureDef = {
  initial: [2, 5, 3, 9, 7],
  view,
  code,
  ops: [
    {
      id: 'enqueue',
      label: 'Enqueue',
      args: [{ name: 'priority', label: 'Priority', sample: 1 }],
      run(state, [priority = 0]) {
        if (state.length >= MAX_ITEMS) {
          return refuse(
            state,
            view(state),
            'The queue is full',
            `This visualization holds at most ${MAX_ITEMS} items so the tree stays readable. Dequeue something first.`,
            4,
          );
        }
        const cells = [...toCells(state), { id: 'new', value: priority, role: 'default' as Role }];
        let i = cells.length - 1;
        const steps: Step[] = [
          {
            title: `Add priority ${priority} at the end`,
            why: 'New items join at the next free slot, the bottom of the tree. They do not go to the back of a line: their priority decides how far up they move.',
            next: i > 0 ? 'Compare it with its parent.' : undefined,
            codeLine: 5,
            variables: { i },
            view: heapView(cells, { [i]: 'found' }),
          },
        ];
        while (i > 0) {
          const parent = Math.floor((i - 1) / 2);
          const p = val(cells, parent);
          const inOrder = p <= priority;
          steps.push({
            title: `Compare ${priority} with its parent ${p}`,
            why: inOrder
              ? `${p} ≤ ${priority}, so the parent is at least as urgent. The item stays here.`
              : `${priority} < ${p}. A smaller number is more urgent, and a more urgent item must never sit below a less urgent one.`,
            next: inOrder ? 'Stop here.' : 'Swap them to move the urgent item up.',
            codeLine: 9,
            variables: { i, parent },
            view: heapView(cells, { [i]: 'compare', [parent]: 'compare' }),
          });
          if (inOrder) break;
          swapCells(cells, i, parent);
          steps.push({
            title: `Swap ${priority} and ${p}`,
            why: `${priority} overtakes ${p} and moves up one level. At most one swap per level is needed: O(log n).`,
            codeLine: 10,
            variables: { i: parent, parent },
            view: heapView(cells, { [i]: 'swap', [parent]: 'swap' }),
          });
          i = parent;
        }
        steps.push({
          title: i === 0 ? `${priority} is now first in line` : `${priority} has found its place`,
          why: 'Every parent is at least as urgent as its children again, so the most urgent item is at the root.',
          codeLine: 12,
          variables: { i },
          view: heapView(cells, { [i]: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'dequeue',
      label: 'Dequeue',
      args: [],
      run(state) {
        if (state.length === 0) return refuse(state, view(state), 'The queue is empty', EMPTY_WHY, 16);
        const cells = toCells(state);
        const first = state[0]!;
        const steps: Step[] = [
          {
            title: `The most urgent item is ${first}, at the root`,
            why: 'A priority queue always serves the smallest priority number next, whatever order the items arrived in.',
            next: state.length > 1 ? 'Move the last item into the root to fill the hole.' : 'Remove it.',
            codeLine: 17,
            variables: { first },
            view: heapView(cells, { 0: 'swap', ...(state.length > 1 && { [state.length - 1]: 'compare' }) }),
          },
        ];

        const last = cells.pop()!;
        if (cells.length === 0) {
          steps.push({
            title: 'The queue is now empty',
            why: `dequeue returned ${first}, which was the only item.`,
            codeLine: 19,
            variables: { first },
            view: heapView(cells),
          });
          return { steps, state: [] };
        }

        cells[0] = last;
        steps.push({
          title: `Move ${last.value} to the root`,
          why: 'Taking the last item keeps the tree complete, but it is probably not the most urgent one.',
          next: 'Compare it with its children.',
          codeLine: 20,
          variables: { first, i: 0 },
          view: heapView(cells, { 0: 'active' }),
        });

        let i = 0;
        for (;;) {
          const left = 2 * i + 1;
          const right = 2 * i + 2;
          if (left >= cells.length) break;
          let smallest = i;
          if (val(cells, left) < val(cells, smallest)) smallest = left;
          if (right < cells.length && val(cells, right) < val(cells, smallest)) smallest = right;
          const kids = [left, right].filter((k) => k < cells.length);
          const current = val(cells, i);
          steps.push({
            title: `Compare ${current} with its ${kids.length === 1 ? 'child' : 'children'} ${kids.map((k) => val(cells, k)).join(' and ')}`,
            why:
              smallest === i
                ? `${current} is at least as urgent as ${kids.length === 1 ? 'its child' : 'both children'}, so the rule holds here.`
                : kids.length === 1
                  ? `${val(cells, smallest)} is smaller than ${current}, so it must become the parent.`
                  : `${val(cells, smallest)} is the smallest of the three, so it must become the parent.`,
            next: smallest === i ? 'Stop here.' : `Swap ${current} with ${val(cells, smallest)}.`,
            codeLine: smallest === right ? 26 : 25,
            variables: { first, i, smallest },
            view: heapView(cells, { [i]: 'active', ...Object.fromEntries(kids.map((k) => [k, 'compare'])) }),
          });
          if (smallest === i) break;
          const moved = val(cells, smallest);
          swapCells(cells, i, smallest);
          steps.push({
            title: `Swap ${current} and ${moved}`,
            why: `${current} moves down one level. Swapping with the smaller child keeps the other child valid too.`,
            codeLine: 28,
            variables: { first, i: smallest },
            view: heapView(cells, { [i]: 'swap', [smallest]: 'swap' }),
          });
          i = smallest;
        }

        steps.push({
          title: `${cells[0]!.value} is next in line`,
          why: `dequeue returned ${first}. Restoring the order followed one path from root to leaf: O(log n).`,
          codeLine: 31,
          variables: { first },
          view: heapView(cells, { 0: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'peek',
      label: 'Peek',
      args: [],
      run(state) {
        if (state.length === 0) return refuse(state, view(state), 'The queue is empty', EMPTY_WHY, 35);
        const cells = toCells(state);
        return {
          state,
          steps: [
            {
              title: 'Look at the root',
              why: 'The most urgent item is always at index 0, so there is nothing to search for.',
              codeLine: 35,
              variables: { size: state.length },
              view: heapView(cells, { 0: 'active' }),
            },
            {
              title: `Next to be served: ${state[0]}`,
              why: 'The queue is unchanged. Peek is O(1).',
              codeLine: 35,
              variables: { returned: state[0]!, size: state.length },
              view: heapView(cells, { 0: 'found' }),
            },
          ],
        };
      },
    },
  ],
};
