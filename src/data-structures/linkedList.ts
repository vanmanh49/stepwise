import { toCells, withRoles } from '../algorithms/sorting/cells';
import type { StructureDef } from '../types/lesson';
import type { Cell, ListView, Role, Step } from '../types/visualization';
import { FULL_WHY, isFull, refuse } from './shared';

const code = `class LinkedList {
  head: ListNode | null = null;

  insertHead(value: number): void {
    const node = new ListNode(value);
    node.next = this.head;
    this.head = node;
  }

  insertTail(value: number): void {
    const node = new ListNode(value);
    if (!this.head) { this.head = node; return; }
    let current = this.head;
    while (current.next) current = current.next;
    current.next = node;
  }

  search(value: number): ListNode | null {
    let current = this.head;
    while (current && current.value !== value) {
      current = current.next;
    }
    return current;
  }

  delete(value: number): void {
    if (!this.head) return;
    if (this.head.value === value) { this.head = this.head.next; return; }
    let current = this.head;
    while (current.next && current.next.value !== value) {
      current = current.next;
    }
    if (current.next) current.next = current.next.next;
  }
}`;

function listView(
  cells: Cell[],
  roles: Record<number, Role> = {},
  pointers: Record<string, number> = { head: 0 },
): ListView {
  return { kind: 'linked-list', nodes: withRoles(cells, roles), pointers };
}

const view = (state: number[]) => listView(toCells(state));
const values = (cells: Cell[]) => cells.map((c) => c.value as number);
const walked = (upTo: number) => Object.fromEntries(Array.from({ length: upTo }, (_, k) => [k, 'visited' as Role]));

