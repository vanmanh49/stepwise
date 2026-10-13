import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { sortedEdges, type SpanningTree, type WeightedEdge } from './kruskal';
import { edgeKey, graphView, hasNode, labelOf, unknownStart } from './view';

export const primCode = `function prim(graph: Graph, start: string): Edge[] {
  const inTree = new Set([start]);
  const tree: Edge[] = [];
  while (true) {
    let best: Edge | null = null;
    for (const edge of graph.edges) {
      const crosses = inTree.has(edge.from) !== inTree.has(edge.to);
      if (crosses && (!best || edge.weight < best.weight)) best = edge;
    }
    if (!best) return tree; // no edge leaves the tree
    tree.push(best);
    inTree.add(best.from).add(best.to);
  }
}`;

/** Edges with exactly one end inside the tree, cheapest first. */
function crossing(edges: WeightedEdge[], inTree: Set<string>): WeightedEdge[] {
  return edges.filter((e) => inTree.has(e.from) !== inTree.has(e.to));
}

const total = (edges: WeightedEdge[]) => edges.reduce((sum, e) => sum + e.weight, 0);

/** Minimum spanning tree of the start node's connected part. Direction is ignored. */
export function prim(g: Graph, start: string): SpanningTree {
  if (!hasNode(g, start)) return { edges: [], weight: 0 };
  const all = sortedEdges(g);
  const inTree = new Set([start]);
  const edges: WeightedEdge[] = [];
  for (;;) {
    const best = crossing(all, inTree)[0];
    if (!best) break;
    edges.push(best);
    inTree.add(best.from).add(best.to);
  }
  return { edges, weight: total(edges) };
}

export function primSteps(g: Graph, start: string): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);

  const name = (id: string) => labelOf(g, id);
  const describe = (e: WeightedEdge) => `${name(e.from)}–${name(e.to)}`;
  const all = sortedEdges(g);
  const inTree = new Set([start]);
  const tree: WeightedEdge[] = [];
  const nodeRoles: Record<string, Role> = { [start]: 'visited' };
  const edgeRoles: Record<string, Role> = {};

  const view = (extraNodes: Record<string, Role> = {}, extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...nodeRoles, ...extraNodes },
      { ...edgeRoles, ...extraEdges },
      {
        frontier: {
          label: 'Edges leaving the tree',
          items: crossing(all, inTree).map((e) => `${describe(e)} (${e.weight})`),
        },
      },
    );
  const variables = () => ({ nodes: inTree.size, edges: tree.length, weight: total(tree) });

  const steps: Step[] = [
    {
      title: `Start the tree at ${name(start)}`,
      why:
        'Prim grows one tree outward from a starting node. At every step it adds the cheapest edge that reaches a node the tree does not have yet.' +
        (g.directed ? ' The arrows are ignored: a spanning tree is defined for undirected connections.' : ''),
      codeLine: 2,
      variables: variables(),
      view: view(),
    },
  ];

  for (;;) {
    const candidates = crossing(all, inTree);
    const best = candidates[0];
    if (!best) break;
    const newNode = inTree.has(best.from) ? best.to : best.from;
    const candidateRoles = Object.fromEntries(candidates.map((e) => [edgeKey(e.from, e.to), 'compare' as Role]));

    steps.push({
      title: `${candidates.length} edge${candidates.length === 1 ? '' : 's'} leave the tree; the cheapest is ${describe(best)} (${best.weight})`,
      why: 'Only edges with one end inside the tree and one end outside can extend it. An edge between two tree nodes would close a loop.',
      next: `Add ${describe(best)}, bringing ${name(newNode)} into the tree.`,
      codeLine: 8,
      variables: variables(),
      view: view({}, candidateRoles),
    });

    tree.push(best);
    inTree.add(newNode);
    nodeRoles[newNode] = 'visited';
    edgeRoles[edgeKey(best.from, best.to)] = 'found';
    steps.push({
      title: `Add ${describe(best)}: ${name(newNode)} joins the tree`,
      why: `Some edge has to connect the tree to the rest of the graph, and ${describe(best)} is the cheapest one that does, so it is safe to keep.`,
      codeLine: 11,
      variables: variables(),
      view: view({ [newNode]: 'active' }),
    });
  }

  const missing = g.nodes.filter((n) => !inTree.has(n.id)).map((n) => n.label);
  steps.push({
    title: `The spanning tree has total weight ${total(tree)}`,
    why:
      missing.length > 0
        ? `No edge leaves the tree any more, but ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} never reached: the graph is not connected. Prim only spans the part that contains the start node.`
        : `${tree.length} edges connect all ${g.nodes.length} nodes, and no cheaper set of edges can. Kruskal's algorithm reaches the same total by a different route.`,
    codeLine: 10,
    variables: variables(),
    view: view(),
  });
  return steps;
}
