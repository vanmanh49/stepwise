import type { StructureDef } from '../types/lesson';
import type { Role, Step, TreeView } from '../types/visualization';
import { refuse } from './shared';

const MAX_NODES = 15;

const code = `class BinaryTree {
  root: TreeNode | null = null;

  insert(value: number): void {
    const node = new TreeNode(value);
    if (!this.root) { this.root = node; return; }
    const queue = [this.root];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!current.left) { current.left = node; return; }
      if (!current.right) { current.right = node; return; }
      queue.push(current.left, current.right);
    }
  }

  height(node = this.root): number {
    if (!node) return 0;
    return 1 + Math.max(this.height(node.left), this.height(node.right));
  }

  levelOrder(): number[] {
    const result: number[] = [];
    const queue = this.root ? [this.root] : [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node.value);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    return result;
  }
}`;

/** Tree for a level-order array: node i has children 2i+1 and 2i+2. Ids come from the position. */
export function levelOrderTree(values: number[], roles: Record<number, Role> = {}): TreeView {
  const id = (i: number) => `n${i}`;
  const nodes = values.map((value, i) => ({
    id: id(i),
    value,
    role: roles[i] ?? 'default',
    ...(2 * i + 1 < values.length && { left: id(2 * i + 1) }),
    ...(2 * i + 2 < values.length && { right: id(2 * i + 2) }),
  }));
  return { kind: 'tree', nodes, ...(values.length > 0 && { root: id(0) }) };
}

const view = (state: number[]) => levelOrderTree(state);
const range = (from: number, to: number, role: Role) =>
  Object.fromEntries(Array.from({ length: Math.max(0, to - from) }, (_, k) => [from + k, role]));

