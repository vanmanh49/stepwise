import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf } from './view';

export const networkFlowCode = `function maxFlow(graph: Graph): number {
  const flow = zeroFlow(graph); // flow on every edge starts at 0
  let total = 0;
  while (true) {
    const path = bfsPath(graph, flow, 'S', 'T'); // fewest edges with spare capacity
    if (!path) return total; // no augmenting path: the flow is maximum
    const bottleneck = Math.min(...path.map((step) => spare(step, flow)));
    for (const step of path) push(step, bottleneck, flow); // forward adds, backward cancels
    total += bottleneck;
  }
}`;

const LINE = { init: 2, path: 5, done: 6, bottleneck: 7, push: 8 };
const SOURCE = 'S';
const SINK = 'T';

/** One hop of an augmenting path: along an edge, or backwards against one to cancel its flow. */
interface Hop {
  from: string;
  to: string;
  spare: number;
  backward: boolean;
}

type Flow = Record<string, number>;

function capacity(g: Graph, from: string, to: string): number {
  return g.edges.filter((e) => e.from === from && e.to === to).reduce((sum, e) => sum + (e.weight ?? 1), 0);
}

function hops(g: Graph, flow: Flow, id: string): Hop[] {
  const result: Hop[] = [];
  for (const e of g.edges) {
    const f = flow[edgeKey(e.from, e.to)]!;
    if (e.from === id && capacity(g, e.from, e.to) - f > 0) result.push({ from: id, to: e.to, spare: capacity(g, e.from, e.to) - f, backward: false });
    if (e.to === id && f > 0) result.push({ from: id, to: e.from, spare: f, backward: true });
  }
  // Forward hops first, then by node id, so every run takes the same path.
  return result.toSorted((a, b) => Number(a.backward) - Number(b.backward) || a.to.localeCompare(b.to));
}

/** Breadth-first search for the augmenting path with the fewest edges. */
function bfsPath(g: Graph, flow: Flow): Hop[] | null {
  const via: Record<string, Hop> = {};
  const seen = new Set([SOURCE]);
  const queue = [SOURCE];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const hop of hops(g, flow, id)) {
      if (seen.has(hop.to)) continue;
      seen.add(hop.to);
      via[hop.to] = hop;
      if (hop.to === SINK) {
        const path: Hop[] = [];
        for (let at = SINK; at !== SOURCE; at = via[at]!.from) path.unshift(via[at]!);
        return path;
      }
      queue.push(hop.to);
    }
  }
  return null;
}

function reachable(g: Graph, flow: Flow): Set<string> {
  const seen = new Set([SOURCE]);
  const queue = [SOURCE];
  while (queue.length > 0) {
    for (const hop of hops(g, flow, queue.shift()!)) {
      if (!seen.has(hop.to)) {
        seen.add(hop.to);
        queue.push(hop.to);
      }
    }
  }
  return seen;
}

function push(flow: Flow, hop: Hop, amount: number): void {
  if (hop.backward) flow[edgeKey(hop.to, hop.from)]! -= amount;
  else flow[edgeKey(hop.from, hop.to)]! += amount;
}

const zeroFlow = (g: Graph): Flow => Object.fromEntries(g.edges.map((e) => [edgeKey(e.from, e.to), 0]));

export function maxFlow(g: Graph): number {
  if (!hasNode(g, SOURCE) || !hasNode(g, SINK)) return 0;
  const flow = zeroFlow(g);
  let total = 0;
  for (let path = bfsPath(g, flow); path; path = bfsPath(g, flow)) {
    const bottleneck = Math.min(...path.map((h) => h.spare));
    for (const hop of path) push(flow, hop, bottleneck);
    total += bottleneck;
  }
  return total;
}

export function networkFlowSteps(g: Graph, _start?: string): Step[] {
  if (!hasNode(g, SOURCE) || !hasNode(g, SINK)) {
    return [
      {
        title: 'This graph has no source S and sink T',
        why: 'A flow network needs a node S where flow starts and a node T where it ends. Pick the flow network example.',
        codeLine: 1,
        view: graphView(g),
      },
    ];
  }

  const name = (id: string) => labelOf(g, id);
  const flow = zeroFlow(g);
  let total = 0;
  const view = (nodeRoles: Record<string, Role> = {}, extraEdges: Record<string, Role> = {}) => {
    const saturated = Object.fromEntries(
      g.edges.filter((e) => flow[edgeKey(e.from, e.to)] === capacity(g, e.from, e.to)).map((e) => [edgeKey(e.from, e.to), 'discarded' as Role]),
    );
    return graphView(g, { [SOURCE]: 'pivot', [SINK]: 'pivot', ...nodeRoles }, { ...saturated, ...extraEdges }, {
      edgeLabels: Object.fromEntries(g.edges.map((e) => [edgeKey(e.from, e.to), `${flow[edgeKey(e.from, e.to)]}/${e.weight ?? 1}`])),
    });
  };

  const steps: Step[] = [
    {
      title: 'Start with no flow',
      why: 'Each edge shows flow/capacity. Flow leaves S and must arrive at T, and every other node passes on exactly what it receives. Edmonds-Karp keeps finding a path with spare capacity and pushes more flow along it.',
      next: 'Search for the path from S to T with the fewest edges that still has room.',
      codeLine: LINE.init,
      variables: { 'total flow': 0 },
      view: view(),
    },
  ];

  for (let path = bfsPath(g, flow); path; path = bfsPath(g, flow)) {
    const bottleneck = Math.min(...path.map((h) => h.spare));
    const pathNodes = Object.fromEntries(path.map((h) => [h.to, 'active' as Role]));
    const pathEdges = Object.fromEntries(path.map((h) => [h.backward ? edgeKey(h.to, h.from) : edgeKey(h.from, h.to), (h.backward ? 'compare' : 'active') as Role]));
    const route = [SOURCE, ...path.map((h) => h.to)].map(name).join(' → ');
    const backward = path.filter((h) => h.backward);
    steps.push({
      title: `Augmenting path ${route}`,
      why: `Breadth-first search found this path with the fewest edges where every hop has spare room: ${path
        .map((h) => `${name(h.from)}→${name(h.to)} ${h.spare}`)
        .join(', ')}. ${
        backward.length > 0
          ? `${backward.map((h) => `${name(h.from)}→${name(h.to)}`).join(' and ')} runs against an edge: it cancels flow sent earlier, rerouting it.`
          : ''
      }`.trim(),
      codeLine: LINE.path,
      variables: { bottleneck },
      view: view(pathNodes, pathEdges),
    });
    for (const hop of path) push(flow, hop, bottleneck);
    total += bottleneck;
    steps.push({
      title: `Push ${bottleneck} more along it`,
      why: `The smallest spare capacity on the path, ${bottleneck}, is the most it can carry. Every edge on it gains ${bottleneck} (or loses ${bottleneck} where the path cancels flow). Total flow is now ${total}.`,
      codeLine: LINE.push,
      variables: { bottleneck, 'total flow': total },
      view: view(pathNodes),
    });
  }

  const side = reachable(g, flow);
  steps.push({
    title: `Maximum flow: ${total}`,
    why: `There is no augmenting path left: from S, spare capacity reaches only ${[...side].map(name).join(', ')}, never T. The full edges leaving that group form a cut of capacity ${total}, so no flow can be larger.`,
    codeLine: LINE.done,
    variables: { 'total flow': total },
    view: view(Object.fromEntries([...side].map((id) => [id, 'visited' as Role]))),
  });
  return steps;
}
