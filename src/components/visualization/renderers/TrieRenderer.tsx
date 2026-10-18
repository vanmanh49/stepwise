import { useEffect, useRef } from 'react';
import type { TrieView } from '../../../types/visualization';
import { roleBorder, roleFill } from '../roles';
import { layoutCalls } from './callsLayout';
import { NODE_RADIUS, SvgNode } from './SvgNode';

const X_GAP = 50;
const Y_GAP = 72;
const PAD = NODE_RADIUS + 12;
const ROOT_RADIUS = 8;
/** Room under the deepest row for a word label. */
const WORD_ROOM = 16;

/** A trie: one circle per letter, the root as a small empty circle, and each word written under the node that ends it. */
export function TrieRenderer({ view }: { view: TrieView }) {
  const layout = layoutCalls(view.nodes);
  const at = new Map(layout.map((p) => [p.id, { x: PAD + p.x * X_GAP, y: PAD + p.y * Y_GAP }]));
  const width = PAD * 2 + Math.max(0, ...layout.map((p) => p.x)) * X_GAP;
  const height = PAD * 2 + WORD_ROOM + Math.max(0, ...layout.map((p) => p.y)) * Y_GAP;
  const box = useRef<HTMLDivElement>(null);
  // On a narrow screen the trie scrolls sideways; keep the node being worked on in sight.
  const focus = at.get(view.nodes.find((n) => n.role !== 'default' && n.role !== 'visited')?.id ?? '')?.x;
  useEffect(() => {
    const el = box.current;
    if (focus !== undefined && el && el.scrollWidth > el.clientWidth) el.scrollTo({ left: Math.max(0, focus - el.clientWidth / 2), behavior: 'smooth' });
  }, [focus]);
  const words = view.nodes.flatMap((n) => (n.word ? [n.word] : []));

  return (
    <div ref={box} className="max-w-full overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={words.length > 0 ? `Trie with words ${words.join(', ')}` : 'Empty trie'}
        className="max-w-none"
      >
        {view.nodes.map((node) => {
          const a = node.parent === undefined ? undefined : at.get(node.parent);
          const b = at.get(node.id)!;
          if (!a) return null;
          return (
            <line
              key={`link-${node.id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--text-muted)"
              strokeOpacity={node.role === 'discarded' ? 0.3 : 0.55}
              strokeWidth={2}
            />
          );
        })}
        {view.nodes.map((node) => {
          const { x, y } = at.get(node.id)!;
          if (node.parent === undefined) {
            return <circle key={node.id} cx={x} cy={y} r={ROOT_RADIUS} fill={roleFill(node.role)} stroke={roleBorder(node.role)} strokeWidth={2} />;
          }
          return (
            <g key={node.id}>
              <SvgNode x={x} y={y} role={node.role} label={node.letter} />
              {node.word && (
                <text
                  x={x}
                  y={y + NODE_RADIUS + 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--text)"
                  // A halo in the background colour keeps the word readable where an edge passes behind it.
                  stroke="var(--surface)"
                  strokeWidth={4}
                  paintOrder="stroke"
                  className="font-mono text-[11px] font-semibold"
                >
                  {node.word}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
