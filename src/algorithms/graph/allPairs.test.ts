import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { bellmanFord } from './bellmanFord';
import { dijkstra } from './dijkstra';
import { floydWarshall, floydWarshallCode, floydWarshallSteps } from './floydWarshall';
import { allPairsGraph, allPairsNegativeGraph, islandGraph } from './graphs';

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.view.kind).toBe('graph');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

const ids = (g: Graph) => g.nodes.map((n) => n.id);

describe('floydWarshall', () => {
  it('matches Dijkstra from every node on a non-negative graph', () => {
    const all = floydWarshall(allPairsGraph);
    for (const from of ids(allPairsGraph)) expect(all[from]).toEqual(dijkstra(allPairsGraph, from));
  });

  it('matches Bellman-Ford from every node with a negative edge', () => {
    const all = floydWarshall(allPairsNegativeGraph);
    for (const from of ids(allPairsNegativeGraph)) expect(all[from]).toEqual(bellmanFord(allPairsNegativeGraph, from).dist);
  });

  it('keeps unreachable pairs at infinity', () => {
    expect(floydWarshall(islandGraph)['A']!['D']).toBe(Infinity);
  });
});

describe('floydWarshallSteps', () => {
  it.each([allPairsGraph, allPairsNegativeGraph, islandGraph])('explains every step on $name', (g) => {
    expectExplained(floydWarshallSteps(g), floydWarshallCode);
  });

  it('ends with the full distance table', () => {
    const steps = floydWarshallSteps(allPairsGraph);
    const last = steps[steps.length - 1]!.view;
    const all = floydWarshall(allPairsGraph);
    if (last.kind !== 'graph' || !last.table) throw new Error('expected a graph view with a table');
    expect(last.table.columns).toEqual(ids(allPairsGraph));
    for (const from of ids(allPairsGraph)) expect(last.table.rows[from]).toEqual(ids(allPairsGraph).map((to) => String(all[from]![to])));
  });

  it('shows unreachable pairs as ∞, never Infinity or NaN', () => {
    const steps = floydWarshallSteps(islandGraph);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'graph' || !last.table) throw new Error('expected a table');
    expect(last.table.rows['A']![3]).toBe('∞');
    for (const step of steps) {
      if (step.view.kind !== 'graph' || !step.view.table) continue;
      for (const row of Object.values(step.view.table.rows)) {
        for (const cell of row) expect(['Infinity', 'NaN']).not.toContain(cell);
      }
    }
  });
});
