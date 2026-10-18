import type { StructureDef } from '../types/lesson';
import type { ArrayView, Cell, GraphView, GridView, PanelsView, Role, Step } from '../types/visualization';
import { lineOf } from './shared';

export const NODES = 6;

/** The edge list is the source of truth; the matrix and adjacency lists are derived from it in order. */
export interface GraphRepsState {
  directed: boolean;
  edges: [number, number][];
}

const code = `// The same graph, three ways (n nodes, E edges).
const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
const list: number[][] = Array.from({ length: n }, () => []);
const edges: [number, number][] = [];

function addEdge(u: number, v: number): void {
  matrix[u][v] = 1; // O(1)
  list[u].push(v); // O(1)
  edges.push([u, v]); // O(1)
  if (!directed) { matrix[v][u] = 1; list[v].push(u); }
}

function removeEdge(u: number, v: number): void {
  matrix[u][v] = 0; // O(1)
  list[u].splice(list[u].indexOf(v), 1); // O(degree)
  edges.splice(edges.findIndex(([a, b]) => a === u && b === v), 1); // O(E)
  if (!directed) { matrix[v][u] = 0; list[v].splice(list[v].indexOf(u), 1); }
}

const hasEdgeMatrix = (u: number, v: number) => matrix[u][v] === 1; // O(1)
const hasEdgeList = (u: number, v: number) => list[u].includes(v); // O(degree)
const hasEdgeEdges = (u: number, v: number) => edges.some(([a, b]) => a === u && b === v); // O(E)

const neighboursMatrix = (u: number) => matrix[u].flatMap((x, v) => (x ? [v] : [])); // O(n)
const neighboursList = (u: number) => list[u]; // O(degree)
const neighboursEdges = (u: number) => edges.flatMap(([a, b]) => (a === u ? [b] : [])); // O(E)`;

const LINE = {
  addMatrix: lineOf(code, 'matrix[u][v] = 1;'),
  addList: lineOf(code, 'list[u].push(v);'),
  addEdges: lineOf(code, 'edges.push([u, v]);'),
  removeMatrix: lineOf(code, 'matrix[u][v] = 0;'),
  removeList: lineOf(code, 'list[u].splice'),
  removeEdges: lineOf(code, 'edges.splice'),
  hasMatrix: lineOf(code, 'const hasEdgeMatrix'),
  hasList: lineOf(code, 'const hasEdgeList'),
  hasEdges: lineOf(code, 'const hasEdgeEdges'),
  nMatrix: lineOf(code, 'const neighboursMatrix'),
  nList: lineOf(code, 'const neighboursList'),
  nEdges: lineOf(code, 'const neighboursEdges'),
  setup: lineOf(code, 'const edges: [number, number][] = [];'),
};

const POSITIONS = Array.from({ length: NODES }, (_, i) => {
  const angle = (i / NODES) * 2 * Math.PI - Math.PI / 2;
  return { x: 50 + 45 * Math.cos(angle), y: 50 + 50 * Math.sin(angle) };
});

/** Edges that leave u (both directions of an undirected edge count). */
const matches = (state: GraphRepsState, [a, b]: [number, number], u: number, v: number) => (a === u && b === v) || (!state.directed && a === v && b === u);

function adjacency(state: GraphRepsState): number[][] {
  const list: number[][] = Array.from({ length: NODES }, () => []);
  for (const [u, v] of state.edges) {
    list[u]!.push(v);
    if (!state.directed) list[v]!.push(u);
  }
  return list;
}

const edgeLabel = (state: GraphRepsState, [u, v]: [number, number]) => `${u}${state.directed ? '→' : '–'}${v}`;

interface Marks {
  /** Matrix cells as "r,c". */
  cells?: Record<string, Role>;
  /** List entries as "u,k" (k-th entry of u's list). */
  entries?: Record<string, Role>;
  /** Edge list positions. */
  edgeAt?: Record<number, Role>;
  /** Graph edges as "u,v" and nodes. */
  graphEdges?: Record<string, Role>;
  nodes?: Record<number, Role>;
}

