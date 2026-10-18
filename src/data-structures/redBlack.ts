import type { StructureDef } from '../types/lesson';
import type { Role, Step, TreeView } from '../types/visualization';
import { lineOf } from './shared';

export const MAX_RB_NODES = 15;

/** The tree's preorder: each value with whether it is red. Inserting it in order rebuilds the tree. */
export type RBState = [value: number, red: boolean][];

const code = `const RED = true, BLACK = false;

function insert(tree: Tree, value: number): void {
  let parent: RbNode | null = null;
  let node = tree.root;
  while (node) {
    if (value === node.value) return; // already present
    parent = node;
    node = value < node.value ? node.left : node.right;
  }
  const z = new RbNode(value, RED, parent); // new nodes start red
  if (!parent) tree.root = z;
  else if (value < parent.value) parent.left = z;
  else parent.right = z;
  insertFixup(tree, z);
}

function insertFixup(tree: Tree, z: RbNode): void {
  while (z.parent?.color === RED) {
    const p = z.parent, g = p.parent!;
    const uncle = p === g.left ? g.right : g.left;
    if (uncle?.color === RED) { // red uncle
      p.color = uncle.color = BLACK;
      g.color = RED;
      z = g;
    } else {
      if (z === (p === g.left ? p.right : p.left)) { // triangle
        z = p;
        p === g.left ? rotateLeft(tree, z) : rotateRight(tree, z);
      }
      z.parent!.color = BLACK; // line
      g.color = RED;
      z.parent === g.left ? rotateRight(tree, g) : rotateLeft(tree, g);
    }
  }
  tree.root!.color = BLACK; // the root is always black
}

function remove(tree: Tree, value: number): void {
  const z = search(tree.root, value);
  if (!z) return;
  let yColor = z.color, x: RbNode | null, xParent: RbNode | null;
  if (!z.left || !z.right) {
    x = z.left ?? z.right; xParent = z.parent; // one child or none
    transplant(tree, z, x);
  } else {
    const y = min(z.right); yColor = y.color; // successor
    x = y.right; xParent = y.parent === z ? y : y.parent;
    if (y.parent !== z) { transplant(tree, y, y.right); y.right = z.right; y.right.parent = y; }
    transplant(tree, z, y);
    y.left = z.left; y.left.parent = y; y.color = z.color;
  }
  if (yColor === BLACK) deleteFixup(tree, x, xParent);
}

// x carries an extra black (a "double black") until one of the cases removes it.
function deleteFixup(tree: Tree, x: RbNode | null, parent: RbNode | null): void {
  while (x !== tree.root && x?.color !== RED) {
    const left = x === parent!.left; // else the mirrored cases
    let w = left ? parent!.right! : parent!.left!; // sibling
    if (w.color === RED) { // red sibling
      w.color = BLACK; parent!.color = RED;
      left ? rotateLeft(tree, parent!) : rotateRight(tree, parent!);
      w = left ? parent!.right! : parent!.left!;
    }
    const near = left ? w.left : w.right, far = left ? w.right : w.left;
    if (near?.color !== RED && far?.color !== RED) { // black nephews
      w.color = RED;
      x = parent; parent = x!.parent;
    } else {
      if (far?.color !== RED) { // near nephew red
        near!.color = BLACK; w.color = RED;
        left ? rotateRight(tree, w) : rotateLeft(tree, w);
        w = left ? parent!.right! : parent!.left!;
      }
      w.color = parent!.color; parent!.color = BLACK; // far nephew red
      (left ? w.right : w.left)!.color = BLACK;
      left ? rotateLeft(tree, parent!) : rotateRight(tree, parent!);
      x = tree.root;
    }
  }
  if (x) x.color = BLACK;
}`;

