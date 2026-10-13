import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf, neighbours, unknownStart } from './view';

export const bfsCode = `function bfs(graph: Graph, start: string): string[] {
  const visited = new Set([start]);
  const queue = [start];
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of graph.neighbours(node)) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return order;
}`;

export function bfs(g: Graph, start: string): string[] {
  if (!hasNode(g, start)) return [];
  const visited = new Set([start]);
  const queue = [start];
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of neighbours(g, node)) {
      if (!visited.has(next.id)) {
        visited.add(next.id);
        queue.push(next.id);
      }
    }
  }
  return order;
}

export function bfsSteps(g: Graph, start: string): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);

  const name = (id: string) => labelOf(g, id);
  const roles: Record<string, Role> = { [start]: 'frontier' };
  const edges: Record<string, Role> = {};
  const parent: Record<string, string> = {};
  const queue = [start];
  const order: string[] = [];

  const view = (extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...roles },
      { ...edges, ...extraEdges },
      {
        frontier: { label: 'Queue', items: queue.map(name) },
        table: {
          columns: ['Parent'],
          rows: Object.fromEntries(g.nodes.map((n) => [n.label, [parent[n.id] ? name(parent[n.id]!) : '—']])),
        },
      },
    );
  const variables = () => ({ order: order.map(name).join(' → ') || '—' });

  const steps: Step[] = [
    {
      title: `Start at ${name(start)}`,
      why: 'BFS explores in rings: first the start node, then everything one edge away, then two edges away, and so on.',
      next: 'Take the first node out of the queue.',
      codeLine: 3,
      variables: variables(),
      view: view(),
    },
  ];

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    roles[node] = 'active';
    steps.push({
      title: `Take ${name(node)} from the front of the queue`,
      why: 'A queue is first-in, first-out, so the node that has waited longest is explored next. That keeps BFS moving level by level.',
      next: `Look at each neighbour of ${name(node)}.`,
      codeLine: 6,
      variables: variables(),
      view: view(),
    });

    for (const next of neighbours(g, node)) {
      const isNew = roles[next.id] === undefined;
      if (isNew) {
        roles[next.id] = 'frontier';
        parent[next.id] = node;
        edges[edgeKey(node, next.id)] = 'found';
        queue.push(next.id);
      }
      steps.push({
        title: isNew ? `Discover ${name(next.id)}` : `Skip ${name(next.id)}`,
        why: isNew
          ? `${name(next.id)} has not been seen before, so mark it and add it to the back of the queue.`
          : `${name(next.id)} was already discovered. Adding it again would repeat work or loop forever.`,
        codeLine: isNew ? 11 : 9,
        variables: variables(),
        view: view(isNew ? {} : { [edgeKey(node, next.id)]: 'compare' }),
      });
    }
    roles[node] = 'visited';
  }

  const unreached = g.nodes.filter((n) => roles[n.id] === undefined).map((n) => n.label);
  steps.push({
    title: 'The queue is empty',
    why:
      unreached.length > 0
        ? `Every node reachable from ${name(start)} has been visited. ${unreached.join(', ')} cannot be reached from it.`
        : `Every node has been visited, in order of distance from ${name(start)}.`,
    codeLine: 15,
    variables: variables(),
    view: view(),
  });
  return steps;
}
