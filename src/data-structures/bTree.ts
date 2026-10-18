import type { StructureDef } from '../types/lesson';
import type { BTreeView, Role, Step } from '../types/visualization';
import { lineOf } from './shared';

export const MAX_BTREE_KEYS = 15;
/** Order 4: at most 3 keys and 4 children per node. */
const MAX = 3;

/** A B-tree node: keys in order, and one more child than keys unless it is a leaf. */
export interface BNode {
  keys: number[];
  children: BNode[];
}

const code = `const MAX = 3; // keys per node (order 4)

function search(node: BNode, key: number): boolean {
  let i = 0;
  while (i < node.keys.length && key > node.keys[i]) i++;
  if (node.keys[i] === key) return true; // found in this node
  return node.leaf ? false : search(node.children[i], key); // go down
}

function insert(tree: BTree, key: number): void {
  const split = insertInto(tree.root, key);
  if (split) tree.root = new BNode([split.up], [tree.root, split.right]); // root split
}

function insertInto(node: BNode, key: number): Split | null {
  let i = 0;
  while (i < node.keys.length && key > node.keys[i]) i++;
  if (node.leaf) node.keys.splice(i, 0, key); // add to the leaf
  else {
    const split = insertInto(node.children[i], key);
    if (!split) return null;
    node.keys.splice(i, 0, split.up); // a child split: take its key
    node.children.splice(i + 1, 0, split.right);
  }
  if (node.keys.length <= MAX) return null;
  const up = node.keys[2]; // 4 keys: the third moves up
  const right = new BNode(node.keys.slice(3), node.children.slice(3));
  node.keys = node.keys.slice(0, 2);
  node.children = node.children.slice(0, 3);
  return { up, right };
}

function remove(tree: BTree, key: number): void {
  const path = pathTo(tree.root, key); // [node, child index] pairs from the root
  const node = path.at(-1)!.node, i = node.keys.indexOf(key);
  if (i === -1) return; // not in the tree
  if (!node.leaf) { // inner key: use the predecessor
    let index = i, leaf = node.children[i];
    path.push({ node: leaf, index });
    while (!leaf.leaf) { index = leaf.children.length - 1; leaf = leaf.children[index]; path.push({ node: leaf, index }); }
    node.keys[i] = leaf.keys.pop()!;
  } else node.keys.splice(i, 1); // remove from the leaf
  for (let k = path.length - 1; k > 0 && path[k].node.keys.length === 0; k--)
    fixUnderflow(path[k - 1].node, path[k].index);
  if (tree.root.keys.length === 0 && !tree.root.leaf) tree.root = tree.root.children[0]; // root shrinks
}

function fixUnderflow(parent: BNode, i: number): void {
  const node = parent.children[i], left = parent.children[i - 1], right = parent.children[i + 1];
  if (left && left.keys.length > 1) { // borrow from the left
    node.keys.unshift(parent.keys[i - 1]);
    parent.keys[i - 1] = left.keys.pop()!;
    if (!left.leaf) node.children.unshift(left.children.pop()!);
  } else if (right && right.keys.length > 1) { // borrow from the right
    node.keys.push(parent.keys[i]);
    parent.keys[i] = right.keys.shift()!;
    if (!right.leaf) node.children.push(right.children.shift()!);
  } else if (left) { // merge with the left sibling
    left.keys.push(parent.keys.splice(i - 1, 1)[0], ...node.keys);
    left.children.push(...node.children);
    parent.children.splice(i, 1);
  } else { // merge with the right sibling
    node.keys.push(parent.keys.splice(i, 1)[0], ...right!.keys);
    node.children.push(...right!.children);
    parent.children.splice(i + 1, 1);
  }
}`;

const LINE = {
  compare: lineOf(code, 'while (i < node.keys.length && key > node.keys[i]) i++;'),
  found: lineOf(code, '// found in this node'),
  goDown: lineOf(code, '// go down'),
  rootSplit: lineOf(code, '// root split'),
  addLeaf: lineOf(code, '// add to the leaf'),
  takeKey: lineOf(code, '// a child split: take its key'),
  split: lineOf(code, '// 4 keys: the third moves up'),
  missing: lineOf(code, '// not in the tree'),
  predecessor: lineOf(code, '// inner key: use the predecessor'),
  removeLeaf: lineOf(code, '// remove from the leaf'),
  borrowLeft: lineOf(code, '// borrow from the left'),
  borrowRight: lineOf(code, '// borrow from the right'),
  mergeLeft: lineOf(code, '// merge with the left sibling'),
  mergeRight: lineOf(code, '// merge with the right sibling'),
  shrink: lineOf(code, '// root shrinks'),
};

