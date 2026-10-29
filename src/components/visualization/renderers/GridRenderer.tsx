import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { GridCell as Cell, GridView } from '../../../types/visualization';
import { ROLE_META } from '../roles';
import { gridCellStyle, heatStyle, isTextGrid } from './gridCellStyle';
import { spring } from './spring';

// Fixed cell geometry so arrows can be drawn from row and column indexes alone.
const CELL = 44;
const GAP = 6;
const STEP = CELL + GAP;

/** `fluid` cells size to their text and wrap, for grids of messages and sentences. */
function GridCell({ cell, fluid = false }: { cell: Cell; fluid?: boolean }) {
  const meta = ROLE_META[cell.role];
  return (
    <motion.div
      layoutId={cell.id}
      transition={spring}
      className={`relative flex items-center rounded-lg text-sm transition-colors duration-200 ${
        fluid ? 'justify-start break-words px-2 py-1.5 font-medium' : 'justify-center font-mono font-semibold'
      }`}
      style={{ ...(fluid ? { minWidth: CELL, minHeight: CELL } : { width: CELL, height: CELL }), ...gridCellStyle(cell.role), ...heatStyle(cell) }}
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

/** Rows of text as a table, so long cells wrap within the stage instead of spilling over their neighbours. */
function TextGrid({ view, columns, hasRowLabels }: { view: GridView; columns: number; hasRowLabels: boolean }) {
  return (
    <table className="w-full border-separate" style={{ borderSpacing: GAP }}>
      {view.colLabels && (
        <thead>
          <tr>
            {hasRowLabels && <td />}
            {Array.from({ length: columns }, (_, c) => (
              <th key={c} scope="col" className="text-left font-mono text-xs font-normal text-muted">
                {view.colLabels?.[c] ?? ''}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {view.rows.map((row, r) => (
          <tr key={r}>
            {hasRowLabels && (
              <th scope="row" className="whitespace-nowrap pr-1 text-right align-middle font-mono text-xs font-normal text-muted">
                {row.label}
              </th>
            )}
            {Array.from({ length: columns }, (_, c) => {
              const cell = row.cells[c];
              return <td key={cell?.id ?? `gap-${c}`} className="align-top">{cell && <GridCell cell={cell} fluid />}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GridRenderer({ view }: { view: GridView }) {
  const groupId = useId();
  const markerId = useId();
  const columns = Math.max(view.colLabels?.length ?? 0, ...view.rows.map((r) => r.cells.length));
  const hasRowLabels = view.rows.some((r) => r.label !== undefined);
  if (isTextGrid(view)) {
    return (
      <LayoutGroup id={groupId}>
        <TextGrid view={view} columns={columns} hasRowLabels={hasRowLabels} />
      </LayoutGroup>
    );
  }
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
