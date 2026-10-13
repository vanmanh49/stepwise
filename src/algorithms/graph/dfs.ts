import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf, neighbours, unknownStart } from './view';

export const dfsCode = `function dfs(graph: Graph, node: string, visited = new Set<string>()): string[] {
  visited.add(node);
  const order = [node];
  for (const next of graph.neighbours(node)) {
    if (!visited.has(next)) {
      order.push(...dfs(graph, next, visited));
    }
  }
  return order;
}`;

export function dfs(g: Graph, start: string): string[] {
  if (!hasNode(g, start)) return [];
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (node: string): void => {
    visited.add(node);
    order.push(node);
    for (const next of neighbours(g, node)) {
      if (!visited.has(next.id)) visit(next.id);
    }
  };
  visit(start);
  return order;
}

export function dfsSteps(g: Graph, start: string): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);

  const name = (id: string) => labelOf(g, id);
  const roles: Record<string, Role> = {};
  const edges: Record<string, Role> = {};
  const parent: Record<string, string> = {};
  const stack: string[] = [];
  const order: string[] = [];

  const view = (extraEdges: Record<string, Role> = {}) =>
    graphView(
      g,
      { ...roles },
      { ...edges, ...extraEdges },
      {
        frontier: { label: 'Call stack', items: stack.map(name) },
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
      why: 'DFS follows one path as far as it can, and only backs up when it runs out of unvisited neighbours.',
      next: `Visit ${name(start)}.`,
      codeLine: 1,
      variables: variables(),
      view: view(),
    },
  ];

  const visit = (node: string): void => {
    // The caller is still waiting on the stack while this node is explored.
    const caller = stack.at(-1);
    if (caller !== undefined) roles[caller] = 'frontier';
    stack.push(node);
    order.push(node);
    roles[node] = 'active';
    steps.push({
      title: `Visit ${name(node)}`,
      why: `Mark ${name(node)} as visited right away so no other path comes back to it.`,
      next: `Look at each neighbour of ${name(node)}.`,
      codeLine: 2,
      variables: variables(),
      view: view(),
    });

    for (const next of neighbours(g, node)) {
      const isNew = roles[next.id] === undefined;
      steps.push({
        title: isNew ? `Go deeper to ${name(next.id)}` : `Skip ${name(next.id)}`,
        why: isNew
          ? `${name(next.id)} is unvisited, so DFS follows this edge now, before looking at the other neighbours of ${name(node)}.`
          : `${name(next.id)} is already visited, so this edge leads nowhere new.`,
        codeLine: isNew ? 6 : 5,
        variables: variables(),
        view: view({ [edgeKey(node, next.id)]: 'compare' }),
      });
      if (isNew) {
        parent[next.id] = node;
        edges[edgeKey(node, next.id)] = 'found';
        visit(next.id);
        roles[node] = 'active';
      }
    }

    stack.pop();
    roles[node] = 'visited';
    const back = stack.at(-1);
    if (back !== undefined) roles[back] = 'active';
    steps.push({
      title: back !== undefined ? `Backtrack from ${name(node)} to ${name(back)}` : `Finish ${name(node)}`,
      why: `Every neighbour of ${name(node)} has been handled, so this call returns.`,
      codeLine: 9,
      variables: variables(),
      view: view(),
    });
  };

  visit(start);

  const unreached = g.nodes.filter((n) => roles[n.id] === undefined).map((n) => n.label);
  steps.push({
    title: 'The traversal is complete',
    why:
      unreached.length > 0
        ? `Every node reachable from ${name(start)} has been visited. ${unreached.join(', ')} cannot be reached from it.`
        : 'Every node has been visited and every call has returned.',
    codeLine: 9,
    variables: variables(),
    view: view(),
  });
  return steps;
}
