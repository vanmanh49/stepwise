import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { traversalCode, traversalSteps, traversalStructure, traverse, type TraversalOrder } from './traversal';

const tree = [1, 2, 3, 4, 5, 6, 7];
const ORDERS: TraversalOrder[] = ['preorder', 'inorder', 'postorder', 'levelorder'];

/** Values in the order their nodes first become the active node. */
function activeOrder(steps: Step[]): number[] {
  const seen: string[] = [];
  const values: number[] = [];
  for (const step of steps) {
    if (step.view.kind !== 'tree') continue;
    for (const node of step.view.nodes) {
      if (node.role === 'active' && !seen.includes(node.id)) {
        seen.push(node.id);
        values.push(node.value);
      }
    }
  }
  return values;
}

describe('traverse', () => {
  it('visits a full tree in each order', () => {
    expect(traverse(tree, 'preorder')).toEqual([1, 2, 4, 5, 3, 6, 7]);
    expect(traverse(tree, 'inorder')).toEqual([4, 2, 5, 1, 6, 3, 7]);
    expect(traverse(tree, 'postorder')).toEqual([4, 5, 2, 6, 7, 3, 1]);
    expect(traverse(tree, 'levelorder')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles an incomplete tree, a single node and an empty tree', () => {
    expect(traverse([1, 2, 3, 4], 'inorder')).toEqual([4, 2, 1, 3]);
    expect(traverse([1, 2, 3, 4], 'postorder')).toEqual([4, 2, 3, 1]);
    for (const order of ORDERS) {
      expect(traverse([9], order)).toEqual([9]);
      expect(traverse([], order)).toEqual([]);
    }
  });
});

describe.each(ORDERS)('traversalSteps %s', (order) => {
  it('activates nodes in traversal order and reports the output', () => {
    for (const values of [tree, [1, 2, 3, 4], [5, 5, 5]]) {
      const steps = traversalSteps(values, order);
      expect(activeOrder(steps)).toEqual(traverse(values, order));
      expect(steps.at(-1)!.variables!.output).toBe(traverse(values, order).join(', '));
    }
  });

  it('explains every step and points at a real code line', () => {
    const lines = traversalCode.split('\n').length;
    for (const step of traversalSteps(tree, order)) {
      expect(step.view.kind).toBe('tree');
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });

  it('explains an empty tree in one step', () => {
    expect(traversalSteps([], order)).toHaveLength(1);
  });
});

describe('traversalStructure', () => {
  it('offers the four traversals and never changes the tree', () => {
    expect(traversalStructure.ops.map((op) => op.id)).toEqual(ORDERS);
    for (const op of traversalStructure.ops) {
      const result = op.run(traversalStructure.initial, [], []);
      expect(result.state).toEqual(traversalStructure.initial);
      expect(result.steps.length).toBeGreaterThan(2);
    }
  });
});
