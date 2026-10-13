import { arrayView, swapCells, toCells } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, Role, Step } from '../types/visualization';
import { FULL_WHY, isFull, refuse } from './shared';

const code = `class DynamicArray {
  items: number[] = [];

  access(index: number): number {
    return this.items[index]; // jump straight to the slot
  }

  update(index: number, value: number): void {
    this.items[index] = value;
  }

  insert(index: number, value: number): void {
    for (let i = this.items.length; i > index; i--) {
      this.items[i] = this.items[i - 1]; // shift right
    }
    this.items[index] = value;
  }

  delete(index: number): void {
    for (let i = index; i < this.items.length - 1; i++) {
      this.items[i] = this.items[i + 1]; // shift left
    }
    this.items.length--;
  }

  search(value: number): number {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i] === value) return i;
    }
    return -1;
  }

  swap(i: number, j: number): void {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }
}`;

const view = (state: number[]) => arrayView(toCells(state));
const values = (cells: Cell[]) => cells.map((c) => c.value as number);
const from = (start: number, end: number, role: Role) =>
  Object.fromEntries(Array.from({ length: Math.max(0, end - start) }, (_, k) => [start + k, role]));

function outOfRange(state: number[], index: number, max: number, codeLine: number) {
  return refuse(
    state,
    view(state),
    `Index ${index} is out of range`,
    state.length === 0 && max < 0
      ? 'The array is empty, so there is no index to use.'
      : `Valid indexes here are 0 to ${max}. Reading or writing outside the array is a bug in real code.`,
    codeLine,
  );
}

const valid = (index: number, max: number) => Number.isInteger(index) && index >= 0 && index <= max;

