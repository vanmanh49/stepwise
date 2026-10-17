import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { aStar, aStarCode, aStarSteps } from './aStar';
import { dijkstra } from './dijkstra';
import { islandGraph, openGraph, wallGraph } from './graphs';

function expectExplained(steps: Step[]) {
  const lines = aStarCode.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.view.kind).toBe('graph');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

const first = (g: Graph) => g.nodes[0]!.id;
const last = (g: Graph) => g.nodes[g.nodes.length - 1]!.id;
const weightOf = (g: Graph, a: string, b: string) =>
  g.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))?.weight;

describe('aStar', () => {
  it.each([wallGraph, openGraph])('finds a shortest path on $name', (g) => {
    const result = aStar(g, first(g), last(g))!;
    expect(result.cost).toBe(dijkstra(g, first(g))[last(g)]);
    expect(result.path[0]).toBe(first(g));
    expect(result.path[result.path.length - 1]).toBe(last(g));
    let total = 0;
    for (let i = 1; i < result.path.length; i++) {
      const w = weightOf(g, result.path[i - 1]!, result.path[i]!);
      expect(w, `${result.path[i - 1]}–${result.path[i]}`).toBeDefined();
      total += w!;
    }
    expect(total).toBe(result.cost);
  });

  it('agrees with Dijkstra for every goal', () => {
    const dist = dijkstra(wallGraph, 'A');
    for (const node of wallGraph.nodes) expect(aStar(wallGraph, 'A', node.id)?.cost).toBe(dist[node.id]);
  });

  it('returns a one-node path when start is the goal', () => {
    expect(aStar(wallGraph, 'A', 'A')).toEqual({ path: ['A'], cost: 0 });
  });

  it('returns null when the goal is unreachable', () => {
    expect(aStar(islandGraph, 'A', 'F')).toBeNull();
  });
});

describe('aStarSteps', () => {
  it('explains every step', () => {
    expectExplained(aStarSteps(wallGraph, 'A', 'L'));
    expectExplained(aStarSteps(openGraph, 'A', 'L'));
  });

  it('closes fewer nodes than there are on an open grid', () => {
    const steps = aStarSteps(openGraph, 'A', 'L');
    const view = steps[steps.length - 1]!.view;
    const closed = view.kind === 'graph' ? view.nodes.filter((n) => n.role === 'visited').length : 0;
    expect(closed).toBeLessThan(openGraph.nodes.length - 2);
  });

  it('marks the path found at the end', () => {
    const steps = aStarSteps(wallGraph, 'A', 'L');
    const view = steps[steps.length - 1]!.view;
    const onPath = view.kind === 'graph' ? view.nodes.filter((n) => n.role === 'found').map((n) => n.id) : [];
    expect(onPath.sort()).toEqual([...aStar(wallGraph, 'A', 'L')!.path].sort());
  });

  it('uses the last node as the goal when none is given', () => {
    const steps = aStarSteps(wallGraph, 'A');
    expect(steps[steps.length - 1]!.title).toContain('L');
  });

  it('says so when there is no path', () => {
    const steps = aStarSteps(islandGraph, 'A', 'F');
    expect(steps[steps.length - 1]!.title).toContain('No path');
    expectExplained(steps);
  });

  it('handles start equal to goal', () => {
    const steps = aStarSteps(wallGraph, 'A', 'A');
    expectExplained(steps);
    expect(steps[steps.length - 1]!.variables?.cost).toBe(0);
  });

  it('shows g, h and f in the table, never Infinity or NaN', () => {
    for (const step of aStarSteps(wallGraph, 'A', 'L')) {
      if (step.view.kind !== 'graph' || !step.view.table) continue;
      expect(step.view.table.columns).toEqual(['g', 'h', 'f']);
      for (const row of Object.values(step.view.table.rows)) for (const cell of row) expect(cell).not.toMatch(/Infinity|NaN/);
    }
  });
});
