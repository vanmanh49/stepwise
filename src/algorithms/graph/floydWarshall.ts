import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { graphView, labelOf, neighbours } from './view';

export const floydWarshallCode = `function floydWarshall(graph: Graph): Record<string, Record<string, number>> {
  const dist = table(graph.nodes, Infinity); // dist[i][j], unknown for now
  for (const v of graph.nodes) dist[v][v] = 0;
  for (const { from, to, weight } of graph.edges) dist[from][to] = weight;
  for (const k of graph.nodes) { // allow paths through k
    for (const i of graph.nodes) {
      for (const j of graph.nodes) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j]; // shorter via k
        }
      }
    }
  }
  return dist;
}`;

type Dist = Record<string, Record<string, number>>;

function initial(g: Graph): Dist {
  const dist: Dist = {};
  for (const i of g.nodes) {
    dist[i.id] = {};
    for (const j of g.nodes) dist[i.id]![j.id] = i.id === j.id ? 0 : Infinity;
  }
  for (const i of g.nodes) {
    for (const edge of neighbours(g, i.id)) {
      if (edge.id !== i.id) dist[i.id]![edge.id] = Math.min(dist[i.id]![edge.id]!, edge.weight);
    }
  }
  return dist;
}

export function floydWarshall(g: Graph): Dist {
  const dist = initial(g);
  const ids = g.nodes.map((n) => n.id);
  for (const k of ids) {
    for (const i of ids) {
      for (const j of ids) {
        const via = dist[i]![k]! + dist[k]![j]!;
        if (via < dist[i]![j]!) dist[i]![j] = via;
      }
    }
  }
  return dist;
}

const show = (d: number) => (d === Infinity ? '∞' : String(d));

function view(g: Graph, dist: Dist, nodeRoles: Record<string, Role> = {}) {
  const ids = g.nodes.map((n) => n.id);
  return graphView(g, nodeRoles, {}, {
    table: {
      columns: ids.map((id) => labelOf(g, id)),
      rows: Object.fromEntries(ids.map((i) => [labelOf(g, i), ids.map((j) => show(dist[i]![j]!))])),
    },
  });
}

export function floydWarshallSteps(g: Graph, _start?: string): Step[] {
  const dist = initial(g);
  const ids = g.nodes.map((n) => n.id);
  const name = (id: string) => labelOf(g, id);
  const steps: Step[] = [
    {
      title: 'Start from the direct edges',
      why: 'Row i, column j holds the shortest known distance from i to j. Each node is 0 from itself, an edge gives its weight, and every other pair is ∞ (no path known yet).',
      next: `Allow paths that pass through ${name(ids[0]!)}.`,
      codeLine: 4,
      view: view(g, dist),
    },
  ];

  for (const k of ids) {
    let improved = 0;
    steps.push({
      title: `Allow paths through ${name(k)}`,
      why: `For every pair i, j, check whether going i → ${name(k)} → j beats the best distance found so far. Paths through earlier nodes are already accounted for.`,
      codeLine: 5,
      variables: { k: name(k) },
      view: view(g, dist, { [k]: 'pivot' }),
    });
    for (const i of ids) {
      for (const j of ids) {
        if (i === k || j === k || i === j) continue;
        const via = dist[i]![k]! + dist[k]![j]!;
        if (via < dist[i]![j]!) {
          const before = dist[i]![j]!;
          dist[i]![j] = via;
          improved++;
          steps.push({
            title: `${name(i)} → ${name(j)} improves to ${via} via ${name(k)}`,
            why: `${name(i)} → ${name(k)} costs ${show(dist[i]![k]!)} and ${name(k)} → ${name(j)} costs ${show(dist[k]![j]!)}, ${via} in total, which beats ${show(before)}.`,
            codeLine: 9,
            variables: { k: name(k), i: name(i), j: name(j), 'dist[i][j]': via },
            view: view(g, dist, { [k]: 'pivot', [i]: 'active', [j]: 'compare' }),
          });
        }
      }
    }
    if (improved === 0) {
      steps.push({
        title: `${name(k)} shortens no path`,
        why: `No pair gets cheaper by passing through ${name(k)}, so the table is unchanged.`,
        codeLine: 8,
        variables: { k: name(k) },
        view: view(g, dist, { [k]: 'pivot' }),
      });
    }
  }

  const negative = ids.filter((v) => dist[v]![v]! < 0);
  steps.push({
    title: negative.length > 0 ? 'A negative cycle makes some distances meaningless' : 'All shortest distances found',
    why:
      negative.length > 0
        ? `${negative.map(name).join(', ')} can reach ${negative.length > 1 ? 'themselves' : 'itself'} at a negative cost, so going around again keeps lowering the distance.`
        : 'Every node has been allowed as a stop in the middle, so each entry is the shortest distance between that pair. ∞ means no path exists.',
    codeLine: 14,
    view: view(g, dist, Object.fromEntries(ids.map((id) => [id, 'sorted' as Role]))),
  });
  return steps;
}
