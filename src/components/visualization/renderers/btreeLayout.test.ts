import { describe, expect, it } from 'vitest';
import type { BTreeView } from '../../../types/visualization';
import { KEY_WIDTH, layoutBTree } from './btreeLayout';

const node = (id: string, keys: string[], children: string[] = []) => ({ id, keys, children, leaf: children.length === 0, role: 'default' as const, matched: [] });

const view: BTreeView = {
  kind: 'btree',
  label: 'idx',
  root: 'r',
  nodes: [node('r', ['5'], ['a', 'b']), node('a', ['1', '3']), node('b', ['5', '7', '9'])],
};

describe('layoutBTree', () => {
  it('puts each level on its own row and sizes nodes by their keys', () => {
    const { nodes } = layoutBTree(view);
    const at = new Map(nodes.map((n) => [n.id, n]));
    expect(at.get('a')!.y).toBe(at.get('b')!.y);
    expect(at.get('r')!.y).toBeLessThan(at.get('a')!.y);
    expect(at.get('b')!.width).toBe(3 * KEY_WIDTH);
  });

  it('keeps leaves apart and centres a parent over its children', () => {
    const { nodes } = layoutBTree(view);
    const at = new Map(nodes.map((n) => [n.id, n]));
    expect(at.get('a')!.x + at.get('a')!.width).toBeLessThan(at.get('b')!.x);
    const centre = (id: string) => at.get(id)!.x + at.get(id)!.width / 2;
    expect(centre('r')).toBeCloseTo((centre('a') + centre('b')) / 2);
  });

  it('grows wider with more leaves', () => {
    const wider: BTreeView = { ...view, nodes: [node('r', ['5', '9'], ['a', 'b', 'c']), node('a', ['1']), node('b', ['5']), node('c', ['9'])] };
    expect(layoutBTree(wider).width).toBeGreaterThan(layoutBTree({ ...view, root: 'a', nodes: [node('a', ['1'])] }).width);
  });
});