const LINE = {
  compare: lineOf(code, 'node = value < node.value ? node.left'),
  duplicate: lineOf(code, '// already present'),
  attach: lineOf(code, '// new nodes start red'),
  redUncle: lineOf(code, '// red uncle'),
  triangle: lineOf(code, '// triangle'),
  line: lineOf(code, '// line'),
  root: lineOf(code, '// the root is always black'),
  search: lineOf(code, 'const z = search(tree.root, value);'),
  missing: lineOf(code, 'if (!z) return;'),
  simple: lineOf(code, '// one child or none'),
  successor: lineOf(code, '// successor'),
  takePlace: lineOf(code, 'transplant(tree, z, y);'),
  needsFix: lineOf(code, 'if (yColor === BLACK) deleteFixup'),
  redSibling: lineOf(code, '// red sibling'),
  blackNephews: lineOf(code, '// black nephews'),
  nearNephew: lineOf(code, '// near nephew red'),
  farNephew: lineOf(code, '// far nephew red'),
  absorb: lineOf(code, 'if (x) x.color = BLACK;'),
};

interface RbNode {
  value: number;
  red: boolean;
  left: RbNode | null;
  right: RbNode | null;
  parent: RbNode | null;
}

interface Tree {
  root: RbNode | null;
}

const isRed = (n: RbNode | null | undefined) => n?.red === true;

function attach(tree: Tree, value: number, red: boolean): RbNode {
  let parent: RbNode | null = null;
  for (let n = tree.root; n; n = value < n.value ? n.left : n.right) parent = n;
  const node: RbNode = { value, red, left: null, right: null, parent };
  if (!parent) tree.root = node;
  else if (value < parent.value) parent.left = node;
  else parent.right = node;
  return node;
}

/** A fresh mutable tree, so the caller's state is never touched. */
function load(state: RBState): Tree {
  const tree: Tree = { root: null };
  for (const [value, red] of state) attach(tree, value, red);
  return tree;
}

function save(tree: Tree): RBState {
  const out: RBState = [];
  const walk = (n: RbNode | null): void => {
    if (!n) return;
    out.push([n.value, n.red]);
    walk(n.left);
    walk(n.right);
  };
  walk(tree.root);
  return out;
}

function draw(tree: Tree, roles: Record<number, Role> = {}): TreeView {
  const nodes: TreeView['nodes'] = [];
  const walk = (n: RbNode | null): void => {
    if (!n) return;
    nodes.push({
      id: `n${n.value}`,
      value: n.value,
      role: roles[n.value] ?? 'default',
      color: n.red ? 'red' : 'black',
      ...(n.left && { left: `n${n.left.value}` }),
      ...(n.right && { right: `n${n.right.value}` }),
    });
    walk(n.left);
    walk(n.right);
  };
  walk(tree.root);
  return { kind: 'tree', nodes, ...(tree.root && { root: `n${tree.root.value}` }) };
}

function rotateLeft(tree: Tree, x: RbNode): void {
  const y = x.right!;
  x.right = y.left;
  if (y.left) y.left.parent = x;
  y.parent = x.parent;
  if (!x.parent) tree.root = y;
  else if (x === x.parent.left) x.parent.left = y;
  else x.parent.right = y;
  y.left = x;
  x.parent = y;
}

function rotateRight(tree: Tree, y: RbNode): void {
  const x = y.left!;
  y.left = x.right;
  if (x.right) x.right.parent = y;
  x.parent = y.parent;
  if (!y.parent) tree.root = x;
  else if (y === y.parent.right) y.parent.right = x;
  else y.parent.left = x;
  x.right = y;
  y.parent = x;
}

function transplant(tree: Tree, u: RbNode, v: RbNode | null): void {
  if (!u.parent) tree.root = v;
  else if (u === u.parent.left) u.parent.left = v;
  else u.parent.right = v;
  if (v) v.parent = u.parent;
}

function find(tree: Tree, value: number): RbNode | null {
  let n = tree.root;
  while (n && n.value !== value) n = value < n.value ? n.left : n.right;
  return n;
}

const colourName = (n: RbNode) => (n.red ? 'red' : 'black');

/** One comparison step per node from the root towards `value`. */
function descend(tree: Tree, value: number, steps: Step[]): Record<number, Role> {
  const path: Record<number, Role> = {};
  for (let n = tree.root; n && n.value !== value; n = value < n.value ? n.left : n.right) {
    const goLeft = value < n.value;
    steps.push({
      title: `Compare ${value} with ${n.value}`,
      why: goLeft ? `${value} < ${n.value}, so go left.` : `${value} > ${n.value}, so go right.`,
      codeLine: LINE.compare,
      variables: { value, node: n.value },
      view: draw(tree, { ...path, [n.value]: 'compare' }),
    });
    path[n.value] = 'visited';
  }
  return path;
}

