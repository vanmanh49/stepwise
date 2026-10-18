import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { directedGraph, islandGraph, makeGraph, weightedGraph } from './graphs';
import { kruskal, kruskalCode, kruskalSteps } from './kruskal';
import { prim, primCode, primSteps } from './prim';

function graph(nodes: string, edges: [string, string, number][]): Graph {
  return makeGraph('test', 'test', false, [...nodes].map((id) => [id, 0, 0]), edges);
}

const small = graph('ABCD', [
  ['A', 'B', 1],
  ['B', 'C', 2],
  ['A', 'C', 3],
  ['C', 'D', 4],
]);

function foundWeight(step: Step): number {
  if (step.view.kind !== 'graph') return NaN;
  return step.view.edges.filter((e) => e.role === 'found').reduce((sum, e) => sum + (e.weight ?? 1), 0);
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

describe('kruskal', () => {
  it('takes the cheapest edges that do not form a cycle', () => {
    const tree = kruskal(small);
    expect(tree.weight).toBe(7);
    expect(tree.edges.map((e) => `${e.from}${e.to}`)).toEqual(['AB', 'BC', 'CD']);
  });

  it('builds a forest when the graph is not connected', () => {
    expect(kruskal(islandGraph).edges).toHaveLength(islandGraph.nodes.length - 2);
  });

  it('handles a single node', () => {
    expect(kruskal(graph('A', []))).toEqual({ edges: [], weight: 0 });
  });
});

describe('prim', () => {
  it('finds a tree of the same weight as Kruskal from any start', () => {
    expect(prim(small, 'A').weight).toBe(7);
    const expected = kruskal(weightedGraph).weight;
    for (const node of weightedGraph.nodes) {
      const tree = prim(weightedGraph, node.id);
      expect(tree.weight).toBe(expected);
      expect(tree.edges).toHaveLength(weightedGraph.nodes.length - 1);
    }
  });

  it("spans only the start node's component", () => {
    expect(prim(islandGraph, 'A').edges).toHaveLength(2);
    expect(prim(islandGraph, 'D').edges).toHaveLength(2);
  });

  it('handles a single node and an unknown start', () => {
    expect(prim(graph('A', []), 'A')).toEqual({ edges: [], weight: 0 });
    expect(prim(small, 'Q')).toEqual({ edges: [], weight: 0 });
  });
});

describe.each([
  ['kruskalSteps', kruskalSteps, kruskalCode, (g: Graph) => kruskal(g).weight],
  ['primSteps', primSteps, primCode, (g: Graph) => prim(g, g.nodes[0]!.id).weight],
] as const)('%s', (_name, steps, code, weight) => {
  it.each([weightedGraph, islandGraph, directedGraph])('highlights exactly the tree edges on $name', (g) => {
    const result = steps(g, g.nodes[0]!.id);
    expect(foundWeight(result.at(-1)!)).toBe(weight(g));
    expectExplained(result, code);
  });

  it('says so when the graph is not connected', () => {
    const result = steps(islandGraph, islandGraph.nodes[0]!.id);
    expect(result.at(-1)!.why).toMatch(/not connected/);
  });
});

describe('primSteps', () => {
  it('returns one explanatory step for an unknown start', () => {
    expect(primSteps(weightedGraph, 'nope')).toHaveLength(1);
  });
});

describe('primSteps wording', () => {
  it('uses the singular when one edge leaves the tree', () => {
    const titles = primSteps(islandGraph, 'D').map((s) => s.title);
    expect(titles.some((t) => t.startsWith('1 edge leaves the tree'))).toBe(true);
    expect(titles.some((t) => t.startsWith('1 edge leave '))).toBe(false);
  });
});
