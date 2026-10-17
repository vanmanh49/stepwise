import { motion } from 'motion/react';
import type { CallsView } from '../../../types/visualization';
import { ROLE_META, roleBorder, roleFill, roleText } from '../roles';
import { callBoxWidth, layoutCalls } from './callsLayout';
import { spring } from './ValueBox';

const GAP = 12;
const ROW = 64;
const BOX_H = 30;
const PAD = 12;

/** A recursion tree: one rounded box per call, linked to the call that made it. */
export function CallsRenderer({ view }: { view: CallsView }) {
  if (view.frames.length === 0) {
    return <p className="rounded-xl border-2 border-dashed border-border px-6 py-3 text-sm text-muted">No calls yet</p>;
  }
  const layout = layoutCalls(view.frames);
  const boxWidth = callBoxWidth(view.frames);
  const column = boxWidth + GAP;
  const at = new Map(layout.map((p) => [p.id, { x: PAD + boxWidth / 2 + p.x * column, y: PAD + BOX_H / 2 + p.y * ROW }]));
  const width = PAD * 2 + boxWidth + Math.max(...layout.map((p) => p.x)) * column;
  const height = PAD * 2 + BOX_H + 18 + Math.max(...layout.map((p) => p.y)) * ROW;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Recursion tree with calls ${view.frames.map((f) => f.label).join(', ')}`}
      className="max-w-none shrink-0"
    >
      {view.frames.map((frame) => {
        const a = frame.parent === undefined ? undefined : at.get(frame.parent);
        const b = at.get(frame.id)!;
        if (!a) return null;
        return (
          <line
            key={`link-${frame.id}`}
            x1={a.x}
            y1={a.y + BOX_H / 2}
            x2={b.x}
            y2={b.y - BOX_H / 2}
            stroke="var(--text-muted)"
            strokeOpacity={frame.role === 'discarded' ? 0.3 : 0.6}
            strokeWidth={2}
          />
        );
      })}
      {view.frames.map((frame) => {
        const { x, y } = at.get(frame.id)!;
        const { cue, label: roleLabel } = ROLE_META[frame.role];
        return (
          <motion.g key={frame.id} initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} transition={spring}>
            {cue === 'ring' && (
              <rect x={-boxWidth / 2 - 4} y={-BOX_H / 2 - 4} width={boxWidth + 8} height={BOX_H + 8} rx={12} fill="none" stroke={roleFill(frame.role)} strokeWidth={2} />
            )}
            <rect
              x={-boxWidth / 2}
              y={-BOX_H / 2}
              width={boxWidth}
              height={BOX_H}
              rx={9}
              fill={roleFill(frame.role)}
              stroke={roleBorder(frame.role)}
              strokeWidth={cue === 'double' ? 4 : 2}
              strokeDasharray={cue === 'dashed' ? '5 4' : undefined}
              style={{ transition: 'fill 0.2s, stroke 0.2s' }}
            />
            <text textAnchor="middle" dominantBaseline="central" fill={roleText(frame.role)} className="font-mono text-[12px] font-semibold">
              {frame.label}
              {frame.role !== 'default' && <title>{roleLabel}</title>}
            </text>
            {frame.result !== undefined && (
              <text y={BOX_H / 2 + 12} textAnchor="middle" dominantBaseline="central" fill="var(--text)" className="font-mono text-[11px] font-semibold">
                → {frame.result}
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}
