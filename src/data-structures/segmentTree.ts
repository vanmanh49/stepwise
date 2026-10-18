import type { StructureDef } from '../types/lesson';
import type { ArrayView, PanelsView, Role, Step, TreeView } from '../types/visualization';
import { lineOf } from './shared';

export const SIZE = 8;

const code = `// tree[1] covers a[0..7]; node k's children are 2k and 2k + 1.
function build(node: number, lo: number, hi: number): void {
  if (lo === hi) { tree[node] = a[lo]; return; }
  const mid = (lo + hi) >> 1;
  build(2 * node, lo, mid);
  build(2 * node + 1, mid + 1, hi);
  tree[node] = tree[2 * node] + tree[2 * node + 1];
}

function query(node: number, lo: number, hi: number, l: number, r: number): number {
  if (r < lo || hi < l) return 0; // no overlap: skip
  if (l <= lo && hi <= r) return tree[node]; // fully inside: use whole
  const mid = (lo + hi) >> 1; // partial overlap: split
  return query(2 * node, lo, mid, l, r) + query(2 * node + 1, mid + 1, hi, l, r);
}

function update(node: number, lo: number, hi: number, i: number, value: number): void {
  if (lo === hi) { tree[node] = value; return; } // the leaf
  const mid = (lo + hi) >> 1;
  if (i <= mid) update(2 * node, lo, mid, i, value);
  else update(2 * node + 1, mid + 1, hi, i, value);
  tree[node] = tree[2 * node] + tree[2 * node + 1]; // recompute on the way back
}`;

const LINE = {
  skip: lineOf(code, '// no overlap: skip'),
  whole: lineOf(code, '// fully inside: use whole'),
  split: lineOf(code, '// partial overlap: split'),
  query: lineOf(code, 'function query'),
  leaf: lineOf(code, '// the leaf'),
  goLeft: lineOf(code, 'if (i <= mid) update'),
  goRight: lineOf(code, 'else update('),
  recompute: lineOf(code, '// recompute on the way back'),
};

const sum = (values: number[], lo: number, hi: number) => values.slice(lo, hi + 1).reduce((a, b) => a + b, 0);
const idOf = (lo: number, hi: number) => `s${lo}-${hi}`;
const range = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

function view(values: number[], roles: Record<string, Role> = {}, cellRoles: Record<number, Role> = {}): PanelsView {
  const nodes: TreeView['nodes'] = [];
  const walk = (lo: number, hi: number): void => {
    const mid = (lo + hi) >> 1;
    nodes.push({
      id: idOf(lo, hi),
      value: sum(values, lo, hi),
      role: roles[idOf(lo, hi)] ?? 'default',
      badge: range(lo, hi),
      ...(lo < hi && { left: idOf(lo, mid), right: idOf(mid + 1, hi) }),
    });
    if (lo < hi) {
      walk(lo, mid);
      walk(mid + 1, hi);
    }
  };
  walk(0, SIZE - 1);
  const array: ArrayView = { kind: 'array', cells: values.map((v, i) => ({ id: `a${i}`, value: v, role: cellRoles[i] ?? 'default' })) };
  return {
    kind: 'panels',
    panels: [
      { label: 'a[i]', view: array },
      { label: 'Segment tree (sum; range above)', view: { kind: 'tree', root: idOf(0, SIZE - 1), nodes } },
    ],
  };
}

const inRange = (x: number) => Number.isInteger(x) && x >= 0 && x < SIZE;

function refuse(values: number[], title: string, why: string, codeLine: number) {
  return { steps: [{ title, why, codeLine, view: view(values) }], state: values };
}