export const binaryTreeStructure: StructureDef = {
  initial: [1, 2, 3, 4, 5],
  view,
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 6 }],
      run(state, [value = 0]) {
        if (state.length >= MAX_NODES) {
          return refuse(
            state,
            view(state),
            'The tree is full',
            `This visualization holds at most ${MAX_NODES} nodes so the tree stays readable. Reset to start again.`,
            4,
          );
        }
        const next = [...state, value];
        if (state.length === 0) {
          return {
            state: next,
            steps: [
              {
                title: 'The tree is empty',
                why: 'With no nodes yet, the new value has nowhere to attach.',
                next: `Make ${value} the root.`,
                codeLine: 5,
                variables: { value },
                view: view(state),
              },
              {
                title: `${value} becomes the root`,
                why: 'The root is the single node at the top. Every other node hangs below it.',
                codeLine: 6,
                variables: { value },
                view: levelOrderTree(next, { 0: 'found' }),
              },
            ],
          };
        }

        const parent = Math.floor((next.length - 1) / 2);
        const isLeft = next.length - 1 === 2 * parent + 1;
        const steps: Step[] = [
          {
            title: `Find the first free spot for ${value}`,
            why: 'A plain binary tree has no ordering rule, so new nodes simply fill each level from left to right. That keeps the tree as shallow as possible.',
            next: 'Check the nodes level by level, starting at the root.',
            codeLine: 7,
            variables: { value },
            view: levelOrderTree(state, { 0: 'active' }),
          },
        ];
        for (let i = 0; i < parent; i++) {
          steps.push({
            title: `${state[i]} already has two children`,
            why: 'Both of its child slots are taken, so move on to the next node in level order.',
            codeLine: 12,
            variables: { value, current: state[i]! },
            view: levelOrderTree(state, { ...range(0, i, 'visited'), [i]: 'compare' }),
          });
        }
        steps.push({
          title: `${state[parent]} has a free ${isLeft ? 'left' : 'right'} slot`,
          why: isLeft
            ? 'It has no children yet, and the left slot is always filled first.'
            : 'Its left slot is taken but its right slot is empty.',
          next: `Attach ${value} there.`,
          codeLine: isLeft ? 10 : 11,
          variables: { value, current: state[parent]! },
          view: levelOrderTree(state, { ...range(0, parent, 'visited'), [parent]: 'active' }),
        });
        steps.push({
          title: `Attach ${value} as the ${isLeft ? 'left' : 'right'} child of ${state[parent]}`,
          why: 'Each node holds a value and up to two pointers, one to a left child and one to a right child.',
          codeLine: isLeft ? 10 : 11,
          variables: { value, nodes: next.length },
          view: levelOrderTree(next, { [parent]: 'active', [next.length - 1]: 'found' }),
        });
        return { steps, state: next };
      },
    },
    {
      id: 'height',
      label: 'Height',
      args: [],
      run(state) {
        if (state.length === 0) {
          return refuse(state, view(state), 'The tree is empty', 'An empty tree has height 0: there are no levels to count.', 17);
        }
        const steps: Step[] = [
          {
            title: 'Measure the height of the tree',
            why: 'The height is the number of levels on the longest path from the root down to a leaf.',
            next: 'Count the levels one at a time.',
            codeLine: 16,
            variables: { height: 0 },
            view: view(state),
          },
        ];
        let level = 0;
        for (let start = 0; start < state.length; start = 2 * start + 1) {
          level++;
          const end = Math.min(state.length, 2 * start + 1);
          steps.push({
            title: `Level ${level}: ${state.slice(start, end).join(', ')}`,
            why:
              end < state.length
                ? 'At least one node on this level has a child, so the tree goes deeper.'
                : 'No node on this level has children. These are leaves, and this is the last level.',
            codeLine: 18,
            variables: { height: level },
            view: levelOrderTree(state, { ...range(0, start, 'visited'), ...range(start, end, 'active') }),
          });
        }
        steps.push({
          title: `The height is ${level}`,
          why: `The code computes this recursively: a node's height is 1 plus the height of its taller subtree. A full tree with ${level} levels can hold up to ${2 ** level - 1} nodes.`,
          codeLine: 18,
          variables: { height: level, nodes: state.length },
          view: levelOrderTree(state, range(0, state.length, 'visited')),
        });
        return { steps, state };
      },
    },
    {
      id: 'levelOrder',
      label: 'Level-order walk',
      args: [],
      run(state) {
        if (state.length === 0) {
          return refuse(state, view(state), 'The tree is empty', 'There are no nodes to visit.', 23);
        }
        const output: number[] = [];
        const steps: Step[] = [
          {
            title: 'Visit every node, level by level',
            why: 'A tree has no single "next" node, so visiting them all needs a strategy. This one uses a queue to go across each level before going down.',
            codeLine: 23,
            variables: { queue: String(state[0]), output: '—' },
            view: levelOrderTree(state, { 0: 'frontier' }),
          },
        ];
        for (let i = 0; i < state.length; i++) {
          output.push(state[i]!);
          const children = [2 * i + 1, 2 * i + 2].filter((c) => c < state.length);
          // In a level-order array the queue is always the positions after i, up to its last child.
          const queueEnd = Math.min(state.length, 2 * i + 3);
          const roles = { ...range(0, i, 'visited'), ...range(i + 1, queueEnd, 'frontier'), [i]: 'active' as Role };
          steps.push({
            title: `Visit ${state[i]}`,
            why:
              children.length > 0
                ? `It is at the front of the queue. Its ${children.length === 1 ? 'child' : 'children'} (${children.map((c) => state[c]).join(', ')}) join the back, so they wait until this level is finished.`
                : 'It is at the front of the queue and has no children to add.',
            codeLine: 26,
            variables: { queue: state.slice(i + 1, queueEnd).join(', ') || 'empty', output: output.join(', ') },
            view: levelOrderTree(state, roles),
          });
        }
        steps.push({
          title: 'The walk is complete',
          why: 'The queue is empty, so every node has been visited once, top to bottom and left to right.',
          codeLine: 30,
          variables: { output: output.join(', ') },
          view: levelOrderTree(state, range(0, state.length, 'visited')),
        });
        return { steps, state };
      },
    },
  ],
};