function insertFixup(tree: Tree, z: RbNode, steps: Step[]): void {
  while (isRed(z.parent)) {
    const p = z.parent!;
    const g = p.parent!;
    const parentIsLeft = p === g.left;
    const uncle = parentIsLeft ? g.right : g.left;
    if (isRed(uncle)) {
      p.red = false;
      uncle!.red = false;
      g.red = true;
      steps.push({
        title: `Uncle ${uncle!.value} is red: recolour`,
        why: `${z.value} and its parent ${p.value} are both red, which is not allowed. The uncle is red too, so ${p.value} and ${uncle!.value} turn black and ${g.value} turns red. Black heights stay the same, but ${g.value} may now clash with its own parent, so the check moves up to it.`,
        codeLine: LINE.redUncle,
        variables: { node: z.value, parent: p.value, uncle: uncle!.value, grandparent: g.value },
        view: draw(tree, { [p.value]: 'active', [uncle!.value]: 'active', [g.value]: 'active' }),
      });
      z = g;
      continue;
    }
    if (z === (parentIsLeft ? p.right : p.left)) {
      if (parentIsLeft) rotateLeft(tree, p);
      else rotateRight(tree, p);
      steps.push({
        title: `Triangle: rotate ${p.value} ${parentIsLeft ? 'left' : 'right'}`,
        why: `${z.value} is the ${parentIsLeft ? 'right' : 'left'} child of a ${parentIsLeft ? 'left' : 'right'} child, a zig-zag. The uncle is black, so recolouring cannot help. Rotating ${p.value} lines the two red nodes up so the next case can fix them.`,
        codeLine: LINE.triangle,
        variables: { node: z.value, parent: p.value },
        view: draw(tree, { [z.value]: 'active', [p.value]: 'active' }),
      });
      z = p;
    }
    const parent = z.parent!;
    parent.red = false;
    g.red = true;
    if (parentIsLeft) rotateRight(tree, g);
    else rotateLeft(tree, g);
    steps.push({
      title: `Line: rotate ${g.value} ${parentIsLeft ? 'right' : 'left'} and swap colours`,
      why: `${z.value} and ${parent.value} are red in a straight line under a black uncle. ${parent.value} moves up into ${g.value}'s place and turns black; ${g.value} moves down and turns red. No two reds touch and every path keeps its number of black nodes.`,
      codeLine: LINE.line,
      variables: { node: z.value, parent: parent.value, grandparent: g.value },
      view: draw(tree, { [parent.value]: 'found', [g.value]: 'found' }),
    });
  }
  if (tree.root!.red) {
    tree.root!.red = false;
    steps.push({
      title: 'Make the root black',
      why: 'The root must be black. Turning it black adds one black node to every path at once, so all paths stay equal.',
      codeLine: LINE.root,
      variables: { root: tree.root!.value },
      view: draw(tree, { [tree.root!.value]: 'found' }),
    });
  }
}

