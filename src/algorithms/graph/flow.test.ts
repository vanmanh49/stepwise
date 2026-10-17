import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { directedGraph, flowNetwork, makeGraph } from './graphs';
import { maxFlow, networkFlowCode, networkFlowSteps } from './networkFlow';

function expectExplained(steps: Step[]) {
  const lines = networkFlowCode.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.view.kind).toBe('graph');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

/** Smallest total capacity of edges leaving a set that contains S but not T. */
function minCut(g: Graph): number {
  const middle = g.nodes.map((n) => n.id).filter((id) => id !== 'S' && id !== 'T');
  let best = Infinity;
  for (let mask = 0; mask < 1 << middle.length; mask++) {
    const side = new Set(['S', ...middle.filter((_, i) => mask & (1 << i))]);
    const cut = g.edges.filter((e) => side.has(e.from) && !side.has(e.to)).reduce((sum, e) => sum + (e.weight ?? 1), 0);
    best = Math.min(best, cut);
  }
  return best;
}

function randomNetwork(seed: number): Graph {
  const ids = ['S', 'A', 'B', 'C', 'T'];
  const edges: [string, string, number][] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from === to || from === 'T' || to === 'S') continue;
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      if (seed % 3 === 0) continue;
      edges.push([from, to, 1 + (seed % 9)]);
    }
  }
  return makeGraph(`random${seed}`, 'random', true, ids.map((id, i) => [id, i * 20, 50]), edges);
}

function finalFlows(steps: Step[]): { from: string; to: string; flow: number; cap: number }[] {
  const view = steps[steps.length - 1]!.view;
  if (view.kind !== 'graph') return [];
  return view.edges.map((e) => {
    const [flow, cap] = e.label!.split('/').map(Number) as [number, number];
    return { from: e.from, to: e.to, flow, cap };
  });
}

describe('maxFlow', () => {
  it('finds 19 on the lesson network', () => {
    expect(maxFlow(flowNetwork)).toBe(19);
  });

  it.each([1, 2, 3, 4, 5, 6])('equals the minimum cut on random network %i', (seed) => {
    const g = randomNetwork(seed);
    expect(maxFlow(g)).toBe(minCut(g));
  });

  it('is 0 when T cannot be reached', () => {
    const g = makeGraph('cut', 'cut', true, [['S', 0, 0], ['A', 50, 0], ['T', 100, 0]], [['S', 'A', 5], ['T', 'A', 3]]);
    expect(maxFlow(g)).toBe(0);
  });
});

describe('networkFlowSteps', () => {
  it('explains every step and labels every edge flow/capacity', () => {
    const steps = networkFlowSteps(flowNetwork);
    expectExplained(steps);
    for (const step of steps) {
      if (step.view.kind === 'graph') for (const e of step.view.edges) expect(e.label).toMatch(/^\d+\/\d+$/);
    }
  });

  it.each([flowNetwork, randomNetwork(3), randomNetwork(5)])('ends with a valid flow on $id', (g) => {
    const flows = finalFlows(networkFlowSteps(g));
    for (const e of flows) expect(e.flow).toBeLessThanOrEqual(e.cap);
    for (const node of g.nodes.map((n) => n.id).filter((id) => id !== 'S' && id !== 'T')) {
      const inflow = flows.filter((e) => e.to === node).reduce((s, e) => s + e.flow, 0);
      const outflow = flows.filter((e) => e.from === node).reduce((s, e) => s + e.flow, 0);
      expect(inflow, node).toBe(outflow);
    }
    const out = flows.filter((e) => e.from === 'S').reduce((s, e) => s + e.flow, 0);
    expect(out).toBe(maxFlow(g));
  });

  it('says when no augmenting path exists', () => {
    const g = makeGraph('cut', 'cut', true, [['S', 0, 0], ['A', 50, 0], ['T', 100, 0]], [['S', 'A', 5], ['T', 'A', 3]]);
    const steps = networkFlowSteps(g);
    expect(steps[steps.length - 1]!.why).toContain('no augmenting path');
  });

  it('refuses a graph without S and T', () => {
    expect(networkFlowSteps(directedGraph)).toHaveLength(1);
  });
});