export const linkedListStructure: StructureDef = {
  initial: [10, 20, 30, 40],
  view,
  code,
  ops: [
    {
      id: 'insertHead',
      label: 'Insert at head',
      args: [{ name: 'value', label: 'Value', sample: 5 }],
      run(state, [value = 0]) {
        if (isFull(state)) return refuse(state, view(state), 'The list is full', FULL_WHY, 4);
        const cells = toCells(state);
        const steps: Step[] = [
          {
            title: `Create a new node holding ${value}`,
            why: 'A linked list grows one node at a time. Each node stores a value and a pointer to the next node.',
            next: 'Point the new node at the current head.',
            codeLine: 5,
            variables: { value },
            view: listView(cells),
          },
        ];
        cells.unshift({ id: 'new', value, role: 'default' });
        steps.push({
          title: state.length > 0 ? `Point the new node at ${state[0]}` : 'Point the new node at null',
          why: 'Linking the new node first means the rest of the list is never lost.',
          next: 'Move head to the new node.',
          codeLine: 6,
          variables: { value },
          // head still points at the old first node, or at null for an empty list
          view: listView(cells, { 0: 'found' }, { head: 1 }),
        });
        steps.push({
          title: `Move head to ${value}`,
          why: 'Only two pointers changed and nothing was shifted, so inserting at the head is O(1).',
          codeLine: 7,
          variables: { value },
          view: listView(cells, { 0: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'insertTail',
      label: 'Insert at tail',
      args: [{ name: 'value', label: 'Value', sample: 50 }],
      run(state, [value = 0]) {
        if (isFull(state)) return refuse(state, view(state), 'The list is full', FULL_WHY, 10);
        const cells = toCells(state);
        const steps: Step[] = [
          {
            title: `Create a new node holding ${value}`,
            why:
              state.length > 0
                ? 'This list only remembers its head, so the last node has to be found by walking from the start.'
                : 'The list is empty, so the new node becomes the head.',
            codeLine: state.length > 0 ? 11 : 12,
            variables: { value },
            view: listView(cells),
          },
        ];
        for (let i = 0; i < state.length; i++) {
          const last = i === state.length - 1;
          steps.push({
            title: last ? `${state[i]} is the last node` : `Step past ${state[i]}`,
            why: last
              ? 'Its next pointer is null, which marks the end of the list.'
              : 'It has a next node, so this is not the end yet.',
            codeLine: 14,
            variables: { value, current: state[i]! },
            view: listView(cells, { ...walked(i), [i]: 'active' }, { head: 0, current: i }),
          });
        }
        cells.push({ id: 'new', value, role: 'default' });
        steps.push({
          title: state.length > 0 ? `Link ${state.at(-1)} to the new node` : `Set head to ${value}`,
          why:
            state.length > 0
              ? `Reaching the tail took ${state.length} step${state.length === 1 ? '' : 's'}, so this insert is O(n). Keeping a tail pointer would make it O(1).`
              : 'With no nodes to walk past, this takes a single step.',
          codeLine: state.length > 0 ? 15 : 12,
          variables: { value },
          view: listView(cells, { [cells.length - 1]: 'found' }),
        });
        return { steps, state: values(cells) };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 30 }],
      run(state, [value = 0]) {
        const cells = toCells(state);
        const steps: Step[] = [
          {
            title: `Search for ${value}`,
            why: 'There are no indexes to jump to. The only way to reach a node is to follow the pointers from the head.',
            codeLine: 19,
            variables: { value },
            view: listView(cells),
          },
        ];
        for (let i = 0; i < state.length; i++) {
          const match = state[i] === value;
          steps.push({
            title: match ? `Found ${value}` : `${state[i]} is not ${value}`,
            why: match
              ? `It took ${i + 1} node visit${i === 0 ? '' : 's'} to get here.`
              : 'No match, so follow the next pointer.',
            codeLine: match ? 23 : 20,
            variables: { value, current: state[i]! },
            view: listView(cells, { ...walked(i), [i]: match ? 'found' : 'compare' }, { head: 0, current: i }),
          });
          if (match) return { steps, state };
        }
        steps.push({
          title: `${value} is not in the list`,
          why: 'current reached null, the end of the list, without finding a match.',
          codeLine: 23,
          variables: { value, current: 'null' },
          view: listView(cells, walked(state.length), { head: 0, current: state.length }),
        });
        return { steps, state };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'value', label: 'Value', sample: 20 }],
      run(state, [value = 0]) {
        if (state.length === 0) {
          return refuse(state, view(state), 'The list is empty', 'There are no nodes to delete.', 27);
        }
        const cells = toCells(state);
        const steps: Step[] = [];

        if (state[0] === value) {
          steps.push({
            title: `The head holds ${value}`,
            why: 'Deleting the head needs no search: just move head to the second node.',
            codeLine: 28,
            variables: { value },
            view: listView(cells, { 0: 'swap' }),
          });
          cells.shift();
          steps.push({
            title: cells.length > 0 ? `Head now points at ${cells[0]!.value}` : 'The list is now empty',
            why: 'Nothing points at the old head any more, so it is gone. This is O(1).',
            codeLine: 28,
            view: listView(cells),
          });
          return { steps, state: values(cells) };
        }

        steps.push({
          title: `Look for the node before ${value}`,
          why: 'To remove a node you must change the pointer of the node in front of it, so the search looks one node ahead.',
          codeLine: 29,
          variables: { value },
          view: listView(cells),
        });
        let i = 0;
        while (i + 1 < state.length && state[i + 1] !== value) {
          steps.push({
            title: `The node after ${state[i]} is ${state[i + 1]}, not ${value}`,
            why: 'Not the one to delete, so move forward.',
            codeLine: 30,
            variables: { value, current: state[i]! },
            view: listView(cells, { ...walked(i), [i]: 'active', [i + 1]: 'compare' }, { head: 0, current: i }),
          });
          i++;
        }
        if (i + 1 >= state.length) {
          steps.push({
            title: `${value} is not in the list`,
            why: `${state[i]} is the last node, so there is nothing to delete.`,
            codeLine: 33,
            variables: { value, current: state[i]! },
            view: listView(cells, walked(state.length), { head: 0, current: i }),
          });
          return { steps, state };
        }
        steps.push({
          title: `The node after ${state[i]} is ${value}`,
          why: `${state[i]} is the node whose pointer must change.`,
          next: `Point ${state[i]} past ${value}.`,
          codeLine: 30,
          variables: { value, current: state[i]! },
          view: listView(cells, { ...walked(i), [i]: 'active', [i + 1]: 'swap' }, { head: 0, current: i }),
        });
        cells.splice(i + 1, 1);
        steps.push({
          title:
            i + 1 < cells.length ? `Point ${state[i]} at ${cells[i + 1]!.value}` : `Point ${state[i]} at null`,
          why: `The list now skips ${value}. No values were shifted, but finding the node took a walk: O(n).`,
          codeLine: 33,
          variables: { value, current: state[i]! },
          view: listView(cells, { [i]: 'active' }, { head: 0, current: i }),
        });
        return { steps, state: values(cells) };
      },
    },
  ],
};
