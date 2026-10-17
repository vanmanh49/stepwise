import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { bfs } from './bfs';
import { cycleGraph, islandGraph, simpleGraph, weightedGraph } from './graphs';
import { unionFindCode, unionFindComponents, unionFindSteps } from './unionFind';

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

function bfsComponents(g: Graph): number {
  const seen = new Set<string>();
  let count = 0;
  for (const node of g.nodes) {
    if (seen.has(node.id)) continue;
    count++;
    for (const id of bfs(g, node.id)) seen.add(id);
  }
  return count;
}

describe('unionFindComponents', () => {
  it.each([islandGraph, simpleGraph, weightedGraph, cycleGraph])('counts the same components as BFS on $name', (g) => {
    expect(unionFindComponents(g).components).toBe(bfsComponents(g));
  });

  it('flags the edge that closes the cycle', () => {
    expect(unionFindComponents(cycleGraph)).toEqual({ components: 2, cycleEdges: [['C', 'A']] });
  });
});

describe('unionFindSteps', () => {
  it.each([cycleGraph, islandGraph, simpleGraph])('explains every step on $name', (g) => {
    expectExplained(unionFindSteps(g), unionFindCode);
  });

  it('ends with every node pointing straight at its root', () => {
    const steps = unionFindSteps(cycleGraph);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'graph' || !last.table) throw new Error('expected a parent table');
    const parent = (label: string) => last.table!.rows[label]![0]!;
    for (const label of Object.keys(last.table.rows)) expect(parent(parent(label))).toBe(parent(label));
    expect(last.table.columns).toEqual(['parent', 'rank']);
  });

  it('marks the cycle-closing edge as ruled out', () => {
    const steps = unionFindSteps(cycleGraph);
    const last = steps[steps.length - 1]!.view;
    expect(last.kind === 'graph' && last.edges.find((e) => e.from === 'C' && e.to === 'A')?.role).toBe('discarded');
  });
});
