import type { ClusterView } from '../../../types/visualization';
import { ROLE_META, roleBoxStyle } from '../roles';
import { sparkPath } from './chartPath';

/** A labelled horizontal bar: CPU or memory used against capacity, with an optional limit tick. */
export function Meter({ label, used, max, text, limit }: { label: string; used: number; max: number; text: string; limit?: number }) {
  const pct = (x: number) => `${Math.min(100, (x / Math.max(max, 1)) * 100)}%`;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} className="flex items-center gap-2 font-mono text-[10px]">
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--border)]">
        <span className="block h-full rounded-full bg-[color:var(--text-muted)]" style={{ width: pct(used) }} />
        {limit !== undefined && <span aria-hidden className="absolute top-0 h-full w-0.5 bg-[color:var(--text)]" style={{ left: pct(limit) }} />}
      </span>
      {text}
    </div>
  );
}

/** Requests per second now, with the curve so far as a small sparkline. */
export function TrafficStrip({ traffic }: { traffic: NonNullable<ClusterView['traffic']> }) {
  const w = 120;
  const h = 24;
  const top = Math.max(1, ...traffic.points);
  const path = sparkPath(traffic.points, w, h, top);
  return (
    <section aria-label={`Traffic: ${traffic.rps} requests per second`} className="flex items-center gap-3 rounded-lg border border-border px-2 py-1.5 font-mono text-xs">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Traffic</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="max-w-[40%] shrink">
        {path && <path d={path} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />}
      </svg>
      <span>{traffic.rps} req/s</span>
    </section>
  );
}

/** The scheduler's decision for one pod: why each node was ruled out, or its score per plugin. */
export function ScoringTable({ scoring }: { scoring: NonNullable<ClusterView['scoring']> }) {
  const plugins = [...new Set(scoring.rows.flatMap((r) => Object.keys(r.scores ?? {})))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-collapse text-left font-mono text-xs">
        <caption className="mb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Scheduler: placing {scoring.pod}</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-1 pr-2 font-semibold">Node</th>
            {plugins.map((p) => (
              <th key={p} scope="col" className="pb-1 pr-2 font-semibold">
                {p}
              </th>
            ))}
            <th scope="col" className="pb-1 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {scoring.rows.map((r) => (
            <tr key={r.node} className="border-t border-border align-top">
              <td className="whitespace-nowrap py-1 pr-2">
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5" style={roleBoxStyle(r.role)}>
                  {ROLE_META[r.role].mark && <span aria-hidden>{ROLE_META[r.role].mark}</span>}
                  {r.node}
                </span>
              </td>
              {r.filtered ? (
                <td colSpan={plugins.length + 1} className="py-1 font-sans text-[11px] text-muted">
                  ruled out: {r.filtered}
                </td>
              ) : (
                <>
                  {plugins.map((p) => (
                    <td key={p} className="py-1 pr-2">
                      {r.scores?.[p] ?? ''}
                    </td>
                  ))}
                  <td className="py-1 font-semibold">{r.total}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
