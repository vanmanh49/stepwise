import type { StructureDef } from '../types/lesson';
import type { Role, Step, TreeView } from '../types/visualization';
import { build, treeView, type Node } from './bst';
import { lineOf, refuse } from './shared';

export const MAX_AVL_NODES = 15;

const code = `function height(node: AvlNode | null): number {
  return node ? node.height : 0;
}

function update(node: AvlNode): void {
  node.height = 1 + Math.max(height(node.left), height(node.right));
}

const balance = (node: AvlNode) => height(node.left) - height(node.right);

function rotateRight(y: AvlNode): AvlNode {
  const x = y.left!;
  y.left = x.right; // x's right subtree moves across
  x.right = y;
  update(y); update(x);
  return x;
}

function rotateLeft(x: AvlNode): AvlNode {
  const y = x.right!;
  x.right = y.left; // y's left subtree moves across
  y.left = x;
  update(x); update(y);
  return y;
}

function rebalance(node: AvlNode): AvlNode {
  update(node);
  const b = balance(node);
  if (b > 1) {
    if (balance(node.left!) < 0) node.left = rotateLeft(node.left!); // LR
    return rotateRight(node); // LL
  }
  if (b < -1) {
    if (balance(node.right!) > 0) node.right = rotateRight(node.right!); // RL
    return rotateLeft(node); // RR
  }
  return node;
}

function insert(node: AvlNode | null, value: number): AvlNode {
  if (!node) return new AvlNode(value);
  if (value < node.value) node.left = insert(node.left, value);
  else if (value > node.value) node.right = insert(node.right, value);
  else return node; // already present
  return rebalance(node);
}

function remove(node: AvlNode | null, value: number): AvlNode | null {
  if (!node) return null;
  if (value < node.value) node.left = remove(node.left, value);
  else if (value > node.value) node.right = remove(node.right, value);
  else {
    if (!node.left || !node.right) return node.left ?? node.right;
    const successor = min(node.right);
    node.value = successor.value;
    node.right = remove(node.right, successor.value);
  }
  return rebalance(node);
}

function search(node: AvlNode | null, value: number): AvlNode | null {
  while (node && node.value !== value) node = value < node.value ? node.left : node.right;
  return node;
}`;

const LINE = {
  rotateRight: lineOf(code, 'function rotateRight'),
  rotateLeft: lineOf(code, 'function rotateLeft'),
  check: lineOf(code, 'const b = balance(node);'),
  lr: lineOf(code, '// LR'),
  ll: lineOf(code, '// LL'),
  rl: lineOf(code, '// RL'),
  rr: lineOf(code, '// RR'),
  attach: lineOf(code, 'return new AvlNode(value)'),
  goLeft: lineOf(code, 'node.left = insert('),
  goRight: lineOf(code, 'node.right = insert('),
  duplicate: lineOf(code, '// already present'),
  removeLeft: lineOf(code, 'node.left = remove('),
  removeRight: lineOf(code, 'node.right = remove(node.right, value)'),
  removeMissing: lineOf(code, 'if (!node) return null;'),
  removeSimple: lineOf(code, 'return node.left ?? node.right'),
  successor: lineOf(code, 'const successor = min'),
  copySuccessor: lineOf(code, 'node.value = successor.value'),
  search: lineOf(code, 'while (node && node.value'),
};

const height = (n?: Node): number => (n ? 1 + Math.max(height(n.left), height(n.right)) : 0);
const balanceOf = (n: Node) => height(n.left) - height(n.right);
const signed = (b: number) => (b > 0 ? `+${b}` : String(b));

function view(root: Node | undefined, roles: Record<number, Role> = {}): TreeView {
  const tree = treeView(root, roles);
  const byValue = new Map<number, Node>();
  const walk = (n?: Node): void => {
    if (!n) return;
    byValue.set(n.value, n);
    walk(n.left);
    walk(n.right);
  };
  walk(root);
  return { ...tree, nodes: tree.nodes.map((n) => ({ ...n, badge: signed(balanceOf(byValue.get(n.value)!)) })) };
}

function toPreorder(node: Node | undefined): number[] {
  return node ? [node.value, ...toPreorder(node.left), ...toPreorder(node.right)] : [];
}

function plainInsert(node: Node | undefined, value: number): Node {
  if (!node) return { value };
  if (value < node.value) return { ...node, left: plainInsert(node.left, value) };
  return { ...node, right: plainInsert(node.right, value) };
}

function minNode(node: Node): Node {
  return node.left ? minNode(node.left) : node;
}

