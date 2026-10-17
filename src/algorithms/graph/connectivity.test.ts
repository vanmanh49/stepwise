import { describe, expect, it } from 'vitest';
import type { Graph } from '../../types/lesson';
import type { Step } from '../../types/visualization';
import { bfs } from './bfs';
import { courseGraph, cycleGraph, directedGraph, islandGraph, sccGraph, simpleGraph, weightedGraph } from './graphs';
import { sccCode, sccSteps, stronglyConnectedComponents } from './scc';
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

function reaches(g: Graph, from: string, to: string): boolean {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === to) return true;
    for (const e of g.edges) if (e.from === id && !seen.has(e.to)) (seen.add(e.to), queue.push(e.to));
  }
  return false;
}

/** Groups nodes that can reach each other both ways. */
function bruteForceScc(g: Graph): string[][] {
  const groups: string[][] = [];
  for (const node of g.nodes.map((n) => n.id).sort()) {
    const group = groups.find((grp) => reaches(g, grp[0]!, node) && reaches(g, node, grp[0]!));
    if (group) group.push(node);
    else groups.push([node]);
  }
  return groups;
}

describe('stronglyConnectedComponents', () => {
  it('finds the three parts of the lesson graph', () => {
    expect(stronglyConnectedComponents(sccGraph)).toEqual([['A', 'B', 'C'], ['D', 'E', 'F', 'G'], ['H']]);
  });

  it('puts every node of a DAG on its own', () => {
    expect(stronglyConnectedComponents(courseGraph)).toEqual(courseGraph.nodes.map((n) => [n.id]).sort());
  });

  it.each([sccGraph, directedGraph, courseGraph])('matches mutual reachability on $name', (g) => {
    expect(stronglyConnectedComponents(g)).toEqual(bruteForceScc(g));
  });
});

describe('sccSteps', () => {
  it.each([sccGraph, directedGraph])('explains every step on $name', (g) => {
    expectExplained(sccSteps(g), sccCode);
  });

  it('ends with a component badge on every node', () => {
    const steps = sccSteps(sccGraph);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'graph') throw new Error('expected a graph');
    const badges = Object.fromEntries(last.nodes.map((n) => [n.id, n.badge]));
    expect(badges).toEqual({ A: 'C1', B: 'C1', C: 'C1', D: 'C2', E: 'C2', F: 'C2', G: 'C2', H: 'C3' });
  });

  it('shows the reversed graph between the two passes', () => {
    const reversed = sccSteps(sccGraph).find((s) => s.title.toLowerCase().includes('reverse'))!;
    expect(reversed.view.kind === 'graph' && reversed.view.edges.some((e) => e.from === 'B' && e.to === 'A')).toBe(true);
  });
});
