import type { GraphEdgeView, GraphView } from '../../../types/visualization';
import { roleFill } from '../roles';
import { NODE_RADIUS, SvgNode } from './SvgNode';

const WIDTH = 560;
const HEIGHT = 380;
const PAD_X = 44;
const PAD_TOP = 56;
const PAD_BOTTOM = 36;

const px = (x: number) => PAD_X + (x / 100) * (WIDTH - PAD_X * 2);
const py = (y: number) => PAD_TOP + (y / 100) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

function edgeStyle(role: GraphEdgeView['role']) {
  switch (role) {
    case 'default':
      return { stroke: 'var(--text-muted)', strokeOpacity: 0.5, strokeWidth: 2 };
    case 'discarded':
      return { stroke: 'var(--text-muted)', strokeOpacity: 0.3, strokeWidth: 2, strokeDasharray: '2 6' };
    case 'compare':
      return { stroke: roleFill(role), strokeWidth: 3.5, strokeDasharray: '7 5' };
    default:
      return { stroke: roleFill(role), strokeWidth: 4 };
  }
}

export function GraphRenderer({ view }: { view: GraphView }) {
  const at = new Map(view.nodes.map((n) => [n.id, { x: px(n.x), y: py(n.y) }]));

  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${view.directed ? 'Directed graph' : 'Graph'} with nodes ${view.nodes.map((n) => n.label).join(', ')}`}
        className="max-w-none shrink-0"
      >
        {view.edges.map((edge) => {
          const a = at.get(edge.from);
          const b = at.get(edge.to);
          if (!a || !b) return null;
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / length;
          const uy = (b.y - a.y) / length;
          const gap = NODE_RADIUS + (view.directed ? 9 : 2);
          const end = { x: b.x - ux * gap, y: b.y - uy * gap };
          const style = edgeStyle(edge.role);
          const mid = { x: (a.x + b.x) / 2 - uy * 13, y: (a.y + b.y) / 2 + ux * 13 };
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} {...style} style={{ transition: 'stroke 0.2s' }} />
              {view.directed && (
                <polygon
                  points={`0,-5.5 11,0 0,5.5`}
                  transform={`translate(${end.x - ux * 2}, ${end.y - uy * 2}) rotate(${(Math.atan2(uy, ux) * 180) / Math.PI})`}
                  fill={style.stroke}
                  fillOpacity={style.strokeOpacity ?? 1}
                />
              )}
              {edge.weight !== undefined && (
                <g transform={`translate(${mid.x}, ${mid.y})`}>
                  <rect x={-11} y={-10} width={22} height={20} rx={6} fill="var(--surface)" stroke="var(--border)" />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--text)"
                    className="font-mono text-[11px] font-semibold"
                  >
                    {edge.weight}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {view.nodes.map((node) => {
          const p = at.get(node.id)!;
          return <SvgNode key={node.id} x={p.x} y={p.y} role={node.role} label={node.label} badge={node.badge} />;
        })}
      </svg>

      {(view.frontier || view.table) && (
        <div className="flex w-52 flex-col gap-4">
          {view.frontier && (
            <div>
              <div className="eyebrow">{view.frontier.label}</div>
              <div className="mt-2 flex min-h-9 flex-wrap items-center gap-1.5">
                {view.frontier.items.length === 0 ? (
                  <span className="text-sm text-muted">empty</span>
                ) : (
                  view.frontier.items.map((item, i) => (
                    <span
                      key={`${item}-${i}`}
                      className="rounded-lg border border-border bg-surface px-2 py-1 font-mono text-xs font-semibold"
                    >
                      {item}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
          {view.table && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="pb-1 pr-3 text-xs font-medium">
                    Node
                  </th>
                  {view.table.columns.map((column) => (
                    <th key={column} scope="col" className="pb-1 pr-3 text-xs font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {Object.entries(view.table.rows).map(([label, values]) => (
                  <tr key={label} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-3 font-semibold">
                      {label}
                    </th>
                    {values.map((value, i) => (
                      <td key={i} className="py-1.5 pr-3">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