const clone = (n: BNode): BNode => ({ keys: [...n.keys], children: n.children.map(clone) });
const isLeaf = (n: BNode) => n.children.length === 0;
const count = (n: BNode): number => n.keys.length + n.children.reduce((s, c) => s + count(c), 0);

/** Marks: node (by object) → role, and node → matched key index. */
interface Marks {
  roles?: Map<BNode, Role>;
  matched?: Map<BNode, number>;
}

function draw(root: BNode, marks: Marks = {}): BTreeView {
  const nodes: BTreeView['nodes'] = [];
  const walk = (n: BNode, id: string): void => {
    nodes.push({
      id,
      keys: n.keys.map(String),
      children: n.children.map((_, i) => `${id}.${i}`),
      leaf: isLeaf(n),
      role: marks.roles?.get(n) ?? 'default',
      matched: marks.matched?.has(n) ? [marks.matched.get(n)!] : [],
    });
    n.children.forEach((c, i) => walk(c, `${id}.${i}`));
  };
  walk(root, 'b');
  return { kind: 'btree', label: 'B-tree of order 4 (1–3 keys per node)', root: 'b', nodes, linked: false };
}

const role = (...pairs: [BNode | undefined, Role][]): Marks => ({ roles: new Map(pairs.filter((p): p is [BNode, Role] => p[0] !== undefined)) });
const show = (n: BNode) => `[${n.keys.join(' ')}]`;

interface Hop {
  node: BNode;
  /** This node's index in its parent's children. */
  index: number;
}

/** Walks from the root towards `key`, one step per node; returns the path and where the key is. */
function descend(root: BNode, key: number, steps: Step[]): { path: Hop[]; at: number } {
  const path: Hop[] = [{ node: root, index: 0 }];
  for (;;) {
    const node = path.at(-1)!.node;
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]!) i++;
    if (node.keys[i] === key) return { path, at: i };
    if (isLeaf(node)) return { path, at: -1 };
    const where = i === 0 ? `smaller than ${node.keys[0]}` : i === node.keys.length ? `larger than ${node.keys.at(-1)}` : `between ${node.keys[i - 1]} and ${node.keys[i]}`;
    steps.push({
      title: `Look in ${show(node)}: go to child ${i + 1}`,
      why: `${key} is ${where}, so it can only be in child ${i + 1} of ${node.children.length}. One node holds several keys, so each step down rules out more of the tree than in a binary tree.`,
      codeLine: LINE.goDown,
      variables: { key, child: i + 1 },
      view: draw(root, role([node, 'compare'])),
    });
    path.push({ node: node.children[i]!, index: i });
  }
}

/** Splits nodes with 4 keys from `k` up the path, one step each; returns the root. */
function splitUp(root: BNode, path: Hop[], k: number, steps: Step[]): BNode {
  for (; k >= 0 && path[k]!.node.keys.length > MAX; k--) {
    const node = path[k]!.node;
    const up = node.keys[2]!;
    const right: BNode = { keys: node.keys.slice(3), children: node.children.slice(3) };
    const before = show(node);
    node.keys = node.keys.slice(0, 2);
    node.children = node.children.slice(0, 3);
    if (k === 0) {
      root = { keys: [up], children: [node, right] };
      steps.push({
        title: `Split ${before}: ${up} moves up into a new root`,
        why: 'The root overflowed, so it splits in two and the middle key starts a new root above them. This is the only way a B-tree gets taller, so every leaf stays at the same depth.',
        codeLine: LINE.rootSplit,
        variables: { up },
        view: draw(root, { roles: new Map([[node, 'swap'], [right, 'swap'], [root, 'found']]) }),
      });
    } else {
      const parent = path[k - 1]!.node;
      const at = path[k]!.index;
      parent.keys.splice(at, 0, up);
      parent.children.splice(at + 1, 0, right);
      steps.push({
        title: `Split ${before}: ${up} moves up into ${show(parent)}`,
        why: `A node may hold at most ${MAX} keys. ${before} has 4, so it splits into ${show(node)} and ${show(right)}, and ${up} goes up to separate them.${parent.keys.length > MAX ? ' Now the parent is too full as well.' : ''}`,
        codeLine: LINE.split,
        variables: { up },
        view: draw(root, { roles: new Map([[node, 'swap'], [right, 'swap'], [parent, parent.keys.length > MAX ? 'active' : 'found']]) }),
      });
    }
  }
  return root;
}

