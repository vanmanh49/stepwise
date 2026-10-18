import { motion } from 'motion/react';
import type { TreeView } from '../../../types/visualization';
import { NODE_RADIUS, SvgNode } from './SvgNode';
import { layoutTree } from './treeLayout';
import { spring } from './ValueBox';

const X_GAP = 54;
const Y_GAP = 66;
const PAD = NODE_RADIUS + 14;
const BADGE_ROOM = 22;

export function TreeRenderer({ view }: { view: TreeView }) {
  const layout = layoutTree(view);
  if (layout.length === 0) {
    return <p className="rounded-xl border-2 border-dashed border-border px-6 py-3 text-sm text-muted">Empty tree</p>;
  }

  // Badges sit above their node, so the top needs room for one.
  const top = view.nodes.some((n) => n.badge !== undefined) ? PAD + BADGE_ROOM : PAD;
  const at = new Map(layout.map((p) => [p.id, { x: PAD + p.x * X_GAP, y: top + p.y * Y_GAP }]));
  const width = PAD * 2 + (layout.length - 1) * X_GAP;
  const height = top + PAD + Math.max(...layout.map((p) => p.y)) * Y_GAP;
  const edges = view.nodes.flatMap((node) =>
    [node.left, node.right].filter((child): child is string => child !== undefined).map((child) => [node.id, child] as const),
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Tree with ${view.nodes.length} nodes: ${view.nodes.map((n) => (n.color ? `${n.value} ${n.color}` : n.value)).join(', ')}`}
      className="max-w-none overflow-visible"
    >
      {edges.map(([from, to]) => {
        const a = at.get(from);
        const b = at.get(to);
        if (!a || !b) return null;
        return (
          <motion.line
            key={`${from}-${to}`}
            initial={{ opacity: 0, x1: a.x, y1: a.y, x2: b.x, y2: b.y }}
            animate={{ opacity: 1, x1: a.x, y1: a.y, x2: b.x, y2: b.y }}
            transition={spring}
            stroke="var(--text-muted)"
            strokeOpacity={0.55}
            strokeWidth={2}
          />
        );
      })}
      {view.nodes.map((node) => {
        const p = at.get(node.id);
        return p ? <SvgNode key={node.id} x={p.x} y={p.y} role={node.role} label={node.value} badge={node.badge} tone={node.color} /> : null;
      })}
    </svg>
  );
}