/** BST delete with the inorder successor, without rebalancing. */
function plainRemove(node: Node | undefined, value: number): Node | undefined {
  if (!node) return undefined;
  if (value < node.value) return { ...node, left: plainRemove(node.left, value) };
  if (value > node.value) return { ...node, right: plainRemove(node.right, value) };
  if (!node.left || !node.right) return node.left ?? node.right;
  const successor = minNode(node.right);
  return { ...node, value: successor.value, right: plainRemove(node.right, successor.value) };
}

/** Values on the path from the root down to (not including) `value`. */
function pathTo(root: Node | undefined, value: number): number[] {
  const path: number[] = [];
  for (let n = root; n && n.value !== value; n = value < n.value ? n.left : n.right) path.push(n.value);
  return path;
}

/** Replaces the subtree rooted at `target` (found by BST order) with `fn` of it. */
function replace(node: Node | undefined, target: number, fn: (n: Node) => Node): Node | undefined {
  if (!node) return undefined;
  if (node.value === target) return fn(node);
  return target < node.value ? { ...node, left: replace(node.left, target, fn) } : { ...node, right: replace(node.right, target, fn) };
}

function find(node: Node | undefined, value: number): Node | undefined {
  while (node && node.value !== value) node = value < node.value ? node.left : node.right;
  return node;
}

const rotateRight = (y: Node): Node => ({ ...y.left!, right: { ...y, left: y.left!.right } });
const rotateLeft = (x: Node): Node => ({ ...x.right!, left: { ...x, right: x.right!.left } });

/** One comparison step per node from the root towards `value`. */
function descend(root: Node | undefined, value: number, lines: { left: number; right: number }, steps: Step[]): Record<number, Role> {
  const path: Record<number, Role> = {};
  for (let n = root; n && n.value !== value; n = value < n.value ? n.left : n.right) {
    const goLeft = value < n.value;
    steps.push({
      title: `Compare ${value} with ${n.value}`,
      why: goLeft ? `${value} < ${n.value}, so go left.` : `${value} > ${n.value}, so go right.`,
      codeLine: goLeft ? lines.left : lines.right,
      variables: { value, node: n.value },
      view: view(root, { ...path, [n.value]: 'compare' }),
    });
    path[n.value] = 'visited';
  }
  return path;
}

/**
 * Walks back up through `ancestors` (deepest first), updating heights and rotating where a node's
 * balance leaves -1..1. After an insert, one fix restores the subtree's old height, so it stops.
 */
function retrace(root: Node | undefined, ancestors: number[], stopAfterFix: boolean, steps: Step[]): Node | undefined {
  for (const a of ancestors) {
    const node = find(root, a)!;
    const b = balanceOf(node);
    const ok = Math.abs(b) <= 1;
    steps.push({
      title: `Check ${a}: balance ${signed(b)}`,
      why: ok
        ? `Left height ${height(node.left)}, right height ${height(node.right)}. They differ by at most 1, so ${a} is balanced.`
        : `Left height ${height(node.left)}, right height ${height(node.right)}. They differ by 2, which breaks the AVL rule, so ${a} needs a rotation.`,
      codeLine: LINE.check,
      variables: { node: a, height: height(node), balance: signed(b) },
      view: view(root, { [a]: ok ? 'active' : 'swap' }),
    });
    if (ok) continue;

    const leftHeavy = b > 1;
    const child = leftHeavy ? node.left! : node.right!;
    const double = leftHeavy ? balanceOf(child) < 0 : balanceOf(child) > 0;
    const kind = leftHeavy ? (double ? 'LR' : 'LL') : double ? 'RL' : 'RR';
    if (double) {
      const turned = leftHeavy ? rotateLeft(child) : rotateRight(child);
      root = replace(root, child.value, () => turned);
      steps.push({
        title: `${leftHeavy ? 'Left' : 'Right'} rotation at ${child.value} (${kind} case, step 1 of 2)`,
        why: `${a} is ${leftHeavy ? 'left' : 'right'}-heavy, but its ${leftHeavy ? 'left' : 'right'} child ${child.value} leans the other way, a zig-zag. Rotating ${child.value} first turns it into a straight line that one more rotation can fix.`,
        codeLine: leftHeavy ? LINE.lr : LINE.rl,
        variables: { node: child.value, case: kind },
        view: view(root, { [turned.value]: 'swap', [a]: 'swap' }),
      });
    }
    const top = find(root, a)!;
    const rotated = leftHeavy ? rotateRight(top) : rotateLeft(top);
    root = replace(root, a, () => rotated);
    steps.push({
      title: `${leftHeavy ? 'Right' : 'Left'} rotation at ${a} (${kind} case${double ? ', step 2 of 2' : ''})`,
      why: `${rotated.value} moves up into ${a}'s place and ${a} becomes its ${leftHeavy ? 'right' : 'left'} child. The values keep their order, and the subtree's two sides are level again.`,
      codeLine: leftHeavy ? LINE.ll : LINE.rr,
      variables: { node: a, case: kind },
      view: view(root, { [rotated.value]: 'found', [a]: 'found' }),
    });
    if (stopAfterFix) break;
  }
  return root;
}

