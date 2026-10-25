import { Fragment } from 'react';
import type { DistributionView } from '../../../types/visualization';
import { ROLE_META, roleBoxStyle } from '../roles';

/** One labelled bar per entry, widths relative to the largest; a marker before the first cut bar. */
export function DistributionRenderer({ view }: { view: DistributionView }) {
  const max = Math.max(...view.bars.map((b) => Math.abs(b.value)), 1e-9);
  const showCut = view.cutoff !== undefined && view.cutoff < view.bars.length;
  return (
    <figure className="mx-auto w-full max-w-xl">
      {view.title && <figcaption className="mb-3 text-center font-mono text-xs text-muted">{view.title}</figcaption>}
      <div className="grid grid-cols-[minmax(3.5rem,auto)_1fr_3rem] items-center gap-x-2 gap-y-1.5 font-mono text-xs">
        {view.bars.map((bar, i) => (
          <Fragment key={bar.id}>
            {showCut && i === view.cutoff && (
              <div className="col-span-3 flex items-center gap-2 text-[11px] text-muted">
                <span className="h-0 flex-1 border-t-2 border-dashed border-border" />
                cut below
                <span className="h-0 flex-1 border-t-2 border-dashed border-border" />
              </div>
            )}
            <span className="truncate text-right font-semibold">
              {bar.label}
              {view.target === i && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">target</span>}
            </span>
            <div className="h-5 rounded-md bg-surface-2">
              <div
                className="h-full rounded-md transition-[width] duration-300"
                style={{
                  // The default role's fill matches the track, so default bars take a tint of the accent instead.
                  ...(bar.role === 'default' ? { background: 'color-mix(in oklab, var(--accent) 55%, var(--surface))' } : roleBoxStyle(bar.role)),
                  borderWidth: 0,
                  width: `${(Math.abs(bar.value) / max) * 100}%`,
                }}
              />
            </div>
            <span className="text-right tabular-nums">
              {bar.value.toFixed(2)}
              {bar.role !== 'default' && <span className="sr-only"> ({ROLE_META[bar.role].label})</span>}
            </span>
          </Fragment>
        ))}
      </div>
    </figure>
  );
}