function view(state: GraphRepsState, marks: Marks = {}): PanelsView {
  const list = adjacency(state);
  const has = (u: number, v: number) => state.edges.some((e) => matches(state, e, u, v));
  const graph: GraphView = {
    kind: 'graph',
    directed: state.directed,
    nodes: POSITIONS.map((p, i) => ({ id: `g${i}`, label: String(i), ...p, role: marks.nodes?.[i] ?? 'default' })),
    edges: state.edges.map(([u, v]) => ({ from: `g${u}`, to: `g${v}`, role: marks.graphEdges?.[`${u},${v}`] ?? 'default' })),
  };
  const labels = Array.from({ length: NODES }, (_, i) => String(i));
  const matrix: GridView = {
    kind: 'grid',
    colLabels: labels,
    rows: labels.map((_, r) => ({
      label: String(r),
      cells: labels.map((__, c): Cell => ({ id: `m${r}-${c}`, value: has(r, c) ? 1 : 0, role: marks.cells?.[`${r},${c}`] ?? 'default' })),
    })),
  };
  const width = Math.max(1, ...list.map((l) => l.length));
  const lists: GridView = {
    kind: 'grid',
    rows: list.map((items, u) => ({
      label: `${u} →`,
      cells: Array.from({ length: width }, (_, k): Cell | null => (k < items.length ? { id: `l${u}-${items[k]}`, value: items[k]!, role: marks.entries?.[`${u},${k}`] ?? 'default' } : null)),
    })),
  };
  const edgeList: ArrayView = {
    kind: 'array',
    cells: state.edges.map((e, k) => ({ id: `e${e[0]}-${e[1]}`, value: edgeLabel(state, e), role: marks.edgeAt?.[k] ?? 'default' })),
  };
  return {
    kind: 'panels',
    panels: [
      { label: state.directed ? 'Directed graph' : 'Undirected graph', view: graph },
      { label: 'Adjacency matrix: row u, column v is 1 when there is an edge u → v', view: matrix },
      { label: 'Adjacency list: each node’s neighbours', view: lists },
      { label: 'Edge list', view: edgeList },
    ],
  };
}

const valid = (x: number) => Number.isInteger(x) && x >= 0 && x < NODES;
const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

function refuse(state: GraphRepsState, title: string, why: string, codeLine: number) {
  return { steps: [{ title, why, codeLine, view: view(state) }], state };
}

function checkNodes(state: GraphRepsState, ...ids: number[]) {
  const bad = ids.find((x) => !valid(x));
  return bad === undefined ? undefined : refuse(state, `${bad} is not a node`, `The nodes are numbered 0 to ${NODES - 1}.`, LINE.setup);
}

