import { edgeKey, graphView, hasNode, labelOf, neighbours } from '../algorithms/graph/view';
import type { Graph } from '../types/lesson';
import type { Role, Step } from '../types/visualization';

export const adjacencyCode = `class Graph {
  private adjacency = new Map<string, string[]>();

  addNode(node: string): void {
    this.adjacency.set(node, []);
  }

  addEdge(from: string, to: string): void {
    this.adjacency.get(from)!.push(to);
    this.adjacency.get(to)!.push(from); // undirected: store both directions
  }

  neighbours(node: string): string[] {
    return this.adjacency.get(node) ?? [];
  }
}`;

/** Builds the adjacency list edge by edge, then looks up the neighbours of `start`. */
export function adjacencySteps(g: Graph, start: string): Step[] {
  const name = (id: string) => labelOf(g, id);
  const lists: Record<string, string[]> = Object.fromEntries(g.nodes.map((n) => [n.id, []]));
  const edgeRoles: Record<string, Role> = Object.fromEntries(
    g.edges.map((e) => [edgeKey(e.from, e.to), 'discarded' as Role]),
  );

  const view = (nodeRoles: Record<string, Role> = {}) =>
    graphView(g, nodeRoles, { ...edgeRoles }, {
      table: {
        columns: ['Neighbours'],
        rows: Object.fromEntries(
          g.nodes.map((n) => [n.label, [[...lists[n.id]!].sort().map(name).join(', ') || '—']]),
        ),
      },
    });

  const steps: Step[] = [
    {
      title: `Add ${g.nodes.length} nodes`,
      why: 'A graph is a set of nodes plus the connections between them. Each node starts with an empty list of neighbours.',
      next: 'Add the edges one at a time.',
      codeLine: 5,
      view: view(),
    },
  ];

  for (const edge of g.edges) {
    const key = edgeKey(edge.from, edge.to);
    lists[edge.from]!.push(edge.to);
    if (!g.directed) lists[edge.to]!.push(edge.from);
    edgeRoles[key] = 'found';
    const weight = edge.weight !== undefined ? ` with weight ${edge.weight}` : '';
    steps.push({
      title: `Add edge ${name(edge.from)} ${g.directed ? '→' : '—'} ${name(edge.to)}${weight}`,
      why: g.directed
        ? `This edge only goes one way, so only the highlighted line runs: ${name(edge.to)} joins the list of ${name(edge.from)}. The line after it is for undirected graphs.`
        : `The edge works in both directions, so each node is added to the other's list.`,
      codeLine: g.directed ? 9 : 10,
      variables: { from: name(edge.from), to: name(edge.to) },
      view: view({ [edge.from]: 'active', [edge.to]: 'active' }),
    });
    edgeRoles[key] = 'default';
  }

  if (hasNode(g, start)) {
    const next = neighbours(g, start);
    const roles: Record<string, Role> = { [start]: 'active' };
    for (const n of next) {
      roles[n.id] = 'frontier';
      edgeRoles[edgeKey(start, n.id)] = 'found';
    }
    steps.push({
      title: `Look up the neighbours of ${name(start)}`,
      why:
        next.length > 0
          ? `Its list holds ${next.map((n) => name(n.id)).join(', ')}. Reading a list is all that traversal algorithms like BFS and DFS need.`
          : `Its list is empty: no edge leaves ${name(start)}.`,
      codeLine: 14,
      variables: { node: name(start), neighbours: next.map((n) => name(n.id)).join(', ') || '—' },
      view: view(roles),
    });
  }
  return steps;
}
