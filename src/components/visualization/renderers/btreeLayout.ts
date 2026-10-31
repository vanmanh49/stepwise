import type { BTreeView } from '../../../types/visualization';

export const KEY_WIDTH = 46;
export const NODE_HEIGHT = 30;
const LEAF_GAP = 14;
const LEVEL_GAP = 52;

interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Leaves sit side by side on the bottom row; each inner node is centred over its children, one row
 * per level. Every key gets the same width, so a node's width shows how full it is.
 */
export function layoutBTree(view: BTreeView): { nodes: PlacedNode[]; width: number; height: number } {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const widthOf = (id: string) => Math.max(1, byId.get(id)?.keys.length ?? 1) * KEY_WIDTH;
  const levels: string[][] = [];
  for (let level = [view.root]; level.length > 0; level = level.flatMap((id) => byId.get(id)?.children ?? [])) levels.push(level);
  const placed = new Map<string, PlacedNode>();
  const y = (depth: number) => depth * (NODE_HEIGHT + LEVEL_GAP);
  let x = 0;
  for (const id of levels.at(-1) ?? []) {
    placed.set(id, { id, x, y: y(levels.length - 1), width: widthOf(id) });
    x += widthOf(id) + LEAF_GAP;
  }
  for (let depth = levels.length - 2; depth >= 0; depth--) {
    for (const id of levels[depth]!) {
      const kids = (byId.get(id)?.children ?? []).map((c) => placed.get(c)!).filter(Boolean);
      const centre = kids.length > 0 ? (kids[0]!.x + kids[0]!.width / 2 + kids.at(-1)!.x + kids.at(-1)!.width / 2) / 2 : 0;
      placed.set(id, { id, x: centre - widthOf(id) / 2, y: y(depth), width: widthOf(id) });
    }
  }
  const nodes = [...placed.values()];
  const left = Math.min(0, ...nodes.map((n) => n.x));
  for (const n of nodes) n.x -= left;
  return { nodes, width: Math.max(...nodes.map((n) => n.x + n.width)), height: y(levels.length - 1) + NODE_HEIGHT };
}

/** Where a narrow screen should scroll to: the node being searched, else the first leaf with a match, else the root. */
export function focusX(view: BTreeView, layout: { nodes: PlacedNode[] }): number {
  const target = view.nodes.find((n) => n.role === 'active') ?? view.nodes.find((n) => n.leaf && n.matched.length > 0) ?? view.nodes.find((n) => n.id === view.root);
  const placed = layout.nodes.find((p) => p.id === target?.id);
  return placed ? placed.x + placed.width / 2 : 0;
}