/** One step per representation for an edge being added or removed. */
function changeSteps(state: GraphRepsState, next: GraphRepsState, u: number, v: number, adding: boolean): Step[] {
  const after = adding ? next : state;
  const list = adjacency(after);
  const pos = (a: number, b: number) => list[a]!.indexOf(b);
  const role: Role = adding ? 'found' : 'discarded';
  const at = after.edges.findIndex((e) => matches(after, e, u, v));
  const shown = adding ? next : state;
  const edgeKey = `${after.edges[at]![0]},${after.edges[at]![1]}`;
  const both = !state.directed;
  return [
    {
      title: `Matrix: set row ${u}, column ${v} to ${adding ? 1 : 0}${both ? ` (and row ${v}, column ${u})` : ''}`,
      why: `The matrix has a cell for every possible edge, so ${adding ? 'adding' : 'removing'} one is a single write: O(1).${both ? ' An undirected edge is stored in both directions, so the matrix stays symmetric.' : ''}`,
      codeLine: adding ? LINE.addMatrix : LINE.removeMatrix,
      variables: { u, v, cost: both ? 2 : 1 },
      view: view(shown, { cells: { [`${u},${v}`]: role, ...(both && { [`${v},${u}`]: role }) }, graphEdges: { [edgeKey]: role }, nodes: { [u]: 'active', [v]: 'active' } }),
    },
    {
      title: `List: ${adding ? `append ${v} to ${u}'s list` : `remove ${v} from ${u}'s list`}${both ? ` (and ${u} ${adding ? 'to' : 'from'} ${v}'s)` : ''}`,
      why: adding ? 'Appending to a list is O(1).' : `The entry must be found first, which means reading ${u}'s list: O(degree of ${u}).`,
      codeLine: adding ? LINE.addList : LINE.removeList,
      variables: { u, v, cost: adding ? 1 : pos(u, v) + 1 },
      view: view(shown, { entries: { [`${u},${pos(u, v)}`]: role, ...(both && { [`${v},${pos(v, u)}`]: role }) }, graphEdges: { [edgeKey]: role }, nodes: { [u]: 'active', [v]: 'active' } }),
    },
    {
      title: `Edge list: ${adding ? `append ${edgeLabel(state, [u, v])}` : `remove ${edgeLabel(state, state.edges[at]!)}`}`,
      why: adding ? 'Appending one pair is O(1). This is the most compact form: one entry per edge, nothing more.' : `The pair has to be found by scanning the list: ${at + 1} of ${state.edges.length} entries read, O(E).`,
      codeLine: adding ? LINE.addEdges : LINE.removeEdges,
      variables: { u, v, cost: adding ? 1 : at + 1 },
      view: view(next, adding ? { edgeAt: { [at]: role }, graphEdges: { [edgeKey]: role } } : {}),
    },
  ];
}

export const graphRepsStructure: StructureDef<GraphRepsState> = {
  initial: { directed: false, edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]] },
  view: (state) => view(state),
  code,
  ops: [
    {
      id: 'has',
      label: 'Has edge?',
      args: [
        { name: 'u', label: 'u', sample: 0 },
        { name: 'v', label: 'v', sample: 4 },
      ],
      run(state, [u = 0, v = 0]) {
        const bad = checkNodes(state, u, v);
        if (bad) return bad;
        const list = adjacency(state);
        const yes = state.edges.some((e) => matches(state, e, u, v));
        const answer = yes ? 'yes' : 'no';
        const k = list[u]!.indexOf(v);
        const listCost = k >= 0 ? k + 1 : list[u]!.length;
        const at = state.edges.findIndex((e) => matches(state, e, u, v));
        const edgeCost = at >= 0 ? at + 1 : state.edges.length;
        const seen = (n: number, hit: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, i === hit ? 'found' : 'visited'])) as Record<number, Role>;
        const steps: Step[] = [
          {
            title: `Matrix: row ${u}, column ${v} is ${yes ? 1 : 0}, so ${answer}`,
            why: 'One cell answers the question directly: O(1), however big the graph is.',
            codeLine: LINE.hasMatrix,
            variables: { u, v, cost: 1 },
            view: view(state, { cells: { [`${u},${v}`]: yes ? 'found' : 'compare' }, nodes: { [u]: 'active', [v]: 'active' } }),
          },
          {
            title: `List: ${u}'s neighbours ${yes ? `include ${v}` : `do not include ${v}`}, so ${answer}`,
            why: `Read ${u}'s list until ${v} turns up or the list ends: ${entries(listCost)}. The cost is the degree of ${u}, usually small.`,
            codeLine: LINE.hasList,
            variables: { u, v, cost: listCost },
            view: view(state, { entries: Object.fromEntries(Object.entries(seen(listCost, k)).map(([i, r]) => [`${u},${i}`, r])), nodes: { [u]: 'active', [v]: 'active' } }),
          },
          {
            title: `Edge list: ${yes ? `found ${edgeLabel(state, state.edges[at]!)}` : 'no matching pair'}, so ${answer}`,
            why: `There is no index to jump to, so scan the pairs: ${entries(edgeCost)} of ${state.edges.length}. That is O(E), the slowest of the three for this question.`,
            codeLine: LINE.hasEdges,
            variables: { u, v, cost: edgeCost },
            view: view(state, { edgeAt: seen(edgeCost, at), nodes: { [u]: 'active', [v]: 'active' } }),
          },
        ];
        return { steps, state };
      },
    },
    {
      id: 'neighbours',
      label: 'Neighbours',
      args: [{ name: 'u', label: 'u', sample: 4 }],
      run(state, [u = 0]) {
        const bad = checkNodes(state, u);
        if (bad) return bad;
        const list = adjacency(state)[u]!;
        const names = list.length > 0 ? list.join(', ') : 'none';
        const outgoing = state.edges.map((e, k) => [e, k] as const).filter(([[a, b]]) => a === u || (!state.directed && b === u));
        const nodes = { [u]: 'active' as Role, ...Object.fromEntries(list.map((x) => [x, 'found' as Role])) };
        const steps: Step[] = [
          {
            title: `Matrix: read row ${u}: ${names}`,
            why: `Every cell of the row must be read, including the zeros: ${NODES} cells, O(n), even if ${u} has few neighbours.`,
            codeLine: LINE.nMatrix,
            variables: { u, cost: NODES },
            view: view(state, { cells: Object.fromEntries(Array.from({ length: NODES }, (_, c) => [`${u},${c}`, list.includes(c) ? 'found' : 'visited'])), nodes }),
          },
          {
            title: `List: ${u}'s list is ${names}`,
            why: `The list holds exactly the neighbours: ${entries(list.length)}, O(degree). This is why most graph algorithms use adjacency lists.`,
            codeLine: LINE.nList,
            variables: { u, cost: list.length },
            view: view(state, { entries: Object.fromEntries(list.map((_, k) => [`${u},${k}`, 'found'])), nodes }),
          },
          {
            title: `Edge list: scan every pair for ${u}: ${names}`,
            why: `Any pair might involve ${u}, so all ${state.edges.length} must be read: O(E).`,
            codeLine: LINE.nEdges,
            variables: { u, cost: state.edges.length },
            view: view(state, { edgeAt: Object.fromEntries(state.edges.map((_, k) => [k, outgoing.some(([, j]) => j === k) ? 'found' : 'visited'])), nodes }),
          },
        ];
        return { steps, state };
      },
    },
    {
      id: 'add',
      label: 'Add edge',
      args: [
        { name: 'u', label: 'u', sample: 3 },
        { name: 'v', label: 'v', sample: 5 },
      ],
      run(state, [u = 0, v = 0]) {
        const bad = checkNodes(state, u, v);
        if (bad) return bad;
        if (u === v) return refuse(state, 'No self-loops here', `An edge from ${u} to itself is allowed in some graphs, but this lesson leaves them out.`, LINE.addEdges);
        if (state.edges.some((e) => matches(state, e, u, v))) return refuse(state, `The edge ${edgeLabel(state, [u, v])} already exists`, 'Each edge is stored once.', LINE.addEdges);
        const next: GraphRepsState = { ...state, edges: [...state.edges, [u, v]] };
        return { steps: changeSteps(state, next, u, v, true), state: next };
      },
    },
    {
      id: 'remove',
      label: 'Remove edge',
      args: [
        { name: 'u', label: 'u', sample: 1 },
        { name: 'v', label: 'v', sample: 2 },
      ],
      run(state, [u = 0, v = 0]) {
        const bad = checkNodes(state, u, v);
        if (bad) return bad;
        if (!state.edges.some((e) => matches(state, e, u, v))) return refuse(state, `There is no edge ${edgeLabel(state, [u, v])}`, 'Only an existing edge can be removed.', LINE.removeEdges);
        const next: GraphRepsState = { ...state, edges: state.edges.filter((e) => !matches(state, e, u, v)) };
        return { steps: changeSteps(state, next, u, v, false), state: next };
      },
    },
    {
      id: 'toggle',
      label: 'Toggle directed',
      args: [],
      run(state) {
        if (state.directed) {
          const kept: [number, number][] = [];
          for (const [u, v] of state.edges) if (!kept.some(([a, b]) => (a === u && b === v) || (a === v && b === u))) kept.push([u, v]);
          const next = { directed: false, edges: kept };
          const merged = state.edges.length - kept.length;
          return {
            steps: [{
              title: 'The graph is now undirected',
              why: `Every edge now works both ways, so the matrix becomes symmetric and each edge appears in both nodes' lists.${merged > 0 ? ` ${merged} pair${merged === 1 ? '' : 's'} of opposite edges became a single edge.` : ''}`,
              codeLine: LINE.addMatrix,
              view: view(next),
            }],
            state: next,
          };
        }
        const next = { directed: true, edges: state.edges };
        return {
          steps: [{
            title: 'The graph is now directed',
            why: 'Each edge now points one way, from the first node of its pair to the second. Row u of the matrix and u\'s list now hold only edges leaving u.',
            codeLine: LINE.addMatrix,
            view: view(next),
          }],
          state: next,
        };
      },
    },
  ],
};
