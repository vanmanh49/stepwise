import type { CallFrame } from '../../../types/visualization';

/**
 * Leaves take consecutive columns in call order and each parent sits midway
 * between its first and last child, so frames never overlap whatever the
 * number of children. y is the depth. Frames whose parent is missing are roots.
 * Works for any tree given as parent links, such as a trie.
 */
export function layoutCalls(frames: { id: string; parent?: string }[]): { id: string; x: number; y: number }[] {
  const ids = new Set(frames.map((f) => f.id));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const frame of frames) {
    if (frame.parent !== undefined && ids.has(frame.parent)) {
      children.set(frame.parent, [...(children.get(frame.parent) ?? []), frame.id]);
    } else {
      roots.push(frame.id);
    }
  }

  const placed = new Map<string, { x: number; y: number }>();
  let column = 0;
  const walk = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    const x = kids.length === 0 ? column++ : (() => {
      const xs = kids.map((kid) => walk(kid, depth + 1));
      return (xs[0]! + xs[xs.length - 1]!) / 2;
    })();
    placed.set(id, { x, y: depth });
    return x;
  };
  for (const root of roots) walk(root, 0);

  return frames.map((f) => ({ id: f.id, ...placed.get(f.id)! }));
}

const MIN_BOX = 72;
/** Width of one character of the 12px monospace frame label. */
const CHAR = 7.2;
const PADDING = 10;

/** One width for every frame box, wide enough for the longest label. */
export function callBoxWidth(frames: CallFrame[]): number {
  const longest = Math.max(0, ...frames.map((f) => f.label.length));
  return Math.max(MIN_BOX, Math.ceil(longest * CHAR + PADDING));
}
