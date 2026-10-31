import type { StructureDef } from '../types/lesson';
import type { ArrayView, GraphView, PanelsView, Role, Step } from '../types/visualization';
import { layoutCalls } from '../components/visualization/renderers/callsLayout';
import { lineOf } from './shared';

const ELEMENTS = 10;

/** parent[i] is i's parent; a root is its own parent. rank[r] bounds the height of r's tree. */
export interface DSUState {
  parent: number[];
  rank: number[];
}

const code = `const parent = Array.from({ length: 10 }, (_, i) => i);
const rank = new Array(10).fill(0);

function find(x: number): number {
  let root = x;
  while (parent[root] !== root) root = parent[root]; // follow parents
  while (parent[x] !== root) { // path compression
    const next = parent[x];
    parent[x] = root;
    x = next;
  }
  return root;
}

function union(a: number, b: number): boolean {
  let ra = find(a), rb = find(b);
  if (ra === rb) return false; // already in one set
  if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra]; // ra is the taller tree
  parent[rb] = ra;
  if (rank[ra] === rank[rb]) rank[ra]++; // equal ranks
  return true;
}

const connected = (a: number, b: number) => find(a) === find(b);`;

const LINE = {
  follow: lineOf(code, '// follow parents'),
  compress: lineOf(code, 'parent[x] = root;'),
  root: lineOf(code, 'return root;'),
  same: lineOf(code, '// already in one set'),
  attach: lineOf(code, 'parent[rb] = ra;'),
  equal: lineOf(code, '// equal ranks'),
  connected: lineOf(code, 'const connected'),
};

function view(state: DSUState, roles: Record<number, Role> = {}): PanelsView {
  const items = state.parent.map((p, i) => ({ id: `e${i}`, ...(p !== i && { parent: `e${p}` }) }));
  const layout = layoutCalls(items);
  const maxX = Math.max(1, ...layout.map((p) => p.x));
  const maxY = Math.max(1, ...layout.map((p) => p.y));
  const at = new Map(layout.map((p) => [p.id, p]));
  const forest: GraphView = {
    kind: 'graph',
    directed: true,
    nodes: state.parent.map((p, i) => ({
      id: `e${i}`,
      label: String(i),
      x: (at.get(`e${i}`)!.x / maxX) * 100,
      y: (at.get(`e${i}`)!.y / maxY) * 100,
      role: roles[i] ?? 'default',
      ...(p === i && { badge: `r${state.rank[i]}` }),
    })),
    edges: state.parent.flatMap((p, i) => (p === i ? [] : [{ from: `e${i}`, to: `e${p}`, role: roles[i] && roles[p] ? roles[i]! : ('default' as Role) }])),
  };
  const array: ArrayView = { kind: 'array', cells: state.parent.map((p, i) => ({ id: `p${i}`, value: p, role: roles[i] ?? 'default' })) };
  return { kind: 'panels', panels: [{ label: 'Forest (r = rank)', view: forest }, { label: 'parent[i]', view: array }] };
}

const valid = (x: number) => Number.isInteger(x) && x >= 0 && x < ELEMENTS;

function refuseRange(state: DSUState, x: number) {
  return {
    steps: [{ title: `${x} is not an element`, why: `This set holds the elements 0 to ${ELEMENTS - 1}.`, codeLine: 1, view: view(state) }],
    state,
  };
}

/** Find with path compression, one step per hop; returns the root and the new state. */
function findSteps(state: DSUState, x: number, steps: Step[]): { root: number; state: DSUState } {
  const path = [x];
  while (state.parent[path.at(-1)!] !== path.at(-1)) path.push(state.parent[path.at(-1)!]!);
  const root = path.at(-1)!;
  const roles = (upto: number): Record<number, Role> => Object.fromEntries(path.slice(0, upto + 1).map((n, k) => [n, k === upto ? 'active' : 'visited']));
  for (let k = 0; k + 1 < path.length; k++) {
    steps.push({
      title: `Follow ${path[k]} → parent ${path[k + 1]}`,
      why: k === 0 ? `Every set is a tree, named by its root. To find ${x}'s set, follow parent pointers until a node is its own parent.` : `${path[k]} is not a root (its parent is ${path[k + 1]}), so keep climbing.`,
      codeLine: LINE.follow,
      variables: { x, node: path[k]!, parent: path[k + 1]! },
      view: view(state, roles(k + 1)),
    });
  }
  steps.push({
    title: `${x}'s root is ${root}`,
    why: path.length === 1 ? `${x} is its own parent, so it is the root of its set.` : `${root} is its own parent, so it names the set ${x} belongs to. That took ${path.length - 1} hop${path.length === 2 ? '' : 's'}.`,
    codeLine: LINE.root,
    variables: { x, root },
    view: view(state, { ...roles(path.length - 1), [root]: 'found' }),
  });
  // Nodes not already pointing at the root get re-pointed.
  const moved = path.slice(0, -1).filter((n) => state.parent[n] !== root);
  if (moved.length === 0) return { root, state };
  const next: DSUState = { parent: state.parent.map((p, i) => (moved.includes(i) ? root : p)), rank: state.rank };
  steps.push({
    title: `Path compression: point ${moved.join(', ')} straight at ${root}`,
    why: `Every node passed on the way now points directly at the root, so the next find from any of them takes one hop. Ranks are not changed: they stay an upper bound on height.`,
    codeLine: LINE.compress,
    variables: { x, root },
    view: view(next, { ...Object.fromEntries(moved.map((n) => [n, 'swap' as Role])), [root]: 'found' }),
  });
  return { root, state: next };
}

