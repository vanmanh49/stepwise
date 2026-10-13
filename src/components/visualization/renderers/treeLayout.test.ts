import { describe, expect, it } from 'vitest';
import type { Cell, TreeView } from '../../../types/visualization';
import { heapToTree, layoutTree } from './treeLayout';

const cell = (value: number, i: number): Cell => ({ id: `c${i}`, value, role: 'default' });

describe('layoutTree', () => {
  it('places nodes left to right in sorted order and top to bottom by depth', () => {
    const view: TreeView = {
      kind: 'tree',
      root: 'n8',
      nodes: [
        { id: 'n8', value: 8, role: 'default', left: 'n3', right: 'n10' },
        { id: 'n3', value: 3, role: 'default' },
        { id: 'n10', value: 10, role: 'default' },
      ],
    };
    const at = Object.fromEntries(layoutTree(view).map((p) => [p.id, p]));
    expect(at['n3']!.x).toBeLessThan(at['n8']!.x);
    expect(at['n8']!.x).toBeLessThan(at['n10']!.x);
    expect(at['n8']!.y).toBe(0);
    expect(at['n3']!.y).toBe(1);
    expect(at['n10']!.y).toBe(1);
  });

  it('returns nothing for an empty tree', () => {
    expect(layoutTree({ kind: 'tree', nodes: [] })).toEqual([]);
  });
});

describe('heapToTree', () => {
  it('links each index to the children at 2i+1 and 2i+2', () => {
    const tree = heapToTree([50, 30, 40, 10, 20].map(cell));
    const at = Object.fromEntries(tree.nodes.map((n) => [n.id, n]));
    expect(tree.root).toBe('c0');
    expect([at['c0']!.left, at['c0']!.right]).toEqual(['c1', 'c2']);
    expect([at['c1']!.left, at['c1']!.right]).toEqual(['c3', 'c4']);
    expect([at['c2']!.left, at['c2']!.right]).toEqual([undefined, undefined]);
  });

  it('keeps roles and handles an empty heap', () => {
    expect(heapToTree([{ id: 'a', value: 1, role: 'swap' }]).nodes[0]!.role).toBe('swap');
    expect(heapToTree([])).toEqual({ kind: 'tree', nodes: [] });
  });
});
