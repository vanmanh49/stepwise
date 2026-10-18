import { describe, expect, it } from 'vitest';
import type { ArrayView, GraphView, GridView, PanelsView, View } from '../types/visualization';
import { graphRepsStructure, type GraphRepsState } from './graphReps';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: GraphRepsState, ...args: number[]) {
  const op = graphRepsStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, args, []);
}

const initial = graphRepsStructure.initial;
const panels = (view: View) => (view as PanelsView).panels.map((p) => p.view);

/** The edge set each representation in a view describes, as sorted "u>v" strings (both directions when undirected). */
function edgeSets(view: View) {
  const [graph, matrix, list, edgeList] = panels(view) as [GraphView, GridView, GridView, ArrayView];
  const both = (u: string, v: string) => (graph.directed ? [`${u}>${v}`] : [`${u}>${v}`, `${v}>${u}`]);
  return {
    graph: graph.edges.flatMap((e) => both(e.from.slice(1), e.to.slice(1))).sort(),
    matrix: matrix.rows.flatMap((row, u) => row.cells.flatMap((c, v) => (c?.value === 1 ? [`${u}>${v}`] : []))).sort(),
    list: list.rows.flatMap((row, u) => row.cells.flatMap((c) => (c ? [`${u}>${c.value}`] : []))).sort(),
    edgeList: edgeList.cells.flatMap((c) => {
      const [u, v] = String(c.value).split(/[–→]/);
      return both(u!, v!);
    }).sort(),
  };
}

describe('graph representations', () => {
  it('starts undirected with 7 edges, drawn four ways that agree', () => {
    expect(initial).toEqual({ directed: false, edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]] });
    const sets = edgeSets(graphRepsStructure.view(initial));
    expect(sets.matrix).toHaveLength(14);
    expect(sets.list).toEqual(sets.matrix);
    expect(sets.edgeList).toEqual(sets.matrix);
    expect(sets.graph).toEqual(sets.matrix);
  });

  it('answers has-edge from each representation, counting what it reads', () => {
    const { steps } = run('has', initial, 0, 4);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.variables?.cost)).toEqual([1, 2, 7]);
    expect(steps.every((s) => s.title.includes('no'))).toBe(true);
    expect(run('has', initial, 4, 2).steps.map((s) => s.variables?.cost)).toEqual([1, 1, 5]);
  });

  it('lists neighbours from each representation', () => {
    const { steps } = run('neighbours', initial, 4);
    expect(steps.map((s) => s.variables?.cost)).toEqual([6, 3, 7]);
    expect(steps[0]!.title).toContain('2, 3, 5');
  });

  it('adds and removes an edge in all three', () => {
    const added = run('add', initial, 3, 5);
    expect(added.steps).toHaveLength(3);
    expect(added.state.edges).toContainEqual([3, 5]);
    const removed = run('remove', initial, 2, 1);
    expect(removed.state.edges).not.toContainEqual([1, 2]);
    expect(removed.state.edges).toHaveLength(6);
  });

  it('refuses a self-loop, a duplicate and a missing edge', () => {
    for (const [op, args] of [['add', [2, 2]], ['add', [2, 0]], ['remove', [0, 5]], ['add', [0, 6]], ['has', [-1, 2]]] as const) {
      const result = run(op, initial, ...args);
      expect(result.steps, `${op} ${args}`).toHaveLength(1);
      expect(result.state).toBe(initial);
    }
  });

  it('treats (u, v) and (v, u) as different edges when directed', () => {
    const directed = run('toggle', initial).state;
    expect(directed.directed).toBe(true);
    expect(run('has', directed, 1, 0).steps.every((s) => s.title.includes('no'))).toBe(true);
    const both = run('add', directed, 1, 0).state;
    expect(both.edges).toHaveLength(8);
    const sets = edgeSets(graphRepsStructure.view(both));
    expect(sets.matrix).toHaveLength(8);
  });

  it('merges opposite edges into one when switching to undirected', () => {
    const both = run('add', run('toggle', initial).state, 2, 1).state;
    const undirected = run('toggle', both).state;
    expect(undirected.directed).toBe(false);
    expect(undirected.edges).toEqual(initial.edges);
  });

  it('keeps all representations in agreement over random operations', () => {
    const r = rng(23);
    let state = initial;
    for (let i = 0; i < 200; i++) {
      const op = pick(r, ['add', 'add', 'remove', 'has', 'neighbours', 'toggle']);
      const { steps, state: next } = run(op, state, int(r, 0, 5), int(r, 0, 5));
      state = next;
      const sets = edgeSets(steps.at(-1)!.view);
      expect(sets.list).toEqual(sets.matrix);
      expect(sets.edgeList).toEqual(sets.matrix);
      expect(sets.graph).toEqual(sets.matrix);
      expect(sets.matrix).toEqual(edgeSets(graphRepsStructure.view(state)).matrix);
    }
  });
});
