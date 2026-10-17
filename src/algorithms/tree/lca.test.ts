import { describe, expect, it } from 'vitest';
import { bstStructure } from '../../data-structures/bst';
import type { Step } from '../../types/visualization';
import { lcaCode, lcaStructure, lowestCommonAncestor } from './lca';

const tree = [8, 3, 1, 6, 10, 14];
const lcaOp = lcaStructure.ops[0]!;

function expectExplained(steps: Step[]) {
  const lines = lcaCode.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.view.kind).toBe('tree');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

describe('lowestCommonAncestor', () => {
  it.each([
    [1, 6, 3],
    [1, 14, 8],
    [10, 14, 10],
    [6, 6, 6],
    [14, 1, 8],
  ])('LCA(%i, %i) is %i', (a, b, expected) => {
    expect(lowestCommonAncestor(tree, a, b)).toBe(expected);
  });

  it('is null when a value is missing', () => {
    expect(lowestCommonAncestor(tree, 1, 99)).toBeNull();
  });
});

describe('lcaStructure', () => {
  it('runs LCA first, so it is the default operation', () => {
    expect(lcaOp.id).toBe('lca');
    expect(lcaOp.args.map((a) => a.sample)).toEqual([1, 6]);
  });

  it.each([
    [1, 6],
    [1, 14],
    [10, 14],
    [6, 6],
  ])('marks exactly the answer as found for LCA(%i, %i)', (a, b) => {
    const { steps, state } = lcaOp.run(tree, [a, b]);
    expect(state).toEqual(tree);
    const last = steps[steps.length - 1]!.view;
    const found = last.kind === 'tree' ? last.nodes.filter((n) => n.role === 'found') : [];
    expect(found.map((n) => n.value)).toEqual([lowestCommonAncestor(tree, a, b)]);
    expectExplained(steps);
  });

  it('refuses a missing value with one step', () => {
    const { steps } = lcaOp.run(tree, [1, 99]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('99');
  });

  it('keeps the insert code lines in step with the binary search tree lesson', () => {
    expect(lcaCode.split('\n').slice(0, 6)).toEqual(bstStructure.code.split('\n').slice(0, 6));
    expect(lcaStructure.ops.map((op) => op.id)).toEqual(['lca', 'insert']);
  });
});
