import { compareValues, type SqlValue } from './values';

/** Most keys in one node, so a dozen rows already make a tree a few levels deep. */
export const MAX_KEYS = 3;

/** One indexed row: its key (one value per indexed column) and where the row lives. */
export interface BTreeEntry {
  key: SqlValue[];
  rowid: string;
}

/**
 * A node of a B+ tree. Inner nodes hold separator keys and children; leaves hold the entries and
 * link to the next leaf, so a range is read by walking along the leaves.
 */
export interface BTreeNode {
  id: string;
  keys: SqlValue[][];
  children: string[];
  entries: BTreeEntry[];
  next?: string;
}

export interface BTree {
  root: string;
  nodes: Map<string, BTreeNode>;
  /** Node ids level by level, root first; the last level is the leaves, left to right. */
  levels: string[][];
}

/** What a search looks for: values for the leading columns, then an optional range on the next one. */
export interface Bounds {
  equal: SqlValue[];
  low?: { value: SqlValue; inclusive: boolean };
  high?: { value: SqlValue; inclusive: boolean };
}

/** Compares two keys on their first `length` columns. */
function compareKeys(a: SqlValue[], b: SqlValue[], length = Math.max(a.length, b.length)): number {
  for (let i = 0; i < length; i++) {
    const c = compareValues(a[i] ?? null, b[i] ?? null);
    if (c !== 0) return c;
  }
  return 0;
}

/** Index of the first item whose key is not `before` the target. */
function firstNotBefore<T>(items: T[], keyOf: (item: T) => SqlValue[], before: (key: SqlValue[]) => boolean): number {
  let i = 0;
  while (i < items.length && before(keyOf(items[i]!))) i++;
  return i;
}

/**
 * Builds the index the way a database fills one: rows are inserted in table order, and a node
 * that grows past MAX_KEYS splits in two, pushing a separator up (a new root when the root splits).
 * Equal keys keep table order.
 */
export function buildBTree(entries: BTreeEntry[]): BTree {
  let count = 0;
  const nodes = new Map<string, BTreeNode>();
  const make = (fields: Partial<BTreeNode>): BTreeNode => {
    const n: BTreeNode = { id: `n${count++}`, keys: [], children: [], entries: [], ...fields };
    nodes.set(n.id, n);
    return n;
  };
  let root = make({});

  /** Inserts into the subtree; returns a separator and new right sibling when the node split. */
  const insert = (n: BTreeNode, entry: BTreeEntry): { key: SqlValue[]; right: BTreeNode } | undefined => {
    if (n.children.length === 0) {
      // After any equal keys, so duplicates stay in table order.
      n.entries.splice(firstNotBefore(n.entries, (e) => e.key, (k) => compareKeys(k, entry.key) <= 0), 0, entry);
      n.keys = n.entries.map((e) => e.key);
      if (n.entries.length <= MAX_KEYS) return undefined;
      const half = Math.ceil(n.entries.length / 2);
      const right = make({ entries: n.entries.slice(half), next: n.next });
      right.keys = right.entries.map((e) => e.key);
      n.entries = n.entries.slice(0, half);
      n.keys = n.entries.map((e) => e.key);
      n.next = right.id;
      return { key: right.keys[0]!, right };
    }
    const at = firstNotBefore(n.keys, (k) => k, (k) => compareKeys(k, entry.key) <= 0);
    const split = insert(nodes.get(n.children[at]!)!, entry);
    if (!split) return undefined;
    n.keys.splice(at, 0, split.key);
    n.children.splice(at + 1, 0, split.right.id);
    if (n.keys.length <= MAX_KEYS) return undefined;
    // The middle key moves up; the keys either side of it stay in the two halves.
    const middle = Math.floor(n.keys.length / 2);
    const up = n.keys[middle]!;
    const right = make({ keys: n.keys.slice(middle + 1), children: n.children.slice(middle + 1) });
    n.keys = n.keys.slice(0, middle);
    n.children = n.children.slice(0, middle + 1);
    return { key: up, right };
  };

  for (const entry of entries) {
    const split = insert(root, entry);
    if (split) root = make({ keys: [split.key], children: [root.id, split.right.id] });
  }

  const levels: string[][] = [];
  for (let level = [root.id]; level.length > 0; level = level.flatMap((id) => nodes.get(id)!.children)) levels.push(level);
  return { root: root.id, nodes, levels };
}

/**
 * Finds the entries within `bounds`: walks from the root to the leaf where the first match would
 * be, then along the leaves until an entry is past the bounds. `scanned` lists every leaf entry
 * looked at, including the one that ended the scan. NULL never matches.
 */
export function searchBTree(tree: BTree, bounds: Bounds): { path: string[]; scanned: BTreeEntry[]; rowids: string[] } {
  const prefix = bounds.equal.length;
  const start = [...bounds.equal, ...(bounds.low ? [bounds.low.value] : [])];
  const path = [tree.root];
  if (bounds.equal.includes(null) || bounds.low?.value === null || bounds.high?.value === null) return { path, scanned: [], rowids: [] };

  let node = tree.nodes.get(tree.root)!;
  while (node.children.length > 0) {
    // The leftmost child that can hold a key equal to `start`.
    const at = firstNotBefore(node.keys, (k) => k, (k) => compareKeys(k, start, start.length) < 0);
    node = tree.nodes.get(node.children[at]!)!;
    path.push(node.id);
  }

  const scanned: BTreeEntry[] = [];
  const rowids: string[] = [];
  for (let leaf: BTreeNode | undefined = node; leaf; leaf = leaf.next ? tree.nodes.get(leaf.next) : undefined) {
    for (const entry of leaf.entries) {
      const before = compareKeys(entry.key, start, start.length);
      if (before < 0) continue;
      scanned.push(entry);
      if (compareKeys(entry.key, bounds.equal, prefix) > 0) return { path, scanned, rowids };
      const value = entry.key[prefix] ?? null;
      if (bounds.high) {
        const c = value === null ? -1 : compareValues(value, bounds.high.value);
        if (c > 0 || (c === 0 && !bounds.high.inclusive)) return { path, scanned, rowids };
      }
      if (bounds.low && !bounds.low.inclusive && before === 0) continue;
      // With a range on this column, NULL sorts first but never matches.
      if ((bounds.low || bounds.high) && value === null) continue;
      rowids.push(entry.rowid);
    }
  }
  return { path, scanned, rowids };
}
