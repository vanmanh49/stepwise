import type { StructureDef } from '../types/lesson';
import type { Role, Step, TreeView } from '../types/visualization';
import { refuse } from './shared';

const MAX_NODES = 12;

const code = `function insert(node: TreeNode | null, value: number): TreeNode {
  if (!node) return new TreeNode(value);
  if (value < node.value) node.left = insert(node.left, value);
  else if (value > node.value) node.right = insert(node.right, value);
  return node; // equal: already present
}

function search(node: TreeNode | null, value: number): TreeNode | null {
  if (!node || node.value === value) return node;
  return value < node.value
    ? search(node.left, value)
    : search(node.right, value);
}

function remove(node: TreeNode | null, value: number): TreeNode | null {
  if (!node) return null;
  if (value < node.value) node.left = remove(node.left, value);
  else if (value > node.value) node.right = remove(node.right, value);
  else {
    if (!node.left) return node.right;
    if (!node.right) return node.left;
    const successor = min(node.right);
    node.value = successor.value;
    node.right = remove(node.right, successor.value);
  }
  return node;
}

function inorder(node: TreeNode | null, visit: (v: number) => void): void {
  if (!node) return;
  inorder(node.left, visit);
  visit(node.value);
  inorder(node.right, visit);
}`;

interface Node {
  value: number;
  left?: Node;
  right?: Node;
}

function insertNode(node: Node | undefined, value: number): Node {
  if (!node) return { value };
  if (value < node.value) return { ...node, left: insertNode(node.left, value) };
  if (value > node.value) return { ...node, right: insertNode(node.right, value) };
  return node;
}

function minNode(node: Node): Node {
  return node.left ? minNode(node.left) : node;
}

function removeNode(node: Node | undefined, value: number): Node | undefined {
  if (!node) return undefined;
  if (value < node.value) return { ...node, left: removeNode(node.left, value) };
  if (value > node.value) return { ...node, right: removeNode(node.right, value) };
  if (!node.left) return node.right;
  if (!node.right) return node.left;
  const successor = minNode(node.right);
  return { value: successor.value, left: node.left, right: removeNode(node.right, successor.value) };
}

/** Inserting a preorder traversal in order rebuilds exactly the same tree. */
const build = (preorder: number[]) => preorder.reduce<Node | undefined>(insertNode, undefined);

function toPreorder(node: Node | undefined): number[] {
  return node ? [node.value, ...toPreorder(node.left), ...toPreorder(node.right)] : [];
}

const idOf = (value: number) => `n${value}`;

function treeView(root: Node | undefined, roles: Record<number, Role> = {}): TreeView {
  const nodes: TreeView['nodes'] = [];
  const walk = (node: Node | undefined): void => {
    if (!node) return;
    nodes.push({
      id: idOf(node.value),
      value: node.value,
      role: roles[node.value] ?? 'default',
      ...(node.left && { left: idOf(node.left.value) }),
      ...(node.right && { right: idOf(node.right.value) }),
    });
    walk(node.left);
    walk(node.right);
  };
  walk(root);
  return { kind: 'tree', nodes, ...(root && { root: idOf(root.value) }) };
}

const view = (state: number[]) => treeView(build(state));

/**
 * Walks from the root toward `value`, emitting one comparison step per node.
 * Returns the node holding the value (if any) and the roles of the path walked.
 */
function descend(
  root: Node | undefined,
  value: number,
  lines: { left: number; right: number },
  steps: Step[],
): { found?: Node; path: Record<number, Role>; last?: Node } {
  const path: Record<number, Role> = {};
  let current = root;
  let last: Node | undefined;
  while (current && current.value !== value) {
    const goLeft = value < current.value;
    steps.push({
      title: `Compare ${value} with ${current.value}`,
      why: goLeft
        ? `${value} < ${current.value}, so it can only be in the left subtree. The whole right subtree is ruled out.`
        : `${value} > ${current.value}, so it can only be in the right subtree. The whole left subtree is ruled out.`,
      next: goLeft ? 'Go left.' : 'Go right.',
      codeLine: goLeft ? lines.left : lines.right,
      variables: { value, node: current.value },
      view: treeView(root, { ...path, [current.value]: 'compare' }),
    });
    path[current.value] = 'visited';
    last = current;
    current = goLeft ? current.left : current.right;
  }
  return { found: current, path, last };
}

