import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, labelOf } from './view';

export const topologicalSortCode = `function topologicalSort(graph: Graph): string[] | null {
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) inDegree.set(node, 0);
  for (const { to } of graph.edges) inDegree.set(to, inDegree.get(to)! + 1);

  const ready = graph.nodes.filter((node) => inDegree.get(node) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of graph.neighbours(node)) {
      inDegree.set(next, inDegree.get(next)! - 1);
      if (inDegree.get(next) === 0) ready.push(next);
    }
  }
  return order.length === graph.nodes.length ? order : null; // null: cycle
}`;

// Edges are always read as from → to here: a dependency has a direction even if the graph is drawn without arrows.
const sortedIds = (g: Graph) => g.nodes.map((n) => n.id).toSorted((a, b) => a.localeCompare(b));
const outgoing = (g: Graph, id: string) =>
  g.edges
    .filter((e) => e.from === id)
    .map((e) => e.to)
    .toSorted((a, b) => a.localeCompare(b));

function inDegrees(g: Graph): Record<string, number> {
  const degree: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n.id, 0]));
  for (const edge of g.edges) degree[edge.to] = (degree[edge.to] ?? 0) + 1;
  return degree;
}

/** Kahn's algorithm. Returns null when the graph has a cycle, because then no valid order exists. */
export function topologicalSort(g: Graph): string[] | null {
  const degree = inDegrees(g);
  const ready = sortedIds(g).filter((id) => degree[id] === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of outgoing(g, node)) {
      degree[next]!--;
      if (degree[next] === 0) ready.push(next);
    }
  }
  return order.length === g.nodes.length ? order : null;
}

/** `start` is ignored: the algorithm begins with every node that has no prerequisites. */
export function topologicalSortSteps(g: Graph, _start: string): Step[] {
  const name = (id: string) => labelOf(g, id);
  const degree = inDegrees(g);
  const roles: Record<string, Role> = {};
  const edges: Record<string, Role> = {};
  const ready: string[] = [];
  const order: string[] = [];

  const view = (extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...roles },
      { ...edges, ...extraEdges },
      {
        frontier: { label: 'Ready', items: ready.map(name) },
        table: {
          columns: ['In-degree'],
          rows: Object.fromEntries(g.nodes.map((n) => [n.label, [order.includes(n.id) ? '—' : String(degree[n.id])]])),
        },
      },
    );
  const variables = () => ({ order: order.map(name).join(' → ') || '—' });

  const steps: Step[] = [
    {
      title: 'Count the arrows pointing at each node',
      why: 'An arrow A → B means A must come before B. The in-degree of a node is how many prerequisites it is still waiting for.',
      next: 'Find the nodes that are waiting for nothing.',
      codeLine: 4,
      variables: variables(),
      view: view(),
    },
  ];

  for (const id of sortedIds(g)) {
    if (degree[id] === 0) {
      ready.push(id);
      roles[id] = 'frontier';
    }
  }
  steps.push({
    title:
      ready.length > 0
        ? `${ready.map(name).join(', ')} ${ready.length === 1 ? 'has' : 'have'} no prerequisites`
        : 'Every node is waiting for another node',
    why:
      ready.length > 0
        ? 'A node with in-degree 0 depends on nothing, so it is safe to place next in the order.'
        : 'With no node free to start, the dependencies must go round in a circle.',
    codeLine: 6,
    variables: variables(),
    view: view(),
  });

  while (ready.length > 0) {
    const node = ready.shift()!;
    order.push(node);
    roles[node] = 'active';
    steps.push({
      title: `Take ${name(node)} and add it to the order`,
      why: `Everything ${name(node)} depends on has already been placed, so it can come next.`,
      next: outgoing(g, node).length > 0 ? `Tell the nodes that depend on ${name(node)} that it is done.` : undefined,
      codeLine: 10,
      variables: variables(),
      view: view(),
    });

    for (const next of outgoing(g, node)) {
      degree[next]!--;
      const free = degree[next] === 0;
      if (free) {
        ready.push(next);
        roles[next] = 'frontier';
      }
      steps.push({
        title: free
          ? `${name(next)} has no prerequisites left: it is ready`
          : `${name(next)} now waits for ${degree[next]} more`,
        why: free
          ? `${name(node)} was the last thing ${name(next)} was waiting for, so its in-degree drops to 0 and it joins the ready list.`
          : `${name(node)} is done, so one prerequisite of ${name(next)} is satisfied. Its in-degree drops by 1, but it still has others.`,
        codeLine: free ? 13 : 12,
        variables: variables(),
        view: view({ [edgeKey(node, next)]: 'compare' }),
      });
      edges[edgeKey(node, next)] = 'discarded';
    }
    roles[node] = 'visited';
  }

  const left = sortedIds(g).filter((id) => !order.includes(id));
  steps.push(
    left.length === 0
      ? {
          title: 'Every node has been placed',
          why: 'Each node appears after all of its prerequisites. Other valid orders may exist: whenever several nodes were ready at once, any of them could have gone first.',
          codeLine: 16,
          variables: variables(),
          view: view(),
        }
      : {
          title: 'No valid order exists',
          why: `${left.map(name).join(', ')} never reached in-degree 0, because they depend on each other in a cycle. A topological order only exists for a graph without cycles.`,
          codeLine: 16,
          variables: variables(),
          view: view(),
        },
  );
  return steps;
}