/** Removes the extra black carried by `x` (an empty spot when null) below `parent`. */
function deleteFixup(tree: Tree, x: RbNode | null, parent: RbNode | null, steps: Step[]): void {
  while (x !== tree.root && !isRed(x)) {
    const p = parent!;
    // With no sentinel nodes, an empty x is on the left exactly when the left spot is empty.
    const left = x === p.left;
    const mirrored = left ? '' : ' (mirrored)';
    const focus = x ? { [x.value]: 'active' as Role } : {};
    let w = left ? p.right! : p.left!;
    if (w.red) {
      w.red = false;
      p.red = true;
      if (left) rotateLeft(tree, p);
      else rotateRight(tree, p);
      steps.push({
        title: `Sibling ${w.value} is red: rotate and recolour${mirrored}`,
        why: `The ${x ? `node ${x.value}` : 'empty spot'} under ${p.value} is "double black": its paths are one black node short. Its sibling ${w.value} is red, so rotate ${p.value} towards the short side and swap their colours. The new sibling is black, which the next cases need.`,
        codeLine: LINE.redSibling,
        variables: { parent: p.value, sibling: w.value },
        view: draw(tree, { ...focus, [w.value]: 'active', [p.value]: 'active' }),
      });
      w = left ? p.right! : p.left!;
    }
    const near = left ? w.left : w.right;
    const far = left ? w.right : w.left;
    if (!isRed(near) && !isRed(far)) {
      w.red = true;
      steps.push({
        title: `Sibling ${w.value} and both its children are black: recolour and move up${mirrored}`,
        why: `Turning ${w.value} red takes one black off the sibling's side too, so both sides of ${p.value} are level. Now ${p.value} as a whole is one black short. ${p.red ? `${p.value} is red, so making it black ends the fix.` : `The double black moves up to ${p.value}.`}`,
        codeLine: LINE.blackNephews,
        variables: { parent: p.value, sibling: w.value },
        view: draw(tree, { ...focus, [w.value]: 'active', [p.value]: 'active' }),
      });
      x = p;
      parent = p.parent;
      continue;
    }
    if (!isRed(far)) {
      near!.red = false;
      w.red = true;
      if (left) rotateRight(tree, w);
      else rotateLeft(tree, w);
      steps.push({
        title: `Sibling ${w.value}'s near child is red: rotate the sibling${mirrored}`,
        why: `${near!.value}, the sibling's child nearer the short side, is red and the far one is black. Rotating ${w.value} away and swapping colours moves the red to the far side, ready for the last case.`,
        codeLine: LINE.nearNephew,
        variables: { sibling: w.value, near: near!.value },
        view: draw(tree, { ...focus, [near!.value]: 'active', [w.value]: 'active' }),
      });
      w = left ? p.right! : p.left!;
    }
    w.red = p.red;
    p.red = false;
    (left ? w.right : w.left)!.red = false;
    if (left) rotateLeft(tree, p);
    else rotateRight(tree, p);
    steps.push({
      title: `Sibling ${w.value}'s far child is red: rotate the parent and recolour${mirrored}`,
      why: `Rotating ${p.value} towards the short side moves ${w.value} up into its place with ${p.value}'s colour. ${p.value} and the far child turn black, which adds the missing black to the short side without changing the other. The fix is done.`,
      codeLine: LINE.farNephew,
      variables: { parent: p.value, sibling: w.value },
      view: draw(tree, { [w.value]: 'found', [p.value]: 'found' }),
    });
    x = tree.root;
  }
  if (x && x.red) {
    x.red = false;
    steps.push({
      title: `Colour ${x.value} black`,
      why: x === tree.root ? `${x.value} is the root, so the extra black can simply be dropped: every path loses or keeps it together.` : `${x.value} is red, so it can take the extra black itself by turning black. Its paths get back the black node they lost.`,
      codeLine: LINE.absorb,
      variables: { node: x.value },
      view: draw(tree, { [x.value]: 'found' }),
    });
  }
}

