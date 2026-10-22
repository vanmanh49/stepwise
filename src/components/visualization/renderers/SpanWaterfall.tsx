import type { ServicesView } from '../../../types/visualization';
import { roleBorder, roleFill } from '../roles';

type Spans = NonNullable<ServicesView['spans']>;

/** A trace as a waterfall: one row per span, indented by depth, its bar placed on a shared 0 → endMs timeline. */
export function SpanWaterfall({ spans }: { spans: Spans }) {
  const end = Math.max(1, spans.endMs);
  return (
    <section aria-label={spans.title} className="overflow-x-auto rounded-md border border-border p-2">
      <h3 className="mb-1 font-mono text-xs font-semibold text-muted">{spans.title}</h3>
      {spans.rows.length > 0 && (
        <ol className="min-w-[18rem] space-y-1 font-mono text-[11px]">
          {spans.rows.map((row) => {
            const [owner, ...rest] = row.label.split(' ');
            const open = row.ms === undefined;
            const left = (row.start / end) * 100;
            const width = Math.max(0.5, (((open ? end - row.start : row.ms!) / end) * 100));
            return (
              <li key={row.id} className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[11rem_1fr]">
                <span className="truncate" style={{ paddingLeft: `${row.depth * 12}px` }} title={`${row.label} (${row.trace})`}>
                  {owner}
                  {rest.length > 0 && <span className="hidden text-muted sm:inline"> {rest.join(' ')}</span>}
                </span>
                <span className="relative flex h-4 items-center">
                  <span
                    className={`absolute h-3 rounded-sm border ${open ? 'border-dashed' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%`, background: roleFill(row.role), borderColor: roleBorder(row.role) }}
                  />
                  <span className="absolute whitespace-nowrap pl-1 text-muted" style={{ left: `${Math.min(left + width, 85)}%` }}>
                    {open ? 'open' : `${row.ms} ms`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