export const bstStructure: StructureDef = {
  initial: [8, 3, 1, 6, 10, 14],
  view,
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 5 }],
      run(state, [value = 0]) {
        const root = build(state);
        const steps: Step[] = [];
        const { found, path, last } = descend(root, value, { left: 3, right: 4 }, steps);
        if (found) {
          steps.push({
            title: `${value} is already in the tree`,
            why: 'This tree stores each value once, so a duplicate insert changes nothing.',
            codeLine: 5,
            variables: { value },
            view: treeView(root, { ...path, [value]: 'found' }),
          });
          return { steps, state };
        }
        if (state.length >= MAX_NODES) {
          return refuse(
            state,
            view(state),
            'The tree is full',
            `This visualization holds at most ${MAX_NODES} nodes so the tree stays readable. Delete a node first.`,
            1,
          );
        }
        const next = insertNode(root, value);
        steps.push({
          title: last ? `Attach ${value} as the ${value < last.value ? 'left' : 'right'} child of ${last.value}` : `${value} becomes the root`,
          why: last
            ? 'The search reached an empty spot. That is the only place the value can go while keeping smaller values left and larger values right.'
            : 'The tree was empty, so the first value becomes the root.',
          codeLine: 2,
          variables: { value },
          view: treeView(next, { ...path, [value]: 'found' }),
        });
        return { steps, state: toPreorder(next) };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 6 }],
      run(state, [value = 0]) {
        const root = build(state);
        const steps: Step[] = [];
        const { found, path } = descend(root, value, { left: 11, right: 12 }, steps);
        steps.push(
          found
            ? {
                title: `Found ${value}`,
                why: `Only ${steps.length + 1} node${steps.length === 0 ? '' : 's'} out of ${state.length} had to be looked at, because each comparison skipped a whole subtree.`,
                codeLine: 9,
                variables: { value },
                view: treeView(root, { ...path, [value]: 'found' }),
              }
            : {
                title: `${value} is not in the tree`,
                why: 'The search reached an empty spot where the value would have to be, so it does not exist.',
                codeLine: 9,
                variables: { value },
                view: treeView(root, path),
              },
        );
        return { steps, state };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'value', label: 'Value', sample: 3 }],
      run(state, [value = 0]) {
        const root = build(state);
        const steps: Step[] = [];
        const { found, path } = descend(root, value, { left: 17, right: 18 }, steps);
        if (!found) {
          steps.push({
            title: `${value} is not in the tree`,
            why: 'The search reached an empty spot, so there is nothing to delete.',
            codeLine: 16,
            variables: { value },
            view: treeView(root, path),
          });
          return { steps, state };
        }

        const next = removeNode(root, value);
        const children = (found.left ? 1 : 0) + (found.right ? 1 : 0);
        if (children === 2) {
          const successor = minNode(found.right!);
          steps.push({
            title: `Found ${value}, which has two children`,
            why: 'Removing it outright would leave two subtrees with no parent. Instead, replace its value with one that keeps the order intact.',
            next: 'Find its inorder successor: the smallest value in its right subtree.',
            codeLine: 22,
            variables: { value },
            view: treeView(root, { ...path, [value]: 'swap' }),
          });
          steps.push({
            title: `The successor is ${successor.value}`,
            why: `Go right once, then left as far as possible. ${successor.value} is the smallest value that is larger than ${value}.`,
            next: `Copy ${successor.value} into the place of ${value} and remove the old ${successor.value}.`,
            codeLine: 22,
            variables: { value, successor: successor.value },
            view: treeView(root, { ...path, [value]: 'swap', [successor.value]: 'pivot' }),
          });
          steps.push({
            title: `${successor.value} takes the place of ${value}`,
            why: 'Everything on its left is still smaller and everything on its right is still larger, so the tree is still a valid BST.',
            codeLine: 23,
            variables: { value, successor: successor.value },
            view: treeView(next, { ...path, [successor.value]: 'found' }),
          });
        } else {
          const child = found.left ?? found.right;
          steps.push({
            title: `Found ${value}, which has ${children === 0 ? 'no children' : 'one child'}`,
            why:
              children === 0
                ? 'A leaf can simply be removed. Nothing depends on it.'
                : `Its only child, ${child!.value}, can take its place without breaking the order.`,
            codeLine: found.left ? 21 : 20,
            variables: { value },
            view: treeView(root, { ...path, [value]: 'swap' }),
          });
          steps.push({
            title: child ? `${child.value} moves up into the place of ${value}` : `${value} is removed`,
            why: 'The parent now points past the deleted node, and the tree is still a valid BST.',
            codeLine: found.left ? 21 : 20,
            variables: { value },
            view: treeView(next, child ? { ...path, [child.value]: 'found' } : path),
          });
        }
        return { steps, state: toPreorder(next) };
      },
    },
    {
      id: 'inorder',
      label: 'Inorder traversal',
      args: [],
      run(state) {
        if (state.length === 0) {
          return refuse(state, view(state), 'The tree is empty', 'There are no nodes to visit.', 30);
        }
        const root = build(state);
        const output: number[] = [];
        const done: Record<number, Role> = {};
        const steps: Step[] = [
          {
            title: 'Start an inorder traversal at the root',
            why: 'Inorder means: visit everything in the left subtree, then the node itself, then everything in the right subtree.',
            codeLine: 29,
            variables: { output: '—' },
            view: treeView(root, { [root!.value]: 'active' }),
          },
        ];
        const walk = (node: Node | undefined): void => {
          if (!node) return;
          walk(node.left);
          output.push(node.value);
          steps.push({
            title: `Visit ${node.value}`,
            why: node.left
              ? `Its whole left subtree is done, so ${node.value} is the next smallest value.`
              : `It has no left child, so nothing smaller is waiting. ${node.value} is next.`,
            codeLine: 32,
            variables: { output: output.join(', ') },
            view: treeView(root, { ...done, [node.value]: 'active' }),
          });
          done[node.value] = 'visited';
          walk(node.right);
        };
        walk(root);
        steps.push({
          title: 'The traversal is complete',
          why: 'Because smaller values are always on the left, an inorder traversal of a BST reads the values in ascending order.',
          codeLine: 29,
          variables: { output: output.join(', ') },
          view: treeView(root, done),
        });
        return { steps, state };
      },
    },
  ],
};
