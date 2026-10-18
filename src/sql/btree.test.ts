import { describe, expect, it } from 'vitest';
import { buildBTree, MAX_KEYS, searchBTree, type BTree, type BTreeEntry, type BTreeNode } from './btree';
import type { SqlValue } from './values';

const entries = (keys: SqlValue[]): BTreeEntry[] => keys.map((k, i) => ({ key: [k], rowid: `t#${i}` }));
const node = (tree: BTree, id: string): BTreeNode => tree.nodes.get(id)!;
const leaves = (tree: BTree) => tree.levels.at(-1)!.map((id) => node(tree, id));
const leafKeys = (tree: BTree) => leaves(tree).flatMap((l) => l.entries.map((e) => e.key[0]));

function checkShape(tree: BTree) {
  for (const id of tree.nodes.keys()) {
    const n = node(tree, id);
    expect(n.keys.length).toBeLessThanOrEqual(MAX_KEYS);
    if (n.children.length > 0) expect(n.children).toHaveLength(n.keys.length + 1);
  }
  // Every leaf sits on the last level, linked left to right.
  const last = tree.levels.at(-1)!;
  last.forEach((id, i) => expect(node(tree, id).next).toBe(last[i + 1]));
  expect(tree.levels[0]).toEqual([tree.root]);
}

// The company salaries, in table order.
const salaries = [9000, 7000, 6500, 5200, 5200, 5400, 4100, 4800, 4800, 3900, 3600, 3000];

describe('buildBTree', () => {
  it('makes one empty leaf for no entries and one leaf for up to 3', () => {
    expect(buildBTree([]).levels).toEqual([[buildBTree([]).root]]);
    const three = buildBTree(entries([3, 1, 2]));
    expect(three.levels).toHaveLength(1);
    expect(leafKeys(three)).toEqual([1, 2, 3]);
  });

  it('splits 4 entries into two leaves under a root', () => {
    const tree = buildBTree(entries([4, 3, 2, 1]));
    expect(tree.levels.map((l) => l.length)).toEqual([1, 2]);
    expect(leaves(tree).map((l) => l.entries.length)).toEqual([2, 2]);
    expect(node(tree, tree.root).keys).toEqual([[3]]);
    checkShape(tree);
  });

  it('builds 12 entries into 3 levels', () => {
    const tree = buildBTree(entries(salaries));
    expect(tree.levels).toHaveLength(3);
    expect(leafKeys(tree)).toEqual(salaries.toSorted((a, b) => a - b));
    checkShape(tree);
  });

  it('stays balanced with 40 entries', () => {
    const tree = buildBTree(entries(Array.from({ length: 40 }, (_, i) => (i * 7) % 40)));
    expect(leafKeys(tree)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(tree.levels).toHaveLength(4);
    checkShape(tree);
  });

  it('keeps equal keys in table order and sorts NULL first', () => {
    const tree = buildBTree(entries([5, null, 5, 1]));
    expect(leaves(tree).flatMap((l) => l.entries.map((e) => e.rowid))).toEqual(['t#1', 't#3', 't#0', 't#2']);
  });
});

describe('searchBTree', () => {
  const tree = buildBTree(entries(salaries));
  const search = (bounds: Parameters<typeof searchBTree>[1]) => searchBTree(tree, bounds);
  const found = (bounds: Parameters<typeof searchBTree>[1]) => search(bounds).rowids.map((r) => salaries[Number(r.split('#')[1])]);

  it('walks from the root to a leaf', () => {
    const { path } = search({ equal: [5400] });
    expect(path).toHaveLength(3);
    expect(path[0]).toBe(tree.root);
    expect(node(tree, path.at(-1)!).children).toEqual([]);
  });

  it('finds equal keys, including duplicates across leaves', () => {
    expect(found({ equal: [5200] })).toEqual([5200, 5200]);
    expect(found({ equal: [4800] })).toEqual([4800, 4800]);
    expect(found({ equal: [1] })).toEqual([]);
  });

  it('finds ranges and stops scanning after the last match', () => {
    expect(found({ equal: [], low: { value: 5000, inclusive: false } })).toEqual([5200, 5200, 5400, 6500, 7000, 9000]);
    expect(found({ equal: [], high: { value: 4000, inclusive: true } })).toEqual([3000, 3600, 3900]);
    expect(found({ equal: [], low: { value: 4800, inclusive: true }, high: { value: 5200, inclusive: false } })).toEqual([4800, 4800]);
    const { scanned, rowids } = search({ equal: [], high: { value: 4000, inclusive: true } });
    // The three matches, then the entry that ends the scan.
    expect(scanned).toHaveLength(rowids.length + 1);
  });

  it('searches composite keys on the leading columns plus a range', () => {
    const rows: [SqlValue, SqlValue][] = [[2, 7000], [3, 6500], [2, 5200], [2, 5400], [3, 4800], [null, 3000]];
    const composite = buildBTree(rows.map((key, i) => ({ key, rowid: `e#${i}` })));
    expect(searchBTree(composite, { equal: [2], low: { value: 5300, inclusive: false } }).rowids).toEqual(['e#3', 'e#0']);
    expect(searchBTree(composite, { equal: [3] }).rowids).toEqual(['e#4', 'e#1']);
  });

  it('never matches NULL', () => {
    const withNull = buildBTree(entries([null, 1, 2]));
    expect(searchBTree(withNull, { equal: [null] }).rowids).toEqual([]);
    expect(searchBTree(withNull, { equal: [], high: { value: 5, inclusive: true } }).rowids).toEqual(['t#1', 't#2']);
  });
});