export const segmentTreeStructure: StructureDef = {
  initial: [5, 3, 7, 9, 6, 4, 1, 2],
  view: (values) => view(values),
  code,
  ops: [
    {
      id: 'query',
      label: 'Range sum',
      args: [
        { name: 'l', label: 'From', sample: 2 },
        { name: 'r', label: 'To', sample: 6 },
      ],
      run(values, [l = 0, r = 0]) {
        if (!inRange(l) || !inRange(r)) return refuse(values, 'That range is outside the array', `Positions run from 0 to ${SIZE - 1}.`, LINE.query);
        if (l > r) return refuse(values, 'The range is backwards', `"From" must not be larger than "To". Try ${r} to ${l}.`, LINE.query);
        const steps: Step[] = [];
        const roles: Record<string, Role> = {};
        const cells = Object.fromEntries(Array.from({ length: r - l + 1 }, (_, k) => [l + k, 'frontier' as Role]));
        let total = 0;
        const visit = (lo: number, hi: number): void => {
          const id = idOf(lo, hi);
          const nodeSum = sum(values, lo, hi);
          if (r < lo || hi < l) {
            roles[id] = 'discarded';
            steps.push({
              title: `Skip ${range(lo, hi)}: outside ${l}–${r}`,
              why: 'None of its positions are in the range, so its whole subtree is ignored without looking inside.',
              codeLine: LINE.skip,
              variables: { node: range(lo, hi), sum: total },
              view: view(values, { ...roles }, cells),
            });
            return;
          }
          if (l <= lo && hi <= r) {
            roles[id] = 'found';
            total += nodeSum;
            steps.push({
              title: `Use ${range(lo, hi)} whole: +${nodeSum}`,
              why: `All of its positions are inside ${l}–${r}, so its stored sum counts as is. There is no need to go further down.`,
              codeLine: LINE.whole,
              variables: { node: range(lo, hi), sum: total },
              view: view(values, { ...roles }, cells),
            });
            return;
          }
          roles[id] = 'compare';
          steps.push({
            title: `Split ${range(lo, hi)}: it overlaps ${l}–${r} only partly`,
            why: 'Part of it is inside the range and part is not, so its sum cannot be used. Ask both children instead.',
            codeLine: LINE.split,
            variables: { node: range(lo, hi), sum: total },
            view: view(values, { ...roles, [id]: 'active' }, cells),
          });
          const mid = (lo + hi) >> 1;
          visit(lo, mid);
          visit(mid + 1, hi);
        };
        visit(0, SIZE - 1);
        const used = Object.values(roles).filter((role) => role === 'found').length;
        steps.push({
          title: `Sum of a[${l}..${r}] = ${total}`,
          why: `The answer was built from ${used} stored sum${used === 1 ? '' : 's'}. At most about 2 nodes per level are used, so a query touches O(log n) nodes, not all ${r - l + 1} positions.`,
          codeLine: LINE.query,
          variables: { l, r, sum: total },
          view: view(values, { ...roles }, Object.fromEntries(Object.keys(cells).map((k) => [k, 'found' as Role]))),
        });
        return { steps, state: values };
      },
    },
    {
      id: 'update',
      label: 'Update',
      args: [
        { name: 'i', label: 'Index', sample: 3 },
        { name: 'value', label: 'Value', sample: 1 },
      ],
      run(values, [i = 0, value = 0]) {
        if (!inRange(i)) return refuse(values, `${i} is not a position`, `Positions run from 0 to ${SIZE - 1}.`, LINE.leaf);
        const steps: Step[] = [];
        const path: [number, number][] = [];
        let lo = 0;
        let hi = SIZE - 1;
        const roles: Record<string, Role> = {};
        while (lo < hi) {
          path.push([lo, hi]);
          const mid = (lo + hi) >> 1;
          const left = i <= mid;
          roles[idOf(lo, hi)] = 'visited';
          steps.push({
            title: `${range(lo, hi)}: go ${left ? 'left' : 'right'} to ${left ? range(lo, mid) : range(mid + 1, hi)}`,
            why: `Position ${i} is ${left ? `at most ${mid}` : `above ${mid}`}, so it lies in the ${left ? 'left' : 'right'} half.`,
            codeLine: left ? LINE.goLeft : LINE.goRight,
            variables: { i, node: range(lo, hi) },
            view: view(values, { ...roles, [idOf(lo, hi)]: 'active' }, { [i]: 'active' }),
          });
          if (left) hi = mid;
          else lo = mid + 1;
        }
        const next = values.map((v, k) => (k === i ? value : v));
        steps.push({
          title: `Set leaf ${i} to ${value}`,
          why: `The leaf covers only position ${i}, so its sum is just the new value.`,
          codeLine: LINE.leaf,
          variables: { i, value },
          view: view(next, { ...roles, [idOf(i, i)]: 'found' }, { [i]: 'found' }),
        });
        for (const [plo, phi] of path.toReversed()) {
          roles[idOf(plo, phi)] = 'found';
          steps.push({
            title: `Recompute ${range(plo, phi)} = ${sum(next, plo, phi)}`,
            why: 'A node stores the sum of its two children, and one of them just changed. Only the nodes on this one path change: O(log n) of them.',
            codeLine: LINE.recompute,
            variables: { node: range(plo, phi), sum: sum(next, plo, phi) },
            view: view(next, { ...roles, [idOf(i, i)]: 'found' }, { [i]: 'found' }),
          });
        }
        return { steps, state: next };
      },
    },
  ],
};
