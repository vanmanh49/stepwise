import { levelOrderTree } from '../../data-structures/binaryTree';
import type { StructureDef, StructureOp } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';

export type TraversalOrder = 'preorder' | 'inorder' | 'postorder' | 'levelorder';

export const traversalCode = `function preorder(node: TreeNode | null, visit: (v: number) => void): void {
  if (!node) return;
  visit(node.value);
  preorder(node.left, visit);
  preorder(node.right, visit);
}

function inorder(node: TreeNode | null, visit: (v: number) => void): void {
  if (!node) return;
  inorder(node.left, visit);
  visit(node.value);
  inorder(node.right, visit);
}

function postorder(node: TreeNode | null, visit: (v: number) => void): void {
  if (!node) return;
  postorder(node.left, visit);
  postorder(node.right, visit);
  visit(node.value);
}

function levelOrder(root: TreeNode | null, visit: (v: number) => void): void {
  const queue = root ? [root] : [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    visit(node.value);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
}`;

/** Line numbers in traversalCode: where each function starts and where it visits. */
const LINES: Record<TraversalOrder, { start: number; visit: number; descend: number }> = {
  preorder: { start: 1, visit: 3, descend: 4 },
  inorder: { start: 8, visit: 11, descend: 10 },
  postorder: { start: 15, visit: 19, descend: 17 },
  levelorder: { start: 22, visit: 26, descend: 27 },
};

const RULE: Record<TraversalOrder, { name: string; rule: string }> = {
  preorder: { name: 'Preorder', rule: 'visit the node first, then its left subtree, then its right subtree' },
  inorder: { name: 'Inorder', rule: 'visit the left subtree first, then the node, then its right subtree' },
  postorder: { name: 'Postorder', rule: 'visit the left subtree, then the right subtree, and the node last' },
  levelorder: { name: 'Level order', rule: 'visit the nodes one level at a time, left to right, using a queue' },
};

/** Position order in which a level-order array is visited (node i has children 2i+1 and 2i+2). */
function visitOrder(n: number, order: TraversalOrder): number[] {
  if (order === 'levelorder') return Array.from({ length: n }, (_, i) => i);
  const result: number[] = [];
  const walk = (i: number): void => {
    if (i >= n) return;
    if (order === 'preorder') result.push(i);
    walk(2 * i + 1);
    if (order === 'inorder') result.push(i);
    walk(2 * i + 2);
    if (order === 'postorder') result.push(i);
  };
  walk(0);
  return result;
}

export function traverse(levelOrder: number[], order: TraversalOrder): number[] {
  return visitOrder(levelOrder.length, order).map((i) => levelOrder[i]!);
}

const parentOf = (i: number) => Math.floor((i - 1) / 2);

function reason(values: number[], i: number, order: TraversalOrder): string {
  const n = values.length;
  const hasLeft = 2 * i + 1 < n;
  const hasRight = 2 * i + 2 < n;
  const v = values[i];
  switch (order) {
    case 'preorder':
      return hasLeft
        ? `Preorder visits a node the moment it arrives, before either subtree. Next it goes into the left subtree of ${v}.`
        : `${v} is visited on arrival. It has no children, so the walk returns to its parent.`;
    case 'inorder':
      return hasLeft
        ? `The whole left subtree of ${v} is finished, so ${v} is next. Its right subtree comes after.`
        : `${v} has no left child, so there is nothing to visit before it.`;
    case 'postorder':
      return hasLeft || hasRight
        ? `Both subtrees of ${v} are finished, so now ${v} itself can be visited. A node always comes after its children.`
        : `${v} is a leaf: it has no children to wait for.`;
    case 'levelorder':
      return hasLeft
        ? `${v} is at the front of the queue. Its ${hasRight ? 'children join' : 'child joins'} the back, to be visited after the rest of this level.`
        : `${v} is at the front of the queue and has no children to add.`;
  }
}

