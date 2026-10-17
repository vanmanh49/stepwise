import type { Graph } from '../../types/lesson';
import type { GraphView, Role, Step } from '../../types/visualization';

export function edgeKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** Nodes reachable in one hop, sorted by id so traversals are deterministic. */
export function neighbours(g: Graph, id: string): { id: string; weight: number }[] {
  const result: { id: string; weight: number }[] = [];
  for (const edge of g.edges) {
    const weight = edge.weight ?? 1;
    if (edge.from === id) result.push({ id: edge.to, weight });
    else if (!g.directed && edge.to === id) result.push({ id: edge.from, weight });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

export function hasNode(g: Graph, id: string): boolean {
  return g.nodes.some((n) => n.id === id);
}

export function labelOf(g: Graph, id: string): string {
  return g.nodes.find((n) => n.id === id)?.label ?? id;
}

export function graphView(
  g: Graph,
  nodeRoles: Record<string, Role> = {},
  edgeRoles: Record<string, Role> = {},
  extra: Pick<GraphView, 'frontier' | 'table'> & {
    badges?: Record<string, string>;
    /** Keyed by edgeKey(from, to). */
    edgeLabels?: Record<string, string>;
  } = {},
): GraphView {
  const { badges, edgeLabels, ...rest } = extra;
  return {
    kind: 'graph',
    directed: g.directed,
    nodes: g.nodes.map((n) => ({
      ...n,
      role: nodeRoles[n.id] ?? 'default',
      ...(badges?.[n.id] !== undefined && { badge: badges[n.id] }),
    })),
    edges: g.edges.map((e) => ({
      ...e,
      ...(edgeLabels?.[edgeKey(e.from, e.to)] !== undefined && { label: edgeLabels[edgeKey(e.from, e.to)] }),
      role:
        edgeRoles[edgeKey(e.from, e.to)] ?? (g.directed ? undefined : edgeRoles[edgeKey(e.to, e.from)]) ?? 'default',
    })),
    ...rest,
  };
}

export function unknownStart(g: Graph, start: string): Step[] {
  return [
    {
      title: 'Choose a start node',
      why: `"${start}" is not a node in this graph, so there is nowhere to begin.`,
      codeLine: 1,
      view: graphView(g),
    },
  ];
}