export const arrayStructure: StructureDef = {
  initial: [10, 20, 30, 40, 50],
  view,
  code,
  ops: [
    {
      id: 'access',
      label: 'Access',
      args: [{ name: 'index', label: 'Index', sample: 2 }],
      run(state, [index = 0]) {
        if (!valid(index, state.length - 1)) return outOfRange(state, index, state.length - 1, 5);
        const cells = toCells(state);
        return {
          state,
          steps: [
            {
              title: `Go straight to index ${index}`,
              why: 'Array slots sit side by side in memory, so the position of any index can be calculated. No scanning is needed.',
              next: 'Read the value stored there.',
              codeLine: 5,
              variables: { index },
              view: arrayView(cells, { [index]: 'active' }, [], { index }),
            },
            {
              title: `Read ${state[index]}`,
              why: 'Access takes the same single step whether the array has 5 items or 5 million. That is O(1).',
              codeLine: 5,
              variables: { index, value: state[index]! },
              view: arrayView(cells, { [index]: 'found' }, [], { index }),
            },
          ],
        };
      },
    },
    {
      id: 'insert',
      label: 'Insert',
      args: [
        { name: 'index', label: 'Index', sample: 1 },
        { name: 'value', label: 'Value', sample: 15 },
      ],
      run(state, [index = 0, value = 0]) {
        if (isFull(state)) return refuse(state, view(state), 'The array is full', FULL_WHY, 13);
        if (!valid(index, state.length)) return outOfRange(state, index, state.length, 13);
        const cells = toCells(state);
        const moving = state.length - index;
        const steps: Step[] = [
          {
            title: `Insert ${value} at index ${index}`,
            why:
              moving > 0
                ? `Slots must stay contiguous, so the ${moving} value${moving === 1 ? '' : 's'} from index ${index} onward must move right to make room.`
                : 'Inserting at the end needs no shifting, because nothing sits after it.',
            codeLine: 13,
            variables: { index, value },
            view: arrayView(cells, from(index, state.length, 'compare'), [], { index }),
          },
        ];
        cells.splice(index, 0, { id: 'new', value: '', role: 'discarded' });
        if (moving > 0) {
          steps.push({
            title: `Shift ${moving} value${moving === 1 ? '' : 's'} one slot to the right`,
            why: 'Shifting starts from the end so that no value is overwritten. This is why inserting near the front costs O(n).',
            next: `Write ${value} into the gap.`,
            codeLine: 14,
            variables: { index, value },
            view: arrayView(cells, { ...from(index + 1, cells.length, 'swap'), [index]: 'discarded' }, [], { index }),
          });
        }
        cells[index] = { id: 'new', value, role: 'default' };
        steps.push({
          title: `Write ${value} at index ${index}`,
          why: 'The gap is free, so the new value can be stored without losing anything.',
          codeLine: 16,
          variables: { index, value },
          view: arrayView(cells, { [index]: 'found' }, [], { index }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'index', label: 'Index', sample: 1 }],
      run(state, [index = 0]) {
        if (!valid(index, state.length - 1)) return outOfRange(state, index, state.length - 1, 20);
        const cells = toCells(state);
        const moving = state.length - 1 - index;
        const steps: Step[] = [
          {
            title: `Delete ${state[index]} at index ${index}`,
            why: 'An array cannot have a hole in the middle, so every value after this one must move left.',
            codeLine: 20,
            variables: { index },
            view: arrayView(cells, { [index]: 'swap' }, [], { index }),
          },
        ];
        cells.splice(index, 1);
        if (moving > 0) {
          steps.push({
            title: `Shift ${moving} value${moving === 1 ? '' : 's'} one slot to the left`,
            why: 'Each later value overwrites the slot before it. Deleting near the front costs O(n) for the same reason inserting does.',
            codeLine: 21,
            variables: { index },
            view: arrayView(cells, from(index, cells.length, 'swap')),
          });
        }
        steps.push({
          title: `The array now has ${cells.length} item${cells.length === 1 ? '' : 's'}`,
          why: 'The length shrinks by one and the values are contiguous again.',
          codeLine: 23,
          view: arrayView(cells),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 40 }],
      run(state, [value = 0]) {
        const cells = toCells(state);
        const steps: Step[] = [
          {
            title: `Search for ${value}`,
            why: 'Knowing a value does not tell you its index, so an unsorted array has to be checked slot by slot.',
            codeLine: 27,
            variables: { value },
            view: arrayView(cells),
          },
        ];
        for (let i = 0; i < state.length; i++) {
          const match = state[i] === value;
          steps.push({
            title: match ? `Found ${value} at index ${i}` : `Index ${i} holds ${state[i]}, not ${value}`,
            why: match
              ? `It took ${i + 1} check${i === 0 ? '' : 's'}. In the worst case every slot is checked: O(n).`
              : 'No match, so move one slot to the right.',
            codeLine: 28,
            variables: { value, i },
            view: arrayView(cells, { ...from(0, i, 'discarded'), [i]: match ? 'found' : 'compare' }, [], { i }),
          });
          if (match) return { steps, state };
        }
        steps.push({
          title: `${value} is not in the array`,
          why: `All ${state.length} slots were checked without a match, so the search returns -1.`,
          codeLine: 30,
          variables: { value, result: -1 },
          view: arrayView(cells, from(0, state.length, 'discarded')),
        });
        return { steps, state };
      },
    },
    {
      id: 'update',
      label: 'Update',
      args: [
        { name: 'index', label: 'Index', sample: 0 },
        { name: 'value', label: 'Value', sample: 99 },
      ],
      run(state, [index = 0, value = 0]) {
        if (!valid(index, state.length - 1)) return outOfRange(state, index, state.length - 1, 9);
        const cells = toCells(state);
        const old = state[index]!;
        const steps: Step[] = [
          {
            title: `Go straight to index ${index}`,
            why: `Like access, update needs no scanning. The slot currently holds ${old}.`,
            codeLine: 9,
            variables: { index, value },
            view: arrayView(cells, { [index]: 'active' }, [], { index }),
          },
        ];
        cells[index] = { ...cells[index]!, value };
        steps.push({
          title: `Overwrite ${old} with ${value}`,
          why: 'Only one slot changes and nothing moves, so update is O(1).',
          codeLine: 9,
          variables: { index, value },
          view: arrayView(cells, { [index]: 'found' }, [], { index }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'swap',
      label: 'Swap',
      args: [
        { name: 'i', label: 'Index i', sample: 0 },
        { name: 'j', label: 'Index j', sample: 4 },
      ],
      run(state, [i = 0, j = 0]) {
        const max = state.length - 1;
        if (!valid(i, max)) return outOfRange(state, i, max, 34);
        if (!valid(j, max)) return outOfRange(state, j, max, 34);
        const cells = toCells(state);
        const steps: Step[] = [
          {
            title: `Select indexes ${i} and ${j}`,
            why: `They hold ${state[i]} and ${state[j]}. Both slots can be reached directly.`,
            codeLine: 34,
            variables: { i, j },
            view: arrayView(cells, { [i]: 'compare', [j]: 'compare' }, [], { i, j }),
          },
        ];
        swapCells(cells, i, j);
        steps.push({
          title: `Swap ${state[i]} and ${state[j]}`,
          why: 'Two reads and two writes, no matter how far apart the slots are. Sorting algorithms are built from this move.',
          codeLine: 34,
          variables: { i, j },
          view: arrayView(cells, { [i]: 'swap', [j]: 'swap' }, [], { i, j }),
        });
        return { steps, state: values(cells) };
      },
    },
  ],
};
