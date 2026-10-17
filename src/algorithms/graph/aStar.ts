import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, hasNode, labelOf, neighbours, unknownStart } from './view';

export const aStarCode = `function aStar(graph: Graph, start: string, goal: string): string[] | null {
  const g: Record<string, number> = { [start]: 0 }; // cost so far
  const open = new Set([start]);
  const parent: Record<string, string> = {};
  while (open.size > 0) {
    const node = lowestF(open, g, goal); // f = g + h, h = straight-line distance
    if (node === goal) return path(parent, goal);
    open.delete(node); // closed: its g is final
    for (const { to, weight } of graph.edges(node)) {
      const candidate = g[node] + weight;
      if (candidate < (g[to] ?? Infinity)) {
        g[to] = candidate;
        parent[to] = node;
        open.add(to);
      }
    }
  }
  return null; // the goal cannot be reached
}`;

const LINE = { init: 2, pick: 6, goal: 7, close: 8, check: 10, better: 12, none: 18 };

/** Straight-line distance between node positions. */
function heuristic(g: Graph, from: string, to: string): number {
  const a = g.nodes.find((n) => n.id === from)!;
  const b = g.nodes.find((n) => n.id === to)!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const round = (n: number) => String(Math.round(n * 10) / 10);

interface Search {
  cost: Record<string, number>;
  open: Set<string>;
  closed: Set<string>;
  parent: Record<string, string>;
}

function lowestF(g: Graph, search: Search, goal: string): string {
  const f = (id: string) => search.cost[id]! + heuristic(g, id, goal);
  // Ties go to the node nearer the goal, then to the smaller id, so runs are repeatable.
  return [...search.open].sort((a, b) => f(a) - f(b) || heuristic(g, a, goal) - heuristic(g, b, goal) || a.localeCompare(b))[0]!;
}

function pathTo(parent: Record<string, string>, goal: string): string[] {
  const path = [goal];
  while (parent[path[0]!] !== undefined) path.unshift(parent[path[0]!]!);
  return path;
}

export function aStar(g: Graph, start: string, goal: string): { path: string[]; cost: number } | null {
  if (!hasNode(g, start) || !hasNode(g, goal)) return null;
  const search: Search = { cost: { [start]: 0 }, open: new Set([start]), closed: new Set(), parent: {} };
  while (search.open.size > 0) {
    const node = lowestF(g, search, goal);
    if (node === goal) return { path: pathTo(search.parent, goal), cost: search.cost[goal]! };
    search.open.delete(node);
    search.closed.add(node);
    for (const edge of neighbours(g, node)) {
      const candidate = search.cost[node]! + edge.weight;
      if (candidate < (search.cost[edge.id] ?? Infinity)) {
        search.cost[edge.id] = candidate;
        search.parent[edge.id] = node;
        search.open.add(edge.id);
      }
    }
  }
  return null;
}

export function aStarSteps(g: Graph, start: string, goal: string = g.nodes[g.nodes.length - 1]!.id): Step[] {
  if (!hasNode(g, start)) return unknownStart(g, start);
  if (!hasNode(g, goal)) {
    return [{ title: 'Choose a goal node', why: `"${goal}" is not a node in this graph, so there is nothing to aim for.`, codeLine: 1, view: graphView(g) }];
  }

  const name = (id: string) => labelOf(g, id);
  const search: Search = { cost: { [start]: 0 }, open: new Set([start]), closed: new Set(), parent: {} };
  const h = (id: string) => heuristic(g, id, goal);
  const treeEdges = () => Object.fromEntries(Object.entries(search.parent).map(([to, from]) => [edgeKey(from, to), 'visited' as Role]));

  const view = (extraNodes: Record<string, Role> = {}, extraEdges: Record<string, Role> = {}) => {
    const roles: Record<string, Role> = { [goal]: 'pivot' };
    for (const id of search.closed) roles[id] = 'visited';
    for (const id of search.open) roles[id] = 'frontier';
    const known = g.nodes.filter((n) => search.cost[n.id] !== undefined);
    const byF = [...search.open].sort((a, b) => search.cost[a]! + h(a) - (search.cost[b]! + h(b)));
    return graphView(g, { ...roles, ...extraNodes }, { ...treeEdges(), ...extraEdges }, {
      badges: Object.fromEntries(known.map((n) => [n.id, round(search.cost[n.id]! + h(n.id))])),
      frontier: { label: 'Open, lowest f first', items: byF.map((id) => `${name(id)} (f ${round(search.cost[id]! + h(id))})`) },
      table: {
        columns: ['g', 'h', 'f'],
        rows: Object.fromEntries(
          g.nodes.map((n) => {
            const cost = search.cost[n.id];
            return [n.label, cost === undefined ? ['—', round(h(n.id)), '—'] : [String(cost), round(h(n.id)), round(cost + h(n.id))]];
          }),
        ),
      },
    });
  };

  const steps: Step[] = [
    {
      title: `Search from ${name(start)} toward ${name(goal)}`,
      why: `g is the cost of the best path found so far, h is the straight-line distance to ${name(goal)}, and f = g + h estimates the whole trip through a node. A* always expands the open node with the lowest f. The badge above a node shows its f.`,
      next: `${name(start)} is the only open node.`,
      codeLine: LINE.init,
      view: view(),
    },
  ];

  while (search.open.size > 0) {
    const node = lowestF(g, search, goal);
    if (node === goal) {
      const path = pathTo(search.parent, goal);
      const pathNodes = Object.fromEntries(path.map((id) => [id, 'found' as Role]));
      const pathEdges = Object.fromEntries(path.slice(1).map((id, i) => [edgeKey(path[i]!, id), 'found' as Role]));
      steps.push({
        title: `Reached ${name(goal)}: path ${path.map(name).join(' → ')}`,
        why:
          node === start
            ? 'The start is already the goal, so the path is just this node and costs 0.'
            : `${name(goal)} has the lowest f of all open nodes. Because h never overestimates, no other open path can beat its cost of ${search.cost[goal]}. ${search.closed.size} node${search.closed.size === 1 ? ' was' : 's were'} expanded on the way.`,
        codeLine: LINE.goal,
        variables: { cost: search.cost[goal]! },
        view: view(pathNodes, pathEdges),
      });
      return steps;
    }

    search.open.delete(node);
    search.closed.add(node);
    steps.push({
      title: `Expand ${name(node)} (f = ${search.cost[node]} + ${round(h(node))} = ${round(search.cost[node]! + h(node))})`,
      why: `Among the open nodes, ${name(node)} has the lowest estimated total trip, so it is the most promising one to grow from.`,
      next: `Check ${name(node)}’s neighbours.`,
      codeLine: LINE.pick,
      variables: { node: name(node), g: search.cost[node]!, h: round(h(node)) },
      view: view({ [node]: 'active' }),
    });

    for (const edge of neighbours(g, node)) {
      if (search.closed.has(edge.id)) continue;
      const candidate = search.cost[node]! + edge.weight;
      const current = search.cost[edge.id];
      const better = current === undefined || candidate < current;
      if (better) {
        search.cost[edge.id] = candidate;
        search.parent[edge.id] = node;
        search.open.add(edge.id);
      }
      steps.push({
        title: `Check ${name(node)} → ${name(edge.id)} (weight ${edge.weight})`,
        why: better
          ? `${search.cost[node]} + ${edge.weight} = ${candidate}${current === undefined ? '' : `, better than ${current}`}. ${name(edge.id)} gets g = ${candidate} and f = ${round(candidate + h(edge.id))}.`
          : `${search.cost[node]} + ${edge.weight} = ${candidate} is not better than ${current}, so ${name(edge.id)} keeps its path.`,
        codeLine: better ? LINE.better : LINE.check,
        variables: { to: name(edge.id), candidate },
        view: view({ [node]: 'active', [edge.id]: 'compare' }, better ? {} : { [edgeKey(node, edge.id)]: 'compare' }),
      });
    }
  }

  steps.push({
    title: `No path from ${name(start)} to ${name(goal)}`,
    why: `Every node reachable from ${name(start)} has been expanded and the open set is empty. ${name(goal)} is not connected to it.`,
    codeLine: LINE.none,
    view: view(),
  });
  return steps;
}