export const avlStructure: StructureDef = {
  initial: [20, 10, 5, 15, 30, 40],
  view: (state) => view(build(state)),
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 50 }],
      run(state, [value = 0]) {
        const root = build(state);
        if (!find(root, value) && state.length >= MAX_AVL_NODES) {
          return refuse(state, view(root), 'The tree is full', `This visualization holds at most ${MAX_AVL_NODES} nodes so the tree stays readable. Delete a node first.`, LINE.attach);
        }
        const steps: Step[] = [];
        const path = descend(root, value, { left: LINE.goLeft, right: LINE.goRight }, steps);
        if (find(root, value)) {
          steps.push({ title: `${value} is already in the tree`, why: 'Each value is stored once, so nothing changes.', codeLine: LINE.duplicate, variables: { value }, view: view(root, { ...path, [value]: 'found' }) });
          return { steps, state };
        }
        const inserted = plainInsert(root, value);
        const ancestors = pathTo(root, value);
        steps.push({
          title: ancestors.length > 0 ? `Attach ${value} under ${ancestors.at(-1)}` : `${value} becomes the root`,
          why: 'This is an ordinary BST insert. Now walk back up: the new node may have made an ancestor too tall on one side.',
          codeLine: LINE.attach,
          variables: { value },
          view: view(inserted, { ...path, [value]: 'found' }),
        });
        const next = retrace(inserted, ancestors.reverse(), true, steps);
        return { steps, state: toPreorder(next) };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 15 }],
      run(state, [value = 0]) {
        const root = build(state);
        const steps: Step[] = [];
        const path = descend(root, value, { left: LINE.search, right: LINE.search }, steps);
        const found = find(root, value);
        steps.push({
          title: found ? `Found ${value}` : `${value} is not in the tree`,
          why: found
            ? `An AVL tree is never more than about 1.44 × log₂ n levels tall, so a search looks at only a handful of nodes.`
            : 'The search reached an empty spot where the value would have to be.',
          codeLine: LINE.search,
          variables: { value },
          view: view(root, found ? { ...path, [value]: 'found' } : path),
        });
        return { steps, state };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'value', label: 'Value', sample: 5 }],
      run(state, [value = 0]) {
        const root = build(state);
        const steps: Step[] = [];
        const path = descend(root, value, { left: LINE.removeLeft, right: LINE.removeRight }, steps);
        const node = find(root, value);
        if (!node) {
          steps.push({ title: `${value} is not in the tree`, why: 'The search reached an empty spot, so there is nothing to delete.', codeLine: LINE.removeMissing, variables: { value }, view: view(root, path) });
          return { steps, state };
        }
        const twoChildren = node.left !== undefined && node.right !== undefined;
        // The node that physically disappears: the successor when there are two children.
        const gone = twoChildren ? minNode(node.right!).value : value;
        if (twoChildren) {
          steps.push({
            title: `${value} has two children: use its successor ${gone}`,
            why: `${gone} is the smallest value in ${value}'s right subtree. Copying it into ${value}'s place keeps the order, and then the old ${gone} is removed from below.`,
            codeLine: LINE.successor,
            variables: { value, successor: gone },
            view: view(root, { ...path, [value]: 'swap', [gone]: 'pivot' }),
          });
        }
        const removed = plainRemove(root, value);
        const ancestors = pathTo(root, gone).map((v) => (v === value ? gone : v));
        steps.push({
          title: twoChildren ? `${gone} takes the place of ${value}` : `Remove ${value}`,
          why: 'This is an ordinary BST delete. A subtree just got shorter, so walk back up and check every ancestor.',
          codeLine: twoChildren ? LINE.copySuccessor : LINE.removeSimple,
          variables: { value },
          view: view(removed, twoChildren ? { [gone]: 'found' } : {}),
        });
        const next = retrace(removed, ancestors.reverse(), false, steps);
        return { steps, state: toPreorder(next) };
      },
    },
  ],
};
