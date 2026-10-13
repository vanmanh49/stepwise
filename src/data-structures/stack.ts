import { toCells, withRoles } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, Role, StackView } from '../types/visualization';
import { FULL_WHY, isFull, refuse } from './shared';

const code = `class Stack {
  private items: number[] = [];

  push(value: number): void {
    this.items.push(value);
  }

  pop(): number | undefined {
    return this.items.pop();
  }

  peek(): number | undefined {
    return this.items[this.items.length - 1];
  }
}`;

const stackView = (cells: Cell[], roles: Record<number, Role> = {}): StackView => ({
  kind: 'stack',
  items: withRoles(cells, roles),
});
const view = (state: number[]) => stackView(toCells(state));
const EMPTY_WHY = 'There is no top item. Real code must check for an empty stack first (this is called stack underflow).';

export const stackStructure: StructureDef = {
  initial: [10, 20, 30],
  view,
  code,
  ops: [
    {
      id: 'push',
      label: 'Push',
      args: [{ name: 'value', label: 'Value', sample: 40 }],
      run(state, [value = 0]) {
        if (isFull(state)) return refuse(state, view(state), 'The stack is full', FULL_WHY, 4);
        const cells = toCells(state);
        const next = [...cells, { id: 'new', value, role: 'default' as Role }];
        return {
          state: [...state, value],
          steps: [
            {
              title: `Push ${value}`,
              why: 'A stack only allows adding at one end, the top. Think of a pile of plates.',
              next: `Place ${value} on top.`,
              codeLine: 4,
              variables: { value, size: state.length },
              view: stackView(cells, state.length > 0 ? { [state.length - 1]: 'active' } : {}),
            },
            {
              title: `${value} is the new top`,
              why: 'Nothing below it moved, so push is O(1). The newest item is now the first one that can leave.',
              codeLine: 5,
              variables: { value, size: next.length },
              view: stackView(next, { [next.length - 1]: 'found' }),
            },
          ],
        };
      },
    },
    {
      id: 'pop',
      label: 'Pop',
      args: [],
      run(state) {
        if (state.length === 0) return refuse(state, view(state), 'The stack is empty', EMPTY_WHY, 9);
        const cells = toCells(state);
        const top = state.at(-1)!;
        const rest = cells.slice(0, -1);
        return {
          state: state.slice(0, -1),
          steps: [
            {
              title: `Pop the top item, ${top}`,
              why: 'Only the top can be removed. It is the item that was pushed most recently: last in, first out.',
              codeLine: 9,
              variables: { size: state.length },
              view: stackView(cells, { [cells.length - 1]: 'swap' }),
            },
            {
              title: rest.length > 0 ? `${rest.at(-1)!.value} is the new top` : 'The stack is now empty',
              why: `pop returned ${top}. Nothing else moved, so pop is O(1).`,
              codeLine: 9,
              variables: { returned: top, size: rest.length },
              view: stackView(rest, rest.length > 0 ? { [rest.length - 1]: 'active' } : {}),
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
        if (state.length === 0) return refuse(state, view(state), 'The stack is empty', EMPTY_WHY, 13);
        const cells = toCells(state);
        const top = state.at(-1)!;
        return {
          state,
          steps: [
            {
              title: 'Look at the top item',
              why: 'Peek reads the top without removing it. Items below the top stay hidden.',
              codeLine: 13,
              variables: { size: state.length },
              view: stackView(cells, { [cells.length - 1]: 'active' }),
            },
            {
              title: `The top is ${top}`,
              why: 'The stack is unchanged. Peek is O(1).',
              codeLine: 13,
              variables: { returned: top, size: state.length },
              view: stackView(cells, { [cells.length - 1]: 'found' }),
            },
          ],
        };
      },
    },
  ],
};
