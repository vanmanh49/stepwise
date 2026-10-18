import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { Cell, GridView } from '../../../types/visualization';
import { ROLE_META } from '../roles';
import { gridCellStyle } from './gridCellStyle';
import { spring } from './spring';

// Fixed cell geometry so arrows can be drawn from row and column indexes alone.
const CELL = 44;
const GAP = 6;
const STEP = CELL + GAP;

function GridCell({ cell }: { cell: Cell }) {
  const meta = ROLE_META[cell.role];
  return (
    <motion.div
      layoutId={cell.id}
      transition={spring}
      className="relative flex items-center justify-center rounded-lg font-mono text-sm font-semibold transition-colors duration-200"
      style={{ width: CELL, height: CELL, ...gridCellStyle(cell.role) }}
    >
      {cell.value}
      {meta.mark && cell.role !== 'default' && (
        <span
          aria-hidden
          className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-surface px-0.5 text-[9px] leading-none text-text"
        >
          {meta.mark}
        </span>
      )}
      {cell.role !== 'default' && <span className="sr-only"> ({meta.label})</span>}
    </motion.div>
  );
}

export function GridRenderer({ view }: { view: GridView }) {
  const groupId = useId();
  const markerId = useId();
  const columns = Math.max(view.colLabels?.length ?? 0, ...view.rows.map((r) => r.cells.length));
  const hasRowLabels = view.rows.some((r) => r.label !== undefined);
  const width = columns * STEP - GAP;
  const height = view.rows.length * STEP - GAP;
  const centre = ([row, col]: [number, number]) => ({ x: col * STEP + CELL / 2, y: row * STEP + CELL / 2 });

  return (
    <LayoutGroup id={groupId}>
      <div className="flex gap-2">
        {hasRowLabels && (
          <div className="flex flex-col" style={{ gap: GAP, paddingTop: view.colLabels ? 22 : 0 }}>
            {view.rows.map((row, r) => (
              <span key={r} className="flex items-center justify-end font-mono text-xs text-muted" style={{ height: CELL }}>
                {row.label}
              </span>
            ))}
          </div>
        )}
        <div>
          {view.colLabels && (
            <div className="mb-1 flex" style={{ gap: GAP }}>
              {Array.from({ length: columns }, (_, c) => (
                <span key={c} className="text-center font-mono text-xs text-muted" style={{ width: CELL, height: 18 }}>
                  {view.colLabels?.[c] ?? ''}
                </span>
              ))}
            </div>
          )}
          <div className="relative" style={{ width, height }}>
            <div className="flex flex-col" style={{ gap: GAP }}>
              {view.rows.map((row, r) => (
                <div key={r} className="flex" style={{ gap: GAP }}>
                  {Array.from({ length: columns }, (_, c) => {
                    const cell = row.cells[c];
                    return cell ? <GridCell key={cell.id} cell={cell} /> : <div key={`gap-${c}`} style={{ width: CELL, height: CELL }} />;
                  })}
                </div>
              ))}
            </div>
            {view.arrows && view.arrows.length > 0 && (
              <svg width={width} height={height} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
                <defs>
                  <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--text)" />
                  </marker>
                </defs>
                {view.arrows.map((arrow, i) => {
                  const a = centre(arrow.from);
                  const b = centre(arrow.to);
                  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                  const trim = CELL / 2 - 4;
                  return (
                    <line
                      key={i}
                      x1={a.x + ((b.x - a.x) / length) * trim}
                      y1={a.y + ((b.y - a.y) / length) * trim}
                      x2={b.x - ((b.x - a.x) / length) * trim}
                      y2={b.y - ((b.y - a.y) / length) * trim}
                      stroke="var(--text)"
                      strokeOpacity={0.55}
                      strokeWidth={2}
                      markerEnd={`url(#${markerId})`}
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </LayoutGroup>
  );
}
