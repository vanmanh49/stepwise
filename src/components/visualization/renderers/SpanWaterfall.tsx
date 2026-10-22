import type { ServicesView } from '../../../types/visualization';
import { roleBorder, roleFill } from '../roles';

type Spans = NonNullable<ServicesView['spans']>;

/** A trace as a waterfall: one row per span, indented by depth, its bar on a shared 0 → endMs timeline, then its length. */
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
            // An open span reaches the step's time: it is still running.
            const length = open ? Math.max(0, spans.nowMs - row.start) : row.ms!;
            return (
              <li key={row.id} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 sm:grid-cols-[11rem_1fr_4rem]">
                <span className="truncate" style={{ paddingLeft: `${row.depth * 12}px` }} title={`${row.label} (${row.trace})`}>
                  {owner}
                  {rest.length > 0 && <span className="hidden text-muted sm:inline"> {rest.join(' ')}</span>}
                </span>
                <span className="relative h-3">
                  <span
                    className={`absolute inset-y-0 rounded-sm border ${open ? 'border-dashed' : ''}`}
                    style={{ left: `${(row.start / end) * 100}%`, width: `max(2px, ${(length / end) * 100}%)`, background: roleFill(row.role), borderColor: roleBorder(row.role) }}
                  />
                </span>
                <span className="text-right text-muted">{open ? `${length} ms…` : `${row.ms} ms`}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
