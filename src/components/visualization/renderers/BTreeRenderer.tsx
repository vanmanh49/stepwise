import { useEffect, useRef } from 'react';
import type { BTreeView } from '../../../types/visualization';
import { roleBorder, roleFill, roleText } from '../roles';
import { focusX, KEY_WIDTH, layoutBTree, NODE_HEIGHT } from './btreeLayout';

const PAD = 10;

/** An index as a B+ tree: the search path is highlighted, matching leaf keys are marked, and leaves link left to right. */
export function BTreeRenderer({ view }: { view: BTreeView }) {
  const layout = layoutBTree(view);
  const box = useRef<HTMLDivElement>(null);
  const focus = PAD + focusX(view, layout);
  // On a narrow screen the tree scrolls sideways; keep the node being searched in sight.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollTo({ left: Math.max(0, focus - el.clientWidth / 2), behavior: 'smooth' });
  }, [focus]);
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const leaves = view.nodes.filter((n) => n.leaf).map((n) => at.get(n.id)!).sort((a, b) => a.x - b.x);
  const width = layout.width + PAD * 2;
  const height = layout.height + PAD * 2;
  const leafCount = view.nodes.filter((n) => n.leaf).length;

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="font-mono text-xs text-muted">{view.label}</figcaption>
      <div ref={box} className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`B-tree ${view.label}: ${view.nodes.length} nodes, ${leafCount} leaves`}
          className="max-w-none"
        >
          {view.nodes.flatMap((node) =>
            node.children.map((child, i) => {
              const from = at.get(node.id)!;
              const to = at.get(child);
              if (!to) return null;
              return (
                <line
                  key={`${node.id}-${child}`}
                  // Child i hangs from the gap before key i, so smaller keys go left.
                  x1={PAD + from.x + Math.min(i * KEY_WIDTH, from.width)}
                  y1={PAD + from.y + NODE_HEIGHT}
                  x2={PAD + to.x + to.width / 2}
                  y2={PAD + to.y}
                  stroke="var(--text-muted)"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                />
              );
            }),
          )}
          {view.linked !== false && leaves.slice(1).map((leaf, i) => {
            const prev = leaves[i]!;
            return (
              <line
                key={`link-${leaf.id}`}
                x1={PAD + prev.x + prev.width}
                y1={PAD + leaf.y + NODE_HEIGHT / 2}
                x2={PAD + leaf.x}
                y2={PAD + leaf.y + NODE_HEIGHT / 2}
                stroke="var(--text-muted)"
                strokeDasharray="3 3"
                strokeWidth={1.5}
              />
            );
          })}
          {view.nodes.map((node) => {
            const p = at.get(node.id)!;
            const keys = node.keys.length > 0 ? node.keys : ['∅'];
            return (
              <g key={node.id}>
                {keys.map((key, k) => {
                  const role = node.matched.includes(k) ? 'found' : node.role;
                  return (
                    <g key={k}>
                      <rect
                        x={PAD + p.x + k * KEY_WIDTH}
                        y={PAD + p.y}
                        width={KEY_WIDTH}
                        height={NODE_HEIGHT}
                        rx={4}
                        fill={roleFill(role)}
                        stroke={roleBorder(role)}
                        strokeWidth={role === 'default' ? 1 : 2}
                        strokeDasharray={role === 'compare' ? '4 2' : undefined}
                      />
                      <text
                        x={PAD + p.x + k * KEY_WIDTH + KEY_WIDTH / 2}
                        y={PAD + p.y + NODE_HEIGHT / 2}
                        dominantBaseline="central"
                        textAnchor="middle"
                        className="font-mono text-[11px]"
                        fill={roleText(role)}
                      >
                        {key.length > 6 ? `${key.slice(0, 5)}…` : key}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
