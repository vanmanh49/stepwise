import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { COMPLEXITIES, formatOps, type Complexity } from './complexities';

const W = 640;
const H = 340;
const PAD = { left: 52, right: 86, top: 16, bottom: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MIN_SIZE = 10;
const MAX_SIZE = 100;

interface ChartProps {
  /** Small, non-interactive version used inside lessons. */
  compact?: boolean;
  /** Curve ids drawn in colour; in compact mode the others are faded. */
  highlight?: string[];
  size?: number;
  onSizeChange?: (size: number) => void;
}

/** Input size against operations for the common complexity classes. */
export function BigOChart({ compact = false, highlight, size: controlledSize, onSizeChange }: ChartProps) {
  const id = useId();
  const [ownSize, setOwnSize] = useState(compact ? 30 : 50);
  const size = controlledSize ?? ownSize;
  const setSize = onSizeChange ?? setOwnSize;
  const [enabled, setEnabled] = useState(() => new Set(COMPLEXITIES.map((c) => c.id)));
  const [inspect, setInspect] = useState<number>();
  const n = Math.min(inspect ?? size, size);

  // The top of the chart sits just above n log n, so fast-growing curves leave the top edge.
  const yMax = size * Math.log2(size) * 1.12;
  const x = (value: number) => PAD.left + ((value - 1) / (size - 1)) * PLOT_W;
  const y = (ops: number) => PAD.top + PLOT_H - (Math.min(ops, yMax * 1.5) / yMax) * PLOT_H;

  const curves = useMemo(
    () =>
      COMPLEXITIES.map((c) => {
        const points: string[] = [];
        let label = { x: PAD.left + PLOT_W, y: PAD.top + PLOT_H };
        for (let i = 0; i <= 120; i++) {
          const value = 1 + ((size - 1) * i) / 120;
          const ops = c.fn(value);
          const px = PAD.left + ((value - 1) / (size - 1)) * PLOT_W;
          const py = PAD.top + PLOT_H - (Math.min(ops, yMax * 1.5) / yMax) * PLOT_H;
          points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
          if (ops <= yMax) label = { x: px, y: py };
        }
        return { c, d: `M${points.join(' L')}`, label };
      }),
    [size, yMax],
  );

  const isOn = (c: Complexity) => (compact ? true : enabled.has(c.id));
  const isStrong = (c: Complexity) => !highlight || highlight.includes(c.id);
  const visible = curves.filter(({ c }) => isOn(c));

  // Curves that leave the top are labelled there; the rest are labelled at the
  // right edge and nudged apart so close curves such as O(1) and O(log n) stay readable.
  const labels = visible
    .filter(({ c }) => isStrong(c))
    .map(({ c, label }) => {
      const atTop = label.x < PAD.left + PLOT_W - 1;
      return { c, atTop, x: atTop ? label.x + 6 : PAD.left + PLOT_W + 8, y: atTop ? PAD.top + 10 : label.y };
    })
    .toSorted((a, b) => b.y - a.y);
  let floor = Infinity;
  for (const label of labels) {
    if (label.atTop) continue;
    label.y = Math.min(label.y, floor - 13);
    floor = label.y;
  }

  const toggle = (curveId: string) =>
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(curveId)) next.delete(curveId);
      else next.add(curveId);
      return next;
    });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * W;
    const value = 1 + ((svgX - PAD.left) / PLOT_W) * (size - 1);
    setInspect(Math.round(Math.min(size, Math.max(1, value))));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setInspect(Math.min(size, Math.max(1, n + (event.key === 'ArrowRight' ? 1 : -1))));
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className={compact ? '' : 'space-y-5'}>
      {!compact && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show or hide curves">
          {COMPLEXITIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={enabled.has(c.id)}
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 font-mono text-sm transition-colors ${
                enabled.has(c.id) ? 'border-border bg-surface' : 'border-dashed border-border text-muted opacity-60'
              }`}
            >
              <svg width="22" height="8" aria-hidden>
                <line x1="0" y1="4" x2="22" y2="4" stroke={c.color} strokeWidth="3" strokeDasharray={c.dash} />
              </svg>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Chart of operations against input size up to ${size}. ${visible.map(({ c }) => c.label).join(', ')}.`}
        tabIndex={compact ? undefined : 0}
        onPointerMove={compact ? undefined : onPointerMove}
        onPointerLeave={compact ? undefined : () => setInspect(undefined)}
        onKeyDown={compact ? undefined : onKeyDown}
      >
        <defs>
          <clipPath id={`${id}-plot`}>
            <rect x={PAD.left} y={PAD.top - 2} width={PLOT_W + 2} height={PLOT_H + 4} />
          </clipPath>
        </defs>

        {ticks.map((t) => {
          const py = PAD.top + PLOT_H - t * PLOT_H;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={py} y2={py} stroke="var(--border)" />
              <text x={PAD.left - 8} y={py} textAnchor="end" dominantBaseline="central" fill="var(--text-muted)" className="font-mono text-[10px]">
                {formatOps(t * yMax)}
              </text>
            </g>
          );
        })}
        {ticks.map((t) => {
          const value = Math.round(1 + t * (size - 1));
          return (
            <text key={t} x={x(value)} y={PAD.top + PLOT_H + 16} textAnchor="middle" fill="var(--text-muted)" className="font-mono text-[10px]">
              {value}
            </text>
          );
        })}
        <text x={PAD.left + PLOT_W / 2} y={H - 4} textAnchor="middle" fill="var(--text-muted)" className="text-[11px]">
          Input size (n)
        </text>
        <text x={12} y={PAD.top + PLOT_H / 2} textAnchor="middle" fill="var(--text-muted)" className="text-[11px]" transform={`rotate(-90 12 ${PAD.top + PLOT_H / 2})`}>
          Operations
        </text>

        <g clipPath={`url(#${id}-plot)`}>
          {visible.map(({ c, d }) => (
            <path
              key={c.id}
              d={d}
              fill="none"
              stroke={isStrong(c) ? c.color : 'var(--text-muted)'}
              strokeOpacity={isStrong(c) ? 1 : 0.3}
              strokeWidth={isStrong(c) ? 3 : 1.5}
              strokeDasharray={c.dash}
              strokeLinecap="round"
            />
          ))}
        </g>

        {labels.map(({ c, x: lx, y: ly }) => (
          <text
            key={c.id}
            x={lx}
            y={ly}
            dominantBaseline="central"
            fill="var(--text)"
            className="font-mono text-[11px] font-semibold"
          >
            {c.label}
          </text>
        ))}

        {!compact && (
          <g>
            <line x1={x(n)} x2={x(n)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--text)" strokeOpacity={0.35} strokeDasharray="3 3" />
            {visible.map(({ c }) =>
              c.fn(n) <= yMax ? (
                <circle key={c.id} cx={x(n)} cy={y(c.fn(n))} r={4.5} fill={c.color} stroke="var(--surface)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        )}
      </svg>

      {!compact && (
        <>
          <div>
            <label htmlFor={`${id}-size`} className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">Largest input size shown</span>
              <span className="font-mono tabular-nums text-muted">n = {size}</span>
            </label>
            <input
              id={`${id}-size`}
              type="range"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="h-6 w-full cursor-pointer accent-[var(--accent)]"
            />
          </div>

          <div className="rounded-xl bg-surface-2 p-4">
            <p className="text-sm">
              Operations needed when <span className="font-mono font-semibold">n = {n}</span>
              <span className="text-muted"> — hover the chart, or focus it and use the arrow keys</span>
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {visible.map(({ c }) => (
                <div key={c.id} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 font-mono text-sm">
                  <dt className="text-muted">{c.label}</dt>
                  <dd className="font-semibold tabular-nums">{formatOps(c.fn(n))}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