/** Fixes nodes left with no keys, from the bottom of `path` upwards, one step each. */
function fixUp(root: BNode, path: Hop[], steps: Step[]): BNode {
  for (let k = path.length - 1; k > 0 && path[k]!.node.keys.length === 0; k--) {
    const parent = path[k - 1]!.node;
    const i = path[k]!.index;
    const node = parent.children[i]!;
    const left = parent.children[i - 1];
    const right = parent.children[i + 1];
    if (left && left.keys.length > 1) {
      const down = parent.keys[i - 1]!;
      node.keys.unshift(down);
      parent.keys[i - 1] = left.keys.pop()!;
      if (!isLeaf(left)) node.children.unshift(left.children.pop()!);
      steps.push({
        title: `Borrow from the left sibling: ${parent.keys[i - 1]} moves up, ${down} moves down`,
        why: `The node is empty, and its left sibling has a key to spare. The separator ${down} drops into the empty node and the sibling's largest key replaces it, so the order is kept.${isLeaf(node) ? '' : ' The sibling\'s last child moves across with it.'}`,
        codeLine: LINE.borrowLeft,
        variables: { up: parent.keys[i - 1]!, down },
        view: draw(root, role([node, 'found'], [left, 'swap'], [parent, 'swap'])),
      });
    } else if (right && right.keys.length > 1) {
      const down = parent.keys[i]!;
      node.keys.push(down);
      parent.keys[i] = right.keys.shift()!;
      if (!isLeaf(right)) node.children.push(right.children.shift()!);
      steps.push({
        title: `Borrow from the right sibling: ${parent.keys[i]} moves up, ${down} moves down`,
        why: `The node is empty, and its right sibling has a key to spare. The separator ${down} drops into the empty node and the sibling's smallest key replaces it.${isLeaf(node) ? '' : ' The sibling\'s first child moves across with it.'}`,
        codeLine: LINE.borrowRight,
        variables: { up: parent.keys[i]!, down },
        view: draw(root, role([node, 'found'], [right, 'swap'], [parent, 'swap'])),
      });
    } else if (left) {
      const down = parent.keys.splice(i - 1, 1)[0]!;
      left.keys.push(down, ...node.keys);
      left.children.push(...node.children);
      parent.children.splice(i, 1);
      steps.push({
        title: `Merge with the left sibling, pulling ${down} down`,
        why: `Neither sibling can spare a key, so the empty node joins its left sibling, with the separator ${down} between them: ${show(left)}. The parent lost a key${parent.keys.length === 0 ? ' and is now empty itself' : ''}.`,
        codeLine: LINE.mergeLeft,
        variables: { down },
        view: draw(root, role([left, 'found'], [parent, parent.keys.length === 0 ? 'active' : 'swap'])),
      });
    } else {
      const down = parent.keys.splice(i, 1)[0]!;
      node.keys.push(down, ...right!.keys);
      node.children.push(...right!.children);
      parent.children.splice(i + 1, 1);
      steps.push({
        title: `Merge with the right sibling, pulling ${down} down`,
        why: `Neither sibling can spare a key, so the empty node joins its right sibling, with the separator ${down} between them: ${show(node)}. The parent lost a key${parent.keys.length === 0 ? ' and is now empty itself' : ''}.`,
        codeLine: LINE.mergeRight,
        variables: { down },
        view: draw(root, role([node, 'found'], [parent, parent.keys.length === 0 ? 'active' : 'swap'])),
      });
    }
  }
  if (root.keys.length === 0 && !isLeaf(root)) {
    root = root.children[0]!;
    steps.push({
      title: 'The root is empty: its only child becomes the root',
      why: 'The tree gets one level shorter, all at once, so every leaf is still at the same depth.',
      codeLine: LINE.shrink,
      view: draw(root, role([root, 'found'])),
    });
  }
  return root;
}

const empty: BNode = { keys: [], children: [] };

