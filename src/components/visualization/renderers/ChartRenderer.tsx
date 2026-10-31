import type { ChartView } from '../../../types/visualization';
import { roleFill } from '../roles';
import { sparkPath } from './chartPath';

const WIDTH = 360;
const HEIGHT = 170;
const LEFT = 34;
const RIGHT = 8;
const TOP = 8;
const BOTTOM = 22;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
const DASH = '6 4';
const MARKER_RADIUS = 4;

const shown = (value: number) => String(Number(value.toFixed(1)));

/** Lines share one axis. The scale comes from the whole run, so the axes hold still as the run plays. */
export function ChartRenderer({ view }: { view: ChartView }) {
  const { lines, threshold, title, xLabel, yLabel } = view;
  const length = Math.max(...lines.map((line) => line.points.length), 1);
  const now = Math.min(view.now ?? length - 1, length - 1);
  const top = Math.max(1, threshold?.value ?? 0, ...lines.flatMap((line) => line.points));
  const y = (value: number) => TOP + PLOT_H - (value / top) * (PLOT_H - 2) - 1;
  const x = length > 1 ? (now / (length - 1)) * PLOT_W : 0;
  const values = lines.map((line) => ({ ...line, value: line.points[now] ?? 0 }));
  return (
    <figure className="w-[min(34rem,calc(100vw-4rem))] max-w-full font-mono text-[11px]">
      <figcaption className="mb-1 text-center text-xs text-muted">{title}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={`${title}: ${values.map(({ label, value }) => `${label} ${shown(value)}`).join(', ')}`}>
        <text x={LEFT - 4} y={TOP + 8} textAnchor="end" fontSize={10} fill="var(--text-muted)">{shown(top)}</text>
        <text x={LEFT - 4} y={TOP + PLOT_H} textAnchor="end" fontSize={10} fill="var(--text-muted)">0</text>
        <text x={LEFT + PLOT_W / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{xLabel}</text>
        <line x1={LEFT} x2={LEFT + PLOT_W} y1={TOP + PLOT_H} y2={TOP + PLOT_H} stroke="var(--border)" />
        <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP + PLOT_H} stroke="var(--border)" />
        {threshold && (
          <g>
            <line x1={LEFT} x2={LEFT + PLOT_W} y1={y(threshold.value)} y2={y(threshold.value)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={LEFT + PLOT_W} y={y(threshold.value) - 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{threshold.label}</text>
          </g>
        )}
        <g transform={`translate(${LEFT} ${TOP})`}>
          {lines.map((line, i) => (
            <path key={line.id} d={sparkPath(line.points.slice(0, now + 1), x, PLOT_H, top)} fill="none" stroke={roleFill(line.role)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={i === 1 ? DASH : undefined} />
          ))}
        </g>
        <line x1={LEFT + x} x2={LEFT + x} y1={TOP} y2={TOP + PLOT_H} stroke="var(--border)" />
        {values.map((line) => (
          <circle key={line.id} cx={LEFT + x} cy={y(line.value)} r={MARKER_RADIUS} fill={roleFill(line.role)} stroke="var(--surface)" strokeWidth={2} />
        ))}
      </svg>
      <ul className="mt-1 flex list-none flex-wrap justify-center gap-x-4 gap-y-1 p-0">
        <li className="text-muted">{yLabel}</li>
        {values.map((line, i) => (
          <li key={line.id} className="flex items-center gap-1.5">
            <svg width={22} height={6} aria-hidden>
              <line x1={0} x2={22} y1={3} y2={3} stroke={roleFill(line.role)} strokeWidth={2} strokeDasharray={i === 1 ? DASH : undefined} />
            </svg>
            {line.label} {shown(line.value)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
