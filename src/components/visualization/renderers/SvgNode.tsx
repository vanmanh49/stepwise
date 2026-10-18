import { motion } from 'motion/react';
import type { Role } from '../../../types/visualization';
import { ROLE_META, roleBorder, roleFill, roleText } from '../roles';
import { spring } from './spring';

export const NODE_RADIUS = 20;

/** A circular node for SVG renderers, with the same role cues as ValueBox. */
export function SvgNode({
  x,
  y,
  role,
  label,
  badge,
  tone,
}: {
  x: number;
  y: number;
  role: Role;
  label: string | number;
  badge?: string;
  /** A red-black node's colour: the fill when the node is untouched, else a thick border. */
  tone?: 'red' | 'black';
}) {
  const { cue, mark, label: roleLabel } = ROLE_META[role];
  const r = NODE_RADIUS;
  const toned = tone !== undefined && role === 'default';
  const fill = toned ? `var(--node-${tone})` : roleFill(role);
  const stroke = tone === undefined ? roleBorder(role) : toned ? 'var(--text-muted)' : `var(--node-${tone})`;
  const strokeWidth = tone !== undefined && !toned ? 4 : cue === 'double' ? 4 : 2;
  return (
    <motion.g initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} transition={spring}>
      {cue === 'ring' && <circle r={r + 5} fill="none" stroke={roleFill(role)} strokeWidth={2} />}
      <circle
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={cue === 'dashed' ? '5 4' : undefined}
        style={{ transition: 'fill 0.2s, stroke 0.2s' }}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={toned ? 'var(--node-on-color)' : roleText(role)}
        className="font-mono text-[13px] font-semibold"
      >
        {label}
        {(role !== 'default' || tone) && <title>{[tone, role !== 'default' && roleLabel].filter(Boolean).join(', ')}</title>}
      </text>
      {mark && (
        <g transform={`translate(${r * 0.78}, ${-r * 0.78})`} aria-hidden>
          <circle r={8.5} fill="var(--surface)" stroke="var(--border)" />
          <text textAnchor="middle" dominantBaseline="central" fill="var(--text)" className="text-[10px]">
            {mark}
          </text>
        </g>
      )}
      {badge !== undefined && (
        <g transform={`translate(0, ${-r - 15})`}>
          <rect x={-17} y={-10} width={34} height={20} rx={10} fill="var(--surface)" stroke="var(--border)" />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text)"
            className="font-mono text-[11px] font-semibold"
          >
            {badge}
          </text>
        </g>
      )}
    </motion.g>
  );
}