export const disjointSetStructure: StructureDef<DSUState> = {
  initial: { parent: [0, 0, 0, 2, 4, 4, 4, 7, 7, 9], rank: [2, 0, 1, 0, 1, 0, 0, 1, 0, 0] },
  view: (state) => view(state),
  code,
  ops: [
    {
      id: 'find',
      label: 'Find',
      args: [{ name: 'x', label: 'x', sample: 3 }],
      run(state, [x = 0]) {
        if (!valid(x)) return refuseRange(state, x);
        const steps: Step[] = [];
        return { steps, state: findSteps(state, x, steps).state };
      },
    },
    {
      id: 'union',
      label: 'Union',
      args: [
        { name: 'a', label: 'a', sample: 5 },
        { name: 'b', label: 'b', sample: 8 },
      ],
      run(state, [a = 0, b = 0]) {
        if (!valid(a)) return refuseRange(state, a);
        if (!valid(b)) return refuseRange(state, b);
        const steps: Step[] = [];
        const fa = findSteps(state, a, steps);
        const fb = findSteps(fa.state, b, steps);
        let current = fb.state;
        if (fa.root === fb.root) {
          steps.push({ title: `${a} and ${b} are already in the same set`, why: `Both have root ${fa.root}, so there is nothing to join.`, codeLine: LINE.same, variables: { a, b, root: fa.root }, view: view(current, { [fa.root]: 'found' }) });
          return { steps, state: current };
        }
        let [ra, rb] = [fa.root, fb.root];
        if (current.rank[ra]! < current.rank[rb]!) [ra, rb] = [rb, ra];
        const equal = current.rank[ra] === current.rank[rb];
        current = {
          parent: current.parent.map((p, i) => (i === rb ? ra : p)),
          rank: current.rank.map((r, i) => (equal && i === ra ? r + 1 : r)),
        };
        steps.push({
          title: equal ? `Equal ranks: attach ${rb} under ${ra}, rank of ${ra} becomes ${current.rank[ra]}` : `Attach ${rb} (rank ${current.rank[rb]}) under ${ra} (rank ${current.rank[ra]})`,
          why: equal
            ? 'Both trees may be equally tall, so the joined tree can be one level taller. Its root\'s rank goes up by one.'
            : 'Union by rank: the shorter tree goes under the taller one, so the joined tree is no taller than before. Trees stay about log n tall.',
          codeLine: equal ? LINE.equal : LINE.attach,
          variables: { a, b, root: ra },
          view: view(current, { [rb]: 'swap', [ra]: 'found' }),
        });
        return { steps, state: current };
      },
    },
    {
      id: 'connected',
      label: 'Connected?',
      args: [
        { name: 'a', label: 'a', sample: 1 },
        { name: 'b', label: 'b', sample: 3 },
      ],
      run(state, [a = 0, b = 0]) {
        if (!valid(a)) return refuseRange(state, a);
        if (!valid(b)) return refuseRange(state, b);
        const steps: Step[] = [];
        const fa = findSteps(state, a, steps);
        const fb = findSteps(fa.state, b, steps);
        const same = fa.root === fb.root;
        steps.push({
          title: same ? `${a} and ${b} are connected: both have root ${fa.root}` : `${a} and ${b} are not connected: roots ${fa.root} and ${fb.root}`,
          why: 'Two elements are in the same set exactly when their finds reach the same root.',
          codeLine: LINE.connected,
          variables: { a, b },
          view: view(fb.state, same ? { [fa.root]: 'found' } : { [fa.root]: 'discarded', [fb.root]: 'discarded' }),
        });
        return { steps, state: fb.state };
      },
    },
  ],
};
