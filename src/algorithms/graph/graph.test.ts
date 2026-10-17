import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { bfs, bfsCode, bfsSteps } from './bfs';
import { dfs, dfsCode, dfsSteps } from './dfs';
import { dijkstra, dijkstraCode, dijkstraSteps } from './dijkstra';
import { directedGraph, islandGraph, simpleGraph, weightedGraph } from './graphs';
import { edgeKey, graphView, neighbours } from './view';

function graph(directed: boolean, nodes: string, edges: [string, string, number?][]): Graph {
  return {
    id: 'test',
    name: 'test',
    directed,
    nodes: [...nodes].map((id) => ({ id, label: id, x: 0, y: 0 })),
    edges: edges.map(([from, to, weight]) => ({ from, to, ...(weight !== undefined && { weight }) })),
  };
}

const small = graph(false, 'ABCDEF', [
  ['A', 'B'],
  ['A', 'C'],
  ['B', 'D'],
  ['C', 'D'],
  ['D', 'E'],
]);
const weighted = graph(false, 'ABCDZ', [
  ['A', 'B', 4],
  ['A', 'C', 1],
  ['C', 'B', 2],
  ['B', 'D', 5],
  ['C', 'D', 8],
]);

/** Order in which nodes first become the active (currently explored) node. */
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

describe('graphView edge labels', () => {
  it('labels only the edges it is given', () => {
    const view = graphView(weightedGraph, {}, {}, { edgeLabels: { [edgeKey('A', 'B')]: '3/4' } });
    expect(view.edges.find((e) => e.from === 'A' && e.to === 'B')?.label).toBe('3/4');
    expect(view.edges.filter((e) => e.label !== undefined)).toHaveLength(1);
  });
});

describe('neighbours', () => {
  it('lists both directions of an undirected edge, sorted by id', () => {
    expect(neighbours(small, 'D').map((n) => n.id)).toEqual(['B', 'C', 'E']);
  });

  it('follows only outgoing edges in a directed graph', () => {
    const g = graph(true, 'AB', [['A', 'B']]);
    expect(neighbours(g, 'A').map((n) => n.id)).toEqual(['B']);
    expect(neighbours(g, 'B')).toEqual([]);
  });

  it('defaults the weight to 1', () => {
    expect(neighbours(small, 'A')[0]).toEqual({ id: 'B', weight: 1 });
  });
});

describe('bfs', () => {
  it('visits level by level and skips unreachable nodes', () => {
    expect(bfs(small, 'A')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('handles a single node, an unknown start and directed edges', () => {
    expect(bfs(graph(false, 'A', []), 'A')).toEqual(['A']);
    expect(bfs(small, 'Q')).toEqual([]);
    expect(bfs(graph(true, 'AB', [['A', 'B']]), 'B')).toEqual(['B']);
  });
});

describe('dfs', () => {
  it('goes deep before going wide', () => {
    expect(dfs(small, 'A')).toEqual(['A', 'B', 'D', 'C', 'E']);
  });

  it('handles a single node and an unknown start', () => {
    expect(dfs(graph(false, 'A', []), 'A')).toEqual(['A']);
    expect(dfs(small, 'Q')).toEqual([]);
  });
});

describe('dijkstra', () => {
  it('finds the shortest distance to every node', () => {
    expect(dijkstra(weighted, 'A')).toEqual({ A: 0, B: 3, C: 1, D: 8, Z: Infinity });
  });

  it('reports every node unreachable from an unknown start', () => {
    expect(Object.values(dijkstra(weighted, 'Q')).every((d) => d === Infinity)).toBe(true);
  });

  it('respects edge direction', () => {
    const g = graph(true, 'AB', [['A', 'B', 2]]);
    expect(dijkstra(g, 'B')).toEqual({ A: Infinity, B: 0 });
  });
});

describe.each([
  ['bfsSteps', bfsSteps, bfsCode],
  ['dfsSteps', dfsSteps, dfsCode],
  ['dijkstraSteps', dijkstraSteps, dijkstraCode],
] as const)('%s', (_name, steps, code) => {
  it.each([simpleGraph, weightedGraph, islandGraph, directedGraph])('stays small and valid on $name', (g) => {
    const lines = code.split('\n').length;
    const result = steps(g, g.nodes[0]!.id);
    expect(result.length).toBeGreaterThan(2);
    expect(result.length).toBeLessThan(200);
    for (const step of result) {
      expect(step.view.kind).toBe('graph');
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });

  it('returns one explanatory step for an unknown start', () => {
    expect(steps(simpleGraph, 'nope')).toHaveLength(1);
  });
});

describe('step order matches the algorithm', () => {
  it.each([simpleGraph, weightedGraph, islandGraph, directedGraph])('on $name', (g) => {
    const start = g.nodes[0]!.id;
    expect(activeOrder(bfsSteps(g, start))).toEqual(bfs(g, start));
    expect(activeOrder(dfsSteps(g, start))).toEqual(dfs(g, start));

    const dist = dijkstra(g, start);
    const order = activeOrder(dijkstraSteps(g, start)).map((id) => dist[id]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('ends with the final distances in the table', () => {
    const dist = dijkstra(weightedGraph, 'A');
    const last = dijkstraSteps(weightedGraph, 'A').at(-1)!;
    expect(last.view.kind).toBe('graph');
    if (last.view.kind !== 'graph') return;
    for (const node of weightedGraph.nodes) {
      expect(last.view.table!.rows[node.label]![0]).toBe(String(dist[node.id]));
    }
  });

  it('shows unreachable nodes as infinity', () => {
    const last = dijkstraSteps(islandGraph, 'A').at(-1)!;
    if (last.view.kind !== 'graph') throw new Error('expected a graph view');
    expect(last.view.table!.rows['D']![0]).toBe('∞');
  });
});
