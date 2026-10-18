import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, labelOf } from './view';

export interface WeightedEdge {
  from: string;
  to: string;
  weight: number;
}

export interface SpanningTree {
  edges: WeightedEdge[];
  weight: number;
}

export const kruskalCode = `function kruskal(graph: Graph): Edge[] {
  const sets = new DisjointSet(graph.nodes);
  const edges = [...graph.edges].sort((a, b) => a.weight - b.weight);
  const tree: Edge[] = [];
  for (const edge of edges) {
    if (sets.find(edge.from) !== sets.find(edge.to)) {
      sets.union(edge.from, edge.to); // joins two groups
      tree.push(edge);
    }
    // otherwise the edge would close a cycle: skip it
  }
  return tree;
}`;

/** Edges cheapest first; ties are broken by node ids so every run is the same. */
export function sortedEdges(g: Graph): WeightedEdge[] {
  return g.edges
    .map((e) => ({ from: e.from, to: e.to, weight: e.weight ?? 1 }))
    .toSorted((a, b) => a.weight - b.weight || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** A minimal disjoint set: each node maps to the smallest node id in its group. */
function makeGroups(g: Graph) {
  const group: Record<string, string> = Object.fromEntries(g.nodes.map((n) => [n.id, n.id]));
  return {
    group,
    find: (id: string) => group[id]!,
    union(a: string, b: string) {
      const [keep, drop] = [group[a]!, group[b]!].toSorted((x, y) => x.localeCompare(y)) as [string, string];
      for (const id of Object.keys(group)) if (group[id] === drop) group[id] = keep;
    },
  };
}

const total = (edges: WeightedEdge[]) => edges.reduce((sum, e) => sum + e.weight, 0);

/** Minimum spanning tree, or a spanning forest when the graph is not connected. Direction is ignored. */
export function kruskal(g: Graph): SpanningTree {
  const sets = makeGroups(g);
  const edges: WeightedEdge[] = [];
  for (const edge of sortedEdges(g)) {
    if (sets.find(edge.from) !== sets.find(edge.to)) {
      sets.union(edge.from, edge.to);
      edges.push(edge);
    }
  }
  return { edges, weight: total(edges) };
}

/** `start` is ignored: Kruskal works on the whole edge list, not from a node. */
export function kruskalSteps(g: Graph, _start: string): Step[] {
  const name = (id: string) => labelOf(g, id);
  const describe = (e: WeightedEdge) => `${name(e.from)}–${name(e.to)}`;
  const sets = makeGroups(g);
  const remaining = sortedEdges(g);
  const tree: WeightedEdge[] = [];
  const nodeRoles: Record<string, Role> = {};
  const edgeRoles: Record<string, Role> = {};

  const view = (extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...nodeRoles },
      { ...edgeRoles, ...extraEdges },
      {
        frontier: { label: 'Edges by weight', items: remaining.map((e) => `${describe(e)} (${e.weight})`) },
        table: { columns: ['Group'], rows: Object.fromEntries(g.nodes.map((n) => [n.label, [name(sets.find(n.id))]])) },
      },
    );
  const variables = () => ({ edges: tree.length, weight: total(tree) });

  const steps: Step[] = [
    {
      title: 'Sort every edge by weight',
      why:
        'A spanning tree connects all nodes with no loops. To make its total weight as small as possible, Kruskal considers the cheapest edges first. Each node starts in a group of its own.' +
        (g.directed ? ' The arrows are ignored: a spanning tree is defined for undirected connections.' : ''),
      next: remaining.length > 0 ? 'Look at the cheapest edge.' : undefined,
      codeLine: 3,
      variables: variables(),
      view: view(),
    },
  ];

  while (remaining.length > 0) {
    const edge = remaining.shift()!;
    const key = edgeKey(edge.from, edge.to);
    const a = sets.find(edge.from);
    const b = sets.find(edge.to);
    if (a !== b) {
      sets.union(edge.from, edge.to);
      tree.push(edge);
      edgeRoles[key] = 'found';
      nodeRoles[edge.from] = 'visited';
      nodeRoles[edge.to] = 'visited';
      steps.push({
        title: `Take ${describe(edge)} (weight ${edge.weight})`,
        why: `${name(edge.from)} is in group ${name(a)} and ${name(edge.to)} is in group ${name(b)}. They are not connected yet, so this edge joins two groups without creating a loop.`,
        codeLine: 7,
        variables: variables(),
        view: view(),
      });
    } else {
      steps.push({
        title: `Skip ${describe(edge)} (weight ${edge.weight})`,
        why: `Both ends are already in group ${name(a)}, so they are connected by cheaper edges. Adding this one would only close a loop.`,
        codeLine: 10,
        variables: variables(),
        view: view({ [key]: 'compare' }),
      });
      edgeRoles[key] = 'discarded';
    }
  }

  const groups = new Set(g.nodes.map((n) => sets.find(n.id))).size;
  steps.push({
    title: `The spanning ${groups > 1 ? 'forest' : 'tree'} has total weight ${total(tree)}`,
    why:
      groups > 1
        ? `The graph is not connected, so no single tree can reach every node. Kruskal produced ${groups} separate trees, one per connected part.`
        : `${tree.length} edges connect all ${g.nodes.length} nodes. A tree always has one edge fewer than it has nodes, and no cheaper set of edges can connect them.`,
    codeLine: 12,
    variables: variables(),
    view: view(),
  });
  return steps;
}
