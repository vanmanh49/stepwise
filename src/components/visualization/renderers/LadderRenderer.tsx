import type { LadderView } from '../../../types/visualization';
import { roleBorder } from '../roles';

const ROW_HEIGHT = 38;
/** How far from the middle (in %) a hop's label stops being centred, or it would run off the figure. */
const CENTRED_WITHIN = 10;

/** Packets as arrows between device lifelines. A lost packet stops halfway across. */
export function LadderRenderer({ view }: { view: LadderView }) {
  const { columns, rows, earlier } = view;
  const at = (id: string) => (columns.findIndex((column) => column.id === id) + 0.5) * (100 / columns.length);
  const name = (id: string) => columns.find((column) => column.id === id)?.label ?? id;
  return (
    <figure className="w-[min(34rem,calc(100vw-4rem))] max-w-full font-mono text-[11px]">
      <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => (
          <div key={column.id} className="min-w-0 px-0.5">
            <div className="truncate text-xs font-semibold">{column.label}</div>
            <div className="truncate text-muted">{column.state ?? ' '}</div>
          </div>
        ))}
      </div>
      {earlier ? <p className="mt-1 text-center text-muted">{earlier} earlier packets</p> : null}
      <div className="relative mt-1" style={{ minHeight: ROW_HEIGHT }}>
        {columns.map((column) => (
          <span key={column.id} aria-hidden className="absolute inset-y-0 border-l border-border" style={{ left: `${at(column.id)}%` }} />
        ))}
        <ol className="relative list-none p-0">
        {rows.map((row) => {
          const from = at(row.from);
          const to = at(row.to);
          const end = row.lost ? (from + to) / 2 : to;
          const middle = (from + to) / 2;
          const centred = Math.abs(middle - 50) <= CENTRED_WITHIN;
          const color = row.role === 'default' ? 'var(--text-muted)' : roleBorder(row.role);
          return (
            <li key={row.id} className="relative" style={{ height: ROW_HEIGHT }}>
              <span className="sr-only">
                {name(row.from)} to {name(row.to)}: {row.lost ? 'lost: ' : ''}
              </span>
              <span className={`absolute top-0.5 whitespace-nowrap rounded bg-surface px-1 ${centred ? '-translate-x-1/2' : ''}`} style={centred ? { left: `${middle}%` } : middle < 50 ? { left: 0 } : { right: 0 }}>
                {row.label}
              </span>
              <span aria-hidden className="absolute" style={{ left: `${Math.min(from, end)}%`, width: `${Math.abs(end - from)}%`, top: ROW_HEIGHT - 12, borderTop: `2px ${row.lost ? 'dashed' : 'solid'} ${color}` }} />
              <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2 leading-none" style={{ left: `${end}%`, top: ROW_HEIGHT - 11, color }}>
                {row.lost ? '×' : to > from ? '▸' : '◂'}
              </span>
            </li>
          );
        })}
        </ol>
      </div>
    </figure>
  );
}
