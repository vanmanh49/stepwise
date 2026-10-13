import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf, neighbours, unknownStart } from './view';

export const dijkstraCode = `function dijkstra(graph: Graph, start: string): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const node of graph.nodes) dist[node] = Infinity;
  dist[start] = 0;
  const unvisited = new Set(graph.nodes);
  while (unvisited.size > 0) {
    const node = closest(unvisited, dist); // smallest known distance
    if (dist[node] === Infinity) break; // the rest is unreachable
    unvisited.delete(node);
    for (const { to, weight } of graph.edges(node)) {
      const candidate = dist[node] + weight;
      if (candidate < dist[to]) {
        dist[to] = candidate; // found a shorter path
      }
    }
  }
  return dist;
}`;

function closest(unvisited: Set<string>, dist: Record<string, number>): string | undefined {
  let best: string | undefined;
  for (const id of unvisited) {
    if (best === undefined || dist[id]! < dist[best]!) best = id;
  }
  return best;
}

const show = (d: number) => (d === Infinity ? '∞' : String(d));

export function dijkstra(g: Graph, start: string): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const node of g.nodes) dist[node.id] = Infinity;
  if (!hasNode(g, start)) return dist;
  dist[start] = 0;
  const unvisited = new Set(g.nodes.map((n) => n.id));
  while (unvisited.size > 0) {
    const node = closest(unvisited, dist)!;
    if (dist[node] === Infinity) break;
    unvisited.delete(node);
    for (const edge of neighbours(g, node)) {
      const candidate = dist[node]! + edge.weight;
      if (candidate < dist[edge.id]!) dist[edge.id] = candidate;
    }
  }
  return dist;
}

export function dijkstraSteps(g: Graph, start: string): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);

  const name = (id: string) => labelOf(g, id);
  const dist: Record<string, number> = {};
  for (const node of g.nodes) dist[node.id] = Infinity;
  dist[start] = 0;
  const unvisited = new Set(g.nodes.map((n) => n.id));
  const roles: Record<string, Role> = { [start]: 'frontier' };
  const edges: Record<string, Role> = {};
  const parent: Record<string, string> = {};

  const view = (extraEdges: Record<string, Role> = {}) => {
    const waiting = [...unvisited].filter((id) => dist[id] !== Infinity).sort((a, b) => dist[a]! - dist[b]!);
    return graphView(
      g,
      { ...roles },
      { ...edges, ...extraEdges },
      {
        badges: Object.fromEntries(g.nodes.map((n) => [n.id, show(dist[n.id]!)])),
        frontier: { label: 'Priority queue', items: waiting.map((id) => `${name(id)} (${dist[id]})`) },
        table: {
          columns: ['Distance', 'Parent'],
          rows: Object.fromEntries(
            g.nodes.map((n) => [n.label, [show(dist[n.id]!), parent[n.id] ? name(parent[n.id]!) : '—']]),
          ),
        },
      },
    );
  };

  const steps: Step[] = [
    {
      title: `Set the distance to ${name(start)} to 0`,
      why: 'The start is 0 away from itself. Every other node starts at ∞, meaning "no path found yet".',
      next: 'Pick the unvisited node with the smallest known distance.',
      codeLine: 4,
      view: view(),
    },
  ];

  while (unvisited.size > 0) {
    const node = closest(unvisited, dist)!;
    if (dist[node] === Infinity) {
      steps.push({
        title: 'The remaining nodes are unreachable',
        why: `No path from ${name(start)} leads to ${[...unvisited].map(name).join(', ')}, so their distance stays ∞.`,
        codeLine: 8,
        view: view(),
      });
      break;
    }
    unvisited.delete(node);
    roles[node] = 'active';
    steps.push({
      title: `Pick ${name(node)}, the closest unvisited node (distance ${dist[node]})`,
      why: `No unvisited node is closer, and edge weights are never negative, so no later path can beat ${dist[node]}. This distance is final.`,
      next: `Check whether going through ${name(node)} shortens the path to its neighbours.`,
      codeLine: 7,
      variables: { node: name(node), 'dist[node]': dist[node]! },
      view: view(),
    });

    for (const edge of neighbours(g, node)) {
      // A finalized neighbour can never improve, so it is not shown.
      if (!unvisited.has(edge.id)) continue;
      const candidate = dist[node]! + edge.weight;
      const current = dist[edge.id]!;
      const better = candidate < current;
      if (better) {
        if (parent[edge.id]) delete edges[edgeKey(parent[edge.id]!, edge.id)];
        dist[edge.id] = candidate;
        parent[edge.id] = node;
        roles[edge.id] = 'frontier';
        edges[edgeKey(node, edge.id)] = 'found';
      }
      steps.push({
        title: `Check ${name(node)} → ${name(edge.id)} (weight ${edge.weight})`,
        why: better
          ? `${dist[node]} + ${edge.weight} = ${candidate}, which is less than ${show(current)}. Going through ${name(node)} is shorter, so update ${name(edge.id)} to ${candidate}.`
          : `${dist[node]} + ${edge.weight} = ${candidate}, which is not less than ${show(current)}. ${name(edge.id)} keeps its current distance.`,
        codeLine: better ? 13 : 12,
        variables: { node: name(node), to: name(edge.id), candidate, 'dist[to]': show(dist[edge.id]!) },
        view: view(better ? {} : { [edgeKey(node, edge.id)]: 'compare' }),
      });
    }
    roles[node] = 'visited';
  }

  steps.push({
    title: 'All shortest distances are known',
    why: `Each badge shows the length of the shortest path from ${name(start)}. Follow the Parent column backwards to read the path itself.`,
    codeLine: 17,
    view: view(),
  });
  return steps;
}