export const redBlackStructure: StructureDef<RBState> = {
  initial: [[20, false], [10, false], [5, true], [15, true], [30, false], [25, true], [40, true]],
  view: (state) => draw(load(state)),
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'value', label: 'Value', sample: 12 }],
      run(state, [value = 0]) {
        const tree = load(state);
        if (!find(tree, value) && state.length >= MAX_RB_NODES) {
          return {
            steps: [{ title: 'The tree is full', why: `This visualization holds at most ${MAX_RB_NODES} nodes so the tree stays readable. Delete a node first.`, codeLine: LINE.attach, view: draw(tree) }],
            state,
          };
        }
        const steps: Step[] = [];
        const path = descend(tree, value, steps);
        if (find(tree, value)) {
          steps.push({ title: `${value} is already in the tree`, why: 'Each value is stored once, so nothing changes.', codeLine: LINE.duplicate, variables: { value }, view: draw(tree, { ...path, [value]: 'found' }) });
          return { steps, state };
        }
        const z = attach(tree, value, true);
        steps.push({
          title: z.parent ? `Attach ${value} as a red child of ${z.parent.value}` : `${value} becomes the root`,
          why: z.parent
            ? `New nodes start red, because adding a red node never changes how many black nodes a path has. ${z.parent.red ? `But its parent ${z.parent.value} is red too, which breaks the rule that a red node has no red child.` : `Its parent ${z.parent.value} is black, so every rule still holds.`}`
            : 'The tree was empty. New nodes start red, but the root must be black.',
          codeLine: LINE.attach,
          variables: { value },
          view: draw(tree, { ...path, [value]: 'found' }),
        });
        insertFixup(tree, z, steps);
        return { steps, state: save(tree) };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'value', label: 'Value', sample: 25 }],
      run(state, [value = 0]) {
        const tree = load(state);
        const steps: Step[] = [];
        const path = descend(tree, value, steps);
        const found = find(tree, value);
        steps.push({
          title: found ? `Found ${value}` : `${value} is not in the tree`,
          why: found
            ? 'Colours only matter when the tree changes. A search is an ordinary BST search, and the tree is never more than 2 × log₂ n levels tall.'
            : 'The search reached an empty spot where the value would have to be.',
          codeLine: LINE.compare,
          variables: { value },
          view: draw(tree, found ? { ...path, [value]: 'found' } : path),
        });
        return { steps, state };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'value', label: 'Value', sample: 10 }],
      run(state, [value = 0]) {
        const tree = load(state);
        const steps: Step[] = [];
        const path = descend(tree, value, steps);
        const z = find(tree, value);
        if (!z) {
          steps.push({ title: `${value} is not in the tree`, why: 'The search reached an empty spot, so there is nothing to delete.', codeLine: LINE.missing, variables: { value }, view: draw(tree, path) });
          return { steps, state };
        }
        let removedRed = z.red;
        let x: RbNode | null;
        let xParent: RbNode | null;
        if (!z.left || !z.right) {
          x = z.left ?? z.right;
          xParent = z.parent;
          steps.push({
            title: `Remove ${value} (${colourName(z)})`,
            why: z.left || z.right ? `${value} has one child, ${(z.left ?? z.right)!.value}, which takes its place.` : `${value} has no children, so it is simply removed.`,
            codeLine: LINE.simple,
            variables: { value, colour: colourName(z) },
            view: draw(tree, { ...path, [value]: 'discarded' }),
          });
          transplant(tree, z, x);
        } else {
          let y = z.right;
          while (y.left) y = y.left;
          removedRed = y.red;
          steps.push({
            title: `${value} has two children: use its successor ${y.value}`,
            why: `${y.value} is the smallest value in ${value}'s right subtree. It moves into ${value}'s place and takes ${value}'s colour, so what really disappears is a ${colourName(y)} node from ${y.value}'s old spot.`,
            codeLine: LINE.successor,
            variables: { value, successor: y.value },
            view: draw(tree, { ...path, [value]: 'discarded', [y.value]: 'pivot' }),
          });
          x = y.right;
          xParent = y.parent === z ? y : y.parent;
          if (y.parent !== z) {
            transplant(tree, y, y.right);
            y.right = z.right;
            y.right.parent = y;
          }
          transplant(tree, z, y);
          y.left = z.left;
          y.left!.parent = y;
          y.red = z.red;
        }
        steps.push({
          title: removedRed ? 'A red node was removed: nothing to fix' : 'A black node was removed: fix the double black',
          why: removedRed
            ? 'Removing a red node never changes how many black nodes a path has, and cannot put two reds together.'
            : `Every path through the removed spot is now one black node short. Treat the ${x ? `node ${x.value}` : 'empty spot'} that took its place as "double black" and push the extra black around until it can be absorbed.`,
          codeLine: LINE.needsFix,
          variables: { value },
          view: draw(tree, x ? { [x.value]: 'active' } : xParent ? { [xParent.value]: 'compare' } : {}),
        });
        if (!removedRed) deleteFixup(tree, x, xParent, steps);
        return { steps, state: save(tree) };
      },
    },
  ],
};