function insertKey(state: BNode, key: number, steps: Step[]): BNode {
  let root = clone(state);
  const { path, at } = descend(root, key, steps);
  const node = path.at(-1)!.node;
  if (at >= 0) {
    steps.push({ title: `${key} is already in the tree`, why: 'Each key is stored once, so nothing changes.', codeLine: LINE.found, variables: { key }, view: draw(root, { roles: new Map([[node, 'found']]), matched: new Map([[node, at]]) }) });
    return state;
  }
  let i = 0;
  while (i < node.keys.length && key > node.keys[i]!) i++;
  node.keys.splice(i, 0, key);
  steps.push({
    title: `Add ${key} to the leaf: ${show(node)}`,
    why: node.keys.length > MAX ? `New keys always go into a leaf, in order. The leaf now has 4 keys, one more than allowed, so it must split.` : 'New keys always go into a leaf, in order. It still has room, so nothing else changes.',
    codeLine: LINE.addLeaf,
    variables: { key },
    view: draw(root, { roles: new Map([[node, node.keys.length > MAX ? 'active' : 'found']]), matched: new Map([[node, i]]) }),
  });
  root = splitUp(root, path, path.length - 1, steps);
  return root;
}

const initial = [10, 20, 5, 6, 12, 30, 7, 17].reduce((tree, key) => insertKey(tree, key, []), empty);

export const bTreeStructure: StructureDef<BNode> = {
  initial,
  view: (state) => draw(state),
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 8 }],
      run(state, [key = 0]) {
        if (count(state) >= MAX_BTREE_KEYS) {
          const steps: Step[] = [];
          const { at } = descend(state, key, steps);
          if (at < 0) {
            return { steps: [{ title: 'The tree is full', why: `This visualization holds at most ${MAX_BTREE_KEYS} keys so the tree stays readable. Delete a key first.`, codeLine: LINE.addLeaf, view: draw(state) }], state };
          }
        }
        const steps: Step[] = [];
        const next = insertKey(state, key, steps);
        return { steps, state: next };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 12 }],
      run(state, [key = 0]) {
        const steps: Step[] = [];
        const { path, at } = descend(state, key, steps);
        const node = path.at(-1)!.node;
        steps.push(
          at >= 0
            ? { title: `Found ${key}`, why: `${key} is a key of ${show(node)}. ${path.length} node${path.length === 1 ? '' : 's'} were read; each read is one disk page in a database.`, codeLine: LINE.found, variables: { key }, view: draw(state, { roles: new Map([[node, 'found']]), matched: new Map([[node, at]]) }) }
            : { title: `${key} is not in the tree`, why: `The search reached the leaf ${show(node)} without finding ${key}, and leaves have no children to try.`, codeLine: LINE.goDown, variables: { key }, view: draw(state, role([node, 'discarded'])) },
        );
        return { steps, state };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'value', label: 'Value', sample: 30 }],
      run(state, [key = 0]) {
        let root = clone(state);
        const steps: Step[] = [];
        const { path, at } = descend(root, key, steps);
        const node = path.at(-1)!.node;
        if (at < 0) {
          steps.push({ title: `${key} is not in the tree`, why: 'The search reached a leaf without finding it, so there is nothing to delete.', codeLine: LINE.missing, variables: { key }, view: draw(root, role([node, 'discarded'])) });
          return { steps, state };
        }
        if (isLeaf(node)) {
          node.keys.splice(at, 1);
          steps.push({
            title: `Remove ${key} from the leaf`,
            why: node.keys.length > 0 || path.length === 1 ? 'The leaf still has at least one key, so the tree is still valid.' : 'The leaf is now empty. A node other than the root must hold at least one key, so it has to be fixed.',
            codeLine: LINE.removeLeaf,
            variables: { key },
            view: draw(root, role([node, node.keys.length > 0 || path.length === 1 ? 'found' : 'active'])),
          });
        } else {
          let leaf = node.children[at]!;
          path.push({ node: leaf, index: at });
          while (!isLeaf(leaf)) {
            const last = leaf.children.length - 1;
            leaf = leaf.children[last]!;
            path.push({ node: leaf, index: last });
          }
          const predecessor = leaf.keys.pop()!;
          node.keys[at] = predecessor;
          steps.push({
            title: `${key} is in an inner node: replace it with its predecessor ${predecessor}`,
            why: `Removing a key from an inner node would leave its children without a separator. ${predecessor} is the largest key in the subtree to its left, so it can take ${key}'s place, and it comes out of a leaf.${leaf.keys.length === 0 ? ' That leaf is now empty and must be fixed.' : ''}`,
            codeLine: LINE.predecessor,
            variables: { key, predecessor },
            view: draw(root, { roles: new Map([[node, 'found'], [leaf, leaf.keys.length === 0 ? 'active' : 'swap']]), matched: new Map([[node, at]]) }),
          });
        }
        root = fixUp(root, path, steps);
        return { steps, state: root };
      },
    },
  ],
};
