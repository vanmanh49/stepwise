import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf, unknownStart } from './view';

export const bellmanFordCode = `function bellmanFord(graph: Graph, start: string) {
  const dist: Record<string, number> = {};
  for (const node of graph.nodes) dist[node] = Infinity;
  dist[start] = 0;

  for (let pass = 1; pass < graph.nodes.length; pass++) {
    let changed = false;
    for (const { from, to, weight } of graph.edges) {
      if (dist[from] + weight < dist[to]) {
        dist[to] = dist[from] + weight; // relax the edge
        changed = true;
      }
    }
    if (!changed) break; // nothing improved: done early
  }

  for (const { from, to, weight } of graph.edges) {
    if (dist[from] + weight < dist[to]) return { dist, negativeCycle: true };
  }
  return { dist, negativeCycle: false };
}`;

interface Edge {
  from: string;
  to: string;
  weight: number;
}

/** Every edge as a directed edge; an undirected edge counts in both directions. */
function directedEdges(g: Graph): Edge[] {
  return g.edges.flatMap((e) => {
    const weight = e.weight ?? 1;
    const forward = { from: e.from, to: e.to, weight };
    return g.directed ? [forward] : [forward, { from: e.to, to: e.from, weight }];
  });
}

const show = (d: number) => (d === Infinity ? '∞' : String(d));

export function bellmanFord(g: Graph, start: string): { dist: Record<string, number>; negativeCycle: boolean } {
  const dist: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n.id, Infinity]));
  if (!hasNode(g, start)) return { dist, negativeCycle: false };
  dist[start] = 0;
  const edges = directedEdges(g);

  for (let pass = 1; pass < g.nodes.length; pass++) {
    let changed = false;
    for (const { from, to, weight } of edges) {
      if (dist[from]! + weight < dist[to]!) {
        dist[to] = dist[from]! + weight;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const negativeCycle = edges.some(({ from, to, weight }) => dist[from]! + weight < dist[to]!);
  return { dist, negativeCycle };
}

export function bellmanFordSteps(g: Graph, start: string): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);

  const name = (id: string) => labelOf(g, id);
  const edges = directedEdges(g);
  const dist: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n.id, Infinity]));
  dist[start] = 0;
  const parent: Record<string, string> = {};
  const roles: Record<string, Role> = { [start]: 'active' };
  const treeEdges: Record<string, Role> = {};

  const view = (extraNodes: Record<string, Role> = {}, extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...roles, ...extraNodes },
      { ...treeEdges, ...extraEdges },
      {
        badges: Object.fromEntries(g.nodes.map((n) => [n.id, show(dist[n.id]!)])),
        table: {
          columns: ['Distance', 'Parent'],
          rows: Object.fromEntries(
            g.nodes.map((n) => [n.label, [show(dist[n.id]!), parent[n.id] ? name(parent[n.id]!) : '—']]),
          ),
        },
      },
    );

  const maxPasses = g.nodes.length - 1;
  const steps: Step[] = [
    {
      title: `Set the distance to ${name(start)} to 0`,
      why: 'Every other node starts at ∞, meaning "no path found yet". Bellman-Ford then improves these estimates by checking every edge, over and over.',
      next: g.directed
        ? `Run up to ${maxPasses} pass${maxPasses === 1 ? '' : 'es'} over all ${edges.length} edges.`
        : `Run up to ${maxPasses} pass${maxPasses === 1 ? '' : 'es'} over the ${g.edges.length} edges, each in both directions.`,
      codeLine: 4,
      view: view(),
    },
  ];

  let settled = false;
  for (let pass = 1; pass <= maxPasses; pass++) {
    let improved = 0;
    for (const { from, to, weight } of edges) {
      const candidate = dist[from]! + weight;
      if (!(candidate < dist[to]!)) continue;
      const before = dist[to]!;
      if (parent[to]) delete treeEdges[edgeKey(parent[to]!, to)];
      dist[to] = candidate;
      parent[to] = from;
      treeEdges[edgeKey(from, to)] = 'found';
      roles[to] = 'visited';
      improved++;
      steps.push({
        title: `Pass ${pass}: relax ${name(from)} → ${name(to)} (weight ${weight})`,
        why: `${dist[from]} + ${weight < 0 ? `(${weight})` : weight} = ${candidate}, which is less than ${show(before)}. Going through ${name(from)} is a shorter way to reach ${name(to)}.`,
        codeLine: 10,
        variables: { pass, from: name(from), to: name(to), 'dist[to]': candidate },
        view: view({ [from]: 'active', [to]: 'frontier' }),
      });
    }

    if (improved === 0) {
      settled = true;
      steps.push({
        title: `Pass ${pass}: nothing changed`,
        why: 'A whole pass without an improvement means no edge can shorten any path, so further passes would also change nothing.',
        next: 'Stop early.',
        codeLine: 14,
        variables: { pass, improved },
        view: view(),
      });
      break;
    }
    steps.push({
      title: `Pass ${pass} is done: ${improved} distance${improved === 1 ? '' : 's'} improved`,
      why: `After pass ${pass}, every shortest path that uses at most ${pass} edge${pass === 1 ? '' : 's'} is correct. A shortest path never needs more than ${maxPasses} edges, which is why ${maxPasses} pass${maxPasses === 1 ? ' is' : 'es are'} enough.`,
      codeLine: 13,
      variables: { pass, improved },
      view: view(),
    });
  }

  const offending = settled ? undefined : edges.find(({ from, to, weight }) => dist[from]! + weight < dist[to]!);
  if (offending) {
    steps.push({
      title: 'Negative cycle detected',
      why: `After ${maxPasses} passes every distance should be final, yet ${name(offending.from)} → ${name(offending.to)} can still lower one. That is only possible if a loop has a negative total, so going round it again always gets cheaper and no shortest path exists.`,
      codeLine: 18,
      variables: { from: name(offending.from), to: name(offending.to) },
      view: view({}, { [edgeKey(offending.from, offending.to)]: 'swap' }),
    });
    return steps;
  }

  const unreached = g.nodes.filter((n) => dist[n.id] === Infinity).map((n) => n.label);
  steps.push({
    title: 'All shortest distances are known',
    why:
      (settled
        ? 'A whole pass changed nothing, so the final check over every edge also finds nothing to improve: there is no negative cycle.'
        : 'One more check over every edge found nothing to improve, so there is no negative cycle.') +
      (unreached.length > 0 ? ` ${unreached.join(', ')} cannot be reached from ${name(start)}.` : ''),
    codeLine: 20,
    view: view(),
  });
  return steps;
}
