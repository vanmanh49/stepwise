import { toCells, withRoles } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, QueueView, Role } from '../types/visualization';
import { FULL_WHY, isFull, refuse } from './shared';

const code = `class Queue {
  private items: number[] = [];

  enqueue(value: number): void {
    this.items.push(value); // join at the rear
  }

  dequeue(): number | undefined {
    return this.items.shift(); // leave from the front
  }

  peek(): number | undefined {
    return this.items[0];
  }
}`;

const queueView = (cells: Cell[], roles: Record<number, Role> = {}): QueueView => ({
  kind: 'queue',
  items: withRoles(cells, roles),
});
const view = (state: number[]) => queueView(toCells(state));
const EMPTY_WHY = 'There is no front item. Real code must check for an empty queue before removing from it.';

export const queueStructure: StructureDef = {
  initial: [10, 20, 30, 40],
  view,
  code,
  ops: [
    {
      id: 'enqueue',
      label: 'Enqueue',
      args: [{ name: 'value', label: 'Value', sample: 50 }],
      run(state, [value = 0]) {
        if (isFull(state)) return refuse(state, view(state), 'The queue is full', FULL_WHY, 4);
        const cells = toCells(state);
        const next = [...cells, { id: 'new', value, role: 'default' as Role }];
        return {
          state: [...state, value],
          steps: [
            {
              title: `Enqueue ${value}`,
              why: 'New items always join at the rear, like the end of a line at a shop.',
              next: `Add ${value} behind the current rear.`,
              codeLine: 4,
              variables: { value, size: state.length },
              view: queueView(cells, state.length > 0 ? { [state.length - 1]: 'active' } : {}),
            },
            {
              title: `${value} is the new rear`,
              why: `Everything that was already waiting will leave before ${value} does: first in, first out.`,
              codeLine: 5,
              variables: { value, size: next.length },
              view: queueView(next, { [next.length - 1]: 'found' }),
            },
          ],
        };
      },
    },
    {
      id: 'dequeue',
      label: 'Dequeue',
      args: [],
      run(state) {
        if (state.length === 0) return refuse(state, view(state), 'The queue is empty', EMPTY_WHY, 9);
        const cells = toCells(state);
        const front = state[0]!;
        const rest = cells.slice(1);
        return {
          state: state.slice(1),
          steps: [
            {
              title: `Dequeue the front item, ${front}`,
              why: 'Only the front can leave. It is the item that has waited longest: first in, first out.',
              codeLine: 9,
              variables: { size: state.length },
              view: queueView(cells, { 0: 'swap' }),
            },
            {
              title: rest.length > 0 ? `${rest[0]!.value} is the new front` : 'The queue is now empty',
              why: `dequeue returned ${front}. A linked list or circular buffer makes this O(1); array.shift() as shown here is O(n) because it moves every item.`,
              codeLine: 9,
              variables: { returned: front, size: rest.length },
              view: queueView(rest, rest.length > 0 ? { 0: 'active' } : {}),
            },
          ],
        };
      },
    },
    {
      id: 'peek',
      label: 'Peek',
      args: [],
      run(state) {
        if (state.length === 0) return refuse(state, view(state), 'The queue is empty', EMPTY_WHY, 13);
        const cells = toCells(state);
        return {
          state,
          steps: [
            {
              title: 'Look at the front item',
              why: 'Peek reads who is next without removing them from the line.',
              codeLine: 13,
              variables: { size: state.length },
              view: queueView(cells, { 0: 'active' }),
            },
            {
              title: `The front is ${state[0]}`,
              why: 'The queue is unchanged. Peek is O(1).',
              codeLine: 13,
              variables: { returned: state[0]!, size: state.length },
              view: queueView(cells, { 0: 'found' }),
            },
          ],
        };
      },
    },
  ],
};
