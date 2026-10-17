import { bstStructure, build, treeView, type Node } from '../../data-structures/bst';
import type { StructureDef, StructureOp } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';

// The first six lines repeat the BST lesson's insert, so the reused Insert operation's code lines still match.
export const lcaCode = `${bstStructure.code.split('\n').slice(0, 6).join('\n')}

function lca(node: TreeNode | null, a: number, b: number): TreeNode | null {
  while (node) {
    if (a < node.value && b < node.value) node = node.left;
    else if (a > node.value && b > node.value) node = node.right;
    else return node; // a and b split here, or one of them is here
  }
  return null;
}`;

const LINE = { start: 8, left: 10, right: 11, split: 12 };

function contains(root: Node | undefined, value: number): boolean {
  let node = root;
  while (node && node.value !== value) node = value < node.value ? node.left : node.right;
  return node !== undefined;
}

export function lowestCommonAncestor(values: number[], a: number, b: number): number | null {
  const root = build(values);
  if (!contains(root, a) || !contains(root, b)) return null;
  let node = root;
  while (node) {
    if (a < node.value && b < node.value) node = node.left;
    else if (a > node.value && b > node.value) node = node.right;
    else return node.value;
  }
  return null;
}

const lcaOp: StructureOp = {
  id: 'lca',
  label: 'LCA(a, b)',
  args: [
    { name: 'a', label: 'a', sample: 1 },
    { name: 'b', label: 'b', sample: 6 },
  ],
  run(state, [a = 0, b = 0]) {
    const root = build(state);
    const missing = [a, b].filter((v) => !contains(root, v));
    if (missing.length > 0) {
      return {
        steps: [
          {
            title: `${missing[0]} is not in the tree`,
            why: `Both values must be in the tree to have a common ancestor. ${[...new Set(missing)].join(' and ')} ${missing.length > 1 && missing[0] !== missing[1] ? 'are' : 'is'} missing, so pick values from the tree.`,
            codeLine: 1,
            view: treeView(root),
          },
        ],
        state,
      };
    }

    const targets: Record<number, Role> = { [a]: 'frontier', [b]: 'frontier' };
    const path: Record<number, Role> = {};
    const steps: Step[] = [
      {
        title: `Find the lowest common ancestor of ${a} and ${b}`,
        why: 'The lowest common ancestor is the deepest node that has both values in its subtree (a node counts as its own ancestor). In a binary search tree, the ordering tells us which way to go.',
        next: 'Start at the root.',
        codeLine: LINE.start,
        variables: { a, b },
        view: treeView(root, targets),
      },
    ];

    let node = root;
    while (node) {
      const value = node.value;
      if (a < value && b < value) {
        steps.push({
          title: `${a} and ${b} are both smaller than ${value}`,
          why: `Both values live in the left subtree of ${value}, so a deeper common ancestor exists on the left.`,
          next: 'Go left.',
          codeLine: LINE.left,
          variables: { a, b, node: value },
          view: treeView(root, { ...targets, ...path, [value]: 'compare' }),
        });
        path[value] = 'visited';
        node = node.left;
      } else if (a > value && b > value) {
        steps.push({
          title: `${a} and ${b} are both larger than ${value}`,
          why: `Both values live in the right subtree of ${value}, so a deeper common ancestor exists on the right.`,
          next: 'Go right.',
          codeLine: LINE.right,
          variables: { a, b, node: value },
          view: treeView(root, { ...targets, ...path, [value]: 'compare' }),
        });
        path[value] = 'visited';
        node = node.right;
      } else {
        const why =
          value === a || value === b
            ? `${value} is one of the two values, and the other is in its subtree. Nothing deeper can contain both.`
            : `${Math.min(a, b)} is to the left of ${value} and ${Math.max(a, b)} is to the right. Their paths split here, so ${value} is the deepest node above both.`;
        const { [value]: _self, ...others } = targets;
        steps.push({
          title: `${value} is the lowest common ancestor`,
          why,
          codeLine: LINE.split,
          variables: { a, b, lca: value },
          view: treeView(root, { ...others, ...path, [value]: 'found' }),
        });
        break;
      }
    }
    return { steps, state };
  },
};

export const lcaStructure: StructureDef = {
  initial: [8, 3, 1, 6, 10, 14],
  view: (state) => treeView(build(state)),
  code: lcaCode,
  ops: [lcaOp, bstStructure.ops.find((op) => op.id === 'insert')!],
};