export function traversalSteps(levelOrder: number[], order: TraversalOrder): Step[] {
  const n = levelOrder.length;
  const { name, rule } = RULE[order];
  const lines = LINES[order];
  if (n === 0) {
    return [
      {
        title: 'The tree is empty',
        why: 'There are no nodes to visit, so the traversal returns immediately.',
        codeLine: lines.start + 1,
        view: levelOrderTree([]),
      },
    ];
  }

  const positions = visitOrder(n, order);
  const done = new Set<number>();
  const output: number[] = [];

  /** Nodes the walk has reached but not yet visited: the path from the root down to position i. */
  const waiting = (i: number): number[] => {
    const path: number[] = [];
    for (let p = i; p > 0; ) {
      p = parentOf(p);
      if (!done.has(p)) path.push(p);
    }
    return path;
  };

  const roles = (active: number | undefined, pending: number[]): Record<number, Role> => {
    const result: Record<number, Role> = {};
    for (const p of done) result[p] = 'visited';
    for (const p of pending) result[p] = 'frontier';
    if (active !== undefined) result[active] = 'active';
    return result;
  };

  const first = positions[0]!;
  const steps: Step[] = [
    {
      title: `${name}: ${rule}`,
      why: 'A tree has no single "next" node, so a traversal is a rule that decides the order. The same rule is applied again inside every subtree.',
      next:
        order === 'levelorder'
          ? 'Start with the root in the queue.'
          : first === 0
            ? 'Start at the root.'
            : `Go down to ${levelOrder[first]} before visiting anything.`,
      codeLine: lines.start,
      variables: { output: '—' },
      view: levelOrderTree(levelOrder, order === 'levelorder' ? { 0: 'frontier' } : {}),
    },
  ];

  if (order !== 'levelorder' && first !== 0) {
    steps.push({
      title: `Go down the left side to ${levelOrder[first]}`,
      why: `The left subtree comes before the node itself, so the walk passes ${waiting(first)
        .reverse()
        .map((p) => levelOrder[p])
        .join(' and ')} without visiting ${waiting(first).length === 1 ? 'it' : 'them'} yet. They wait on the call stack.`,
      codeLine: lines.descend,
      variables: { output: '—' },
      view: levelOrderTree(levelOrder, roles(undefined, [...waiting(first), first])),
    });
  }

  positions.forEach((i) => {
    output.push(levelOrder[i]!);
    const pending =
      order === 'levelorder'
        ? Array.from({ length: Math.min(n, 2 * i + 3) - (i + 1) }, (_, k) => i + 1 + k)
        : waiting(i);
    steps.push({
      title: `Visit ${levelOrder[i]}`,
      why: reason(levelOrder, i, order),
      codeLine: lines.visit,
      variables: {
        ...(order === 'levelorder' && { queue: pending.map((p) => levelOrder[p]).join(', ') || 'empty' }),
        output: output.join(', '),
      },
      view: levelOrderTree(levelOrder, roles(i, pending)),
    });
    done.add(i);
  });

  steps.push({
    title: `${name} traversal complete`,
    why: `Every node was visited exactly once, so the traversal takes O(n) time. Only the order differs between traversals.`,
    codeLine: lines.start,
    variables: { output: output.join(', ') },
    view: levelOrderTree(levelOrder, roles(undefined, [])),
  });
  return steps;
}

const op = (order: TraversalOrder, label: string): StructureOp => ({
  id: order,
  label,
  args: [],
  run: (state) => ({ steps: traversalSteps(state, order), state }),
});

/** A fixed seven-node tree with the four traversals as operations. */
export const traversalStructure: StructureDef = {
  initial: [1, 2, 3, 4, 5, 6, 7],
  view: (state) => levelOrderTree(state),
  code: traversalCode,
  ops: [op('preorder', 'Preorder'), op('inorder', 'Inorder'), op('postorder', 'Postorder'), op('levelorder', 'Level order')],
};
