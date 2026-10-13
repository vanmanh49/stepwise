import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { bellmanFord, bellmanFordCode, bellmanFordSteps } from './bellmanFord';
import { dijkstra } from './dijkstra';
import { buildGraph, courseGraph, directedGraph, makeGraph, negativeCycleGraph, negativeGraph, weightedGraph } from './graphs';
import { topologicalSort, topologicalSortCode, topologicalSortSteps } from './topological';

function graph(directed: boolean, nodes: string, edges: [string, string, number?][]): Graph {
  return makeGraph('test', 'test', directed, [...nodes].map((id) => [id, 0, 0]), edges);
}

/** Order in which nodes first become the active node. */
function activeOrder(steps: Step[]): string[] {
  const order: string[] = [];
  for (const step of steps) {
    if (step.view.kind !== 'graph') continue;
    for (const node of step.view.nodes) {
      if (node.role === 'active' && !order.includes(node.id)) order.push(node.id);
    }
  }
  return order;
}

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  expect(steps.length).toBeLessThan(200);
  for (const step of steps) {
    expect(step.view.kind).toBe('graph');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

describe('sample graphs', () => {
  it('are acyclic where the lessons need that', () => {
    expect(topologicalSort(courseGraph)).not.toBeNull();
    expect(topologicalSort(buildGraph)).not.toBeNull();
    expect(buildGraph.nodes.filter((n) => !buildGraph.edges.some((e) => e.to === n.id))).toHaveLength(2);
  });

  it('have the negative weights the lessons need', () => {
    expect(negativeGraph.edges.filter((e) => (e.weight ?? 0) < 0)).toHaveLength(1);
    expect(bellmanFord(negativeGraph, negativeGraph.nodes[0]!.id).negativeCycle).toBe(false);
    expect(bellmanFord(negativeCycleGraph, negativeCycleGraph.nodes[0]!.id).negativeCycle).toBe(true);
  });
});

describe('topologicalSort', () => {
  it('orders a small dependency graph', () => {
    const g = graph(true, 'ABCD', [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
    ]);
    expect(topologicalSort(g)).toEqual(['A', 'B', 'C', 'D']);
  });

  it.each([courseGraph, buildGraph])('puts every prerequisite first in $name', (g) => {
    const order = topologicalSort(g)!;
    expect([...order].sort()).toEqual(g.nodes.map((n) => n.id).sort());
    for (const edge of g.edges) expect(order.indexOf(edge.from)).toBeLessThan(order.indexOf(edge.to));
  });

  it('returns null when the graph has a cycle', () => {
    expect(topologicalSort(directedGraph)).toBeNull();
    expect(topologicalSort(graph(true, 'AB', [['A', 'B'], ['B', 'A']]))).toBeNull();
  });

  it('returns nodes by id when there are no edges', () => {
    expect(topologicalSort(graph(true, 'CAB', []))).toEqual(['A', 'B', 'C']);
  });
});

describe('topologicalSortSteps', () => {
  it.each([courseGraph, buildGraph])('takes nodes in the sorted order on $name', (g) => {
    const steps = topologicalSortSteps(g, '');
    expect(activeOrder(steps)).toEqual(topologicalSort(g));
    expect(steps.at(-1)!.variables!.order).toBe(topologicalSort(g)!.join(' → '));
    expectExplained(steps, topologicalSortCode);
  });

  it('reports a cycle', () => {
    const steps = topologicalSortSteps(directedGraph, '');
    expect(steps.at(-1)!.title).toBe('No valid order exists');
    expectExplained(steps, topologicalSortCode);
  });
});

describe('bellmanFord', () => {
  const g = graph(true, 'ABCDZ', [
    ['A', 'B', 4],
    ['A', 'C', 2],
    ['C', 'B', -1],
    ['B', 'D', 3],
  ]);

  it('finds shortest distances with a negative edge', () => {
    expect(bellmanFord(g, 'A')).toEqual({ dist: { A: 0, B: 1, C: 2, D: 4, Z: Infinity }, negativeCycle: false });
  });

  it('leaves everything unreachable from an unknown start', () => {
    const result = bellmanFord(g, 'Q');
    expect(Object.values(result.dist).every((d) => d === Infinity)).toBe(true);
    expect(result.negativeCycle).toBe(false);
  });

  it('agrees with Dijkstra when no weight is negative', () => {
    expect(bellmanFord(weightedGraph, 'A').dist).toEqual(dijkstra(weightedGraph, 'A'));
  });

  it('detects a negative cycle', () => {
    const cycle = graph(true, 'ABC', [
      ['A', 'B', 1],
      ['B', 'C', -3],
      ['C', 'B', 1],
    ]);
    expect(bellmanFord(cycle, 'A').negativeCycle).toBe(true);
  });
});

describe('bellmanFordSteps', () => {
  it('ends with the final distances in the table', () => {
    const start = negativeGraph.nodes[0]!.id;
    const { dist } = bellmanFord(negativeGraph, start);
    const steps = bellmanFordSteps(negativeGraph, start);
    const last = steps.at(-1)!;
    if (last.view.kind !== 'graph') throw new Error('expected a graph view');
    for (const node of negativeGraph.nodes) {
      expect(last.view.table!.rows[node.label]![0]).toBe(String(dist[node.id]));
    }
    expectExplained(steps, bellmanFordCode);
  });

  it('reports a negative cycle', () => {
    const steps = bellmanFordSteps(negativeCycleGraph, negativeCycleGraph.nodes[0]!.id);
    expect(steps.at(-1)!.title).toBe('Negative cycle detected');
    expectExplained(steps, bellmanFordCode);
  });

  it('stops early on a graph that settles quickly', () => {
    const steps = bellmanFordSteps(weightedGraph, 'A');
    expect(steps.some((s) => s.title.includes('nothing changed'))).toBe(true);
    expectExplained(steps, bellmanFordCode);
  });

  it('returns one explanatory step for an unknown start', () => {
    expect(bellmanFordSteps(negativeGraph, 'nope')).toHaveLength(1);
  });
});

describe('bellmanFordSteps wording', () => {
  it('does not claim the final check is skipped after an early exit', () => {
    expect(bellmanFordSteps(weightedGraph, 'A').at(-1)!.why).not.toMatch(/no need for the extra check/);
  });

  it('counts edges the way the graph shows them', () => {
    expect(bellmanFordSteps(weightedGraph, 'A')[0]!.next).toMatch(/9 edges, each in both directions/);
    expect(bellmanFordSteps(negativeGraph, 'A')[0]!.next).toMatch(/all 6 edges/);
  });
});
