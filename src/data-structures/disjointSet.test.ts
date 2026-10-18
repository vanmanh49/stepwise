import { describe, expect, it } from 'vitest';
import type { GraphView, PanelsView, Step } from '../types/visualization';
import { disjointSetStructure, type DSUState } from './disjointSet';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: DSUState, ...args: number[]) {
  const op = disjointSetStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, args, []);
}

const initial = disjointSetStructure.initial;
const titles = (steps: Step[]) => steps.map((s) => s.title);
const rootOf = (s: DSUState, x: number): number => (s.parent[x] === x ? x : rootOf(s, s.parent[x]!));
const depth = (s: DSUState, x: number): number => (s.parent[x] === x ? 0 : 1 + depth(s, s.parent[x]!));

describe('disjoint set', () => {
  it('starts as a forest union by rank could build', () => {
    expect(initial.parent).toEqual([0, 0, 0, 2, 4, 4, 4, 7, 7, 9]);
    expect(initial.rank).toEqual([2, 0, 1, 0, 1, 0, 0, 1, 0, 0]);
  });

  it('follows parents to the root, then compresses the path', () => {
    const { steps, state } = run('find', initial, 3);
    expect(steps.filter((s) => s.title.startsWith('Follow'))).toHaveLength(2);
    expect(titles(steps)).toContain('Path compression: point 3 straight at 0');
    expect(state.parent[3]).toBe(0);
    expect(state.parent[2]).toBe(0);
    expect(steps.at(-1)!.variables?.root).toBe(0);
  });

  it('skips compression when the path is already short', () => {
    const { steps, state } = run('find', initial, 1);
    expect(titles(steps).some((t) => t.startsWith('Path compression'))).toBe(false);
    expect(state).toBe(initial);
  });

  it('attaches the lower-rank root under the higher-rank one', () => {
    const { state } = run('union', initial, 9, 3);
    expect(state.parent[9]).toBe(0);
    expect(state.rank[0]).toBe(2);
  });

  it('raises the rank when two roots of equal rank are joined', () => {
    const { steps, state } = run('union', initial, 5, 8);
    expect(state.parent[7]).toBe(4);
    expect(state.rank[4]).toBe(2);
    expect(titles(steps).at(-1)).toContain('Equal ranks');
  });

  it('says when both are already in one set', () => {
    const { steps, state } = run('union', initial, 1, 3);
    expect(titles(steps).at(-1)).toBe('1 and 3 are already in the same set');
    expect(state.parent.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('answers connected', () => {
    expect(titles(run('connected', initial, 1, 3).steps).at(-1)).toBe('1 and 3 are connected: both have root 0');
    expect(titles(run('connected', initial, 1, 5).steps).at(-1)).toBe('1 and 5 are not connected: roots 0 and 4');
  });

  it('refuses elements outside 0–9', () => {
    const result = run('find', initial, 12);
    expect(result.steps).toHaveLength(1);
    expect(result.state).toBe(initial);
  });

  it('draws the forest with arrows from child to parent and the rank on each root', () => {
    const forest = (disjointSetStructure.view(initial) as PanelsView).panels[0]!.view as GraphView;
    expect(forest.directed).toBe(true);
    expect(forest.edges.map((e) => [e.from, e.to])).toContainEqual(['e3', 'e2']);
    expect(forest.nodes.find((n) => n.id === 'e0')!.badge).toBe('r2');
    expect(forest.nodes.find((n) => n.id === 'e3')!.badge).toBeUndefined();
  });

  it('matches a naive reference and keeps every tree within its rank over random operations', () => {
    const r = rng(3);
    let state = initial;
    const sets = Array.from({ length: 10 }, (_, i) => rootOf(initial, i));
    for (let i = 0; i < 300; i++) {
      const op = pick(r, ['union', 'union', 'find', 'connected']);
      const a = int(r, 0, 9);
      const b = int(r, 0, 9);
      state = run(op, state, a, b).state;
      if (op === 'union') {
        const from = sets[b]!;
        const to = sets[a]!;
        for (let k = 0; k < 10; k++) if (sets[k] === from) sets[k] = to;
      }
      for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) expect(rootOf(state, x) === rootOf(state, y)).toBe(sets[x] === sets[y]);
      for (let x = 0; x < 10; x++) expect(depth(state, x)).toBeLessThanOrEqual(state.rank[rootOf(state, x)]!);
    }
  });
});
