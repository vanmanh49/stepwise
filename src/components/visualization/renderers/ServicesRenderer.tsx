import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Role, ServicesView } from '../../../types/visualization';
import { ROLE_META, roleBorder, roleFill, roleText } from '../roles';
import { chooseOrientation, HEADER, layoutServices, linkEnds, MARGIN, NARROW_WIDTH, stackMessages, type PlacedBox } from './servicesLayout';
import { spring } from './spring';

const PILL_HEIGHT = 18;
/** Messages are drawn between these points of their link, so a pill never covers the box it leaves or reaches. */
const DEPARTED_AT = 0.22;
const ARRIVED_AT = 0.78;
/** Stacked pills alternate around the link (on it, above, below, further above), so a stack stays near its link. */
const LANES = [0, -1, 1, -2];

const TYPE_NAME: Record<ServicesView['nodes'][number]['type'], string> = {
  client: 'client',
  gateway: 'API gateway',
  registry: 'registry',
  balancer: 'load balancer',
  service: 'service',
  db: 'database',
  broker: 'message broker',
};

const STATUS: Record<ServicesView['requests'][number]['status'], { text: string; role: Role }> = {
  pending: { text: 'in progress', role: 'frontier' },
  ok: { text: 'ok', role: 'found' },
  failed: { text: 'failed', role: 'discarded' },
};

/** A rectangle with a role's fill, border cue and mark, like ValueBox but in SVG. */
function RoleRect({ x, y, width, height, role, radius }: { x: number; y: number; width: number; height: number; role: Role; radius: number }) {
  const { cue, mark } = ROLE_META[role];
  return (
    <g>
      {cue === 'ring' && <rect x={x - 4} y={y - 4} width={width + 8} height={height + 8} rx={radius + 4} fill="none" stroke={roleFill(role)} strokeWidth={2} />}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        fill={roleFill(role)}
        stroke={roleBorder(role)}
        strokeWidth={cue === 'double' ? 4 : 2}
        strokeDasharray={cue === 'dashed' ? '5 4' : undefined}
        style={{ transition: 'fill 0.2s, stroke 0.2s' }}
      />
      {mark && role !== 'default' && (
        <g transform={`translate(${x + width - 2}, ${y + 2})`} aria-hidden>
          <circle r={8} fill="var(--surface)" stroke="var(--border)" />
          <text textAnchor="middle" dominantBaseline="central" fill="var(--text)" className="text-[10px]">
            {mark}
          </text>
        </g>
      )}
    </g>
  );
}

function NodeBox({ node, box }: { node: ServicesView['nodes'][number]; box: PlacedBox }) {
  const hasInstances = (node.instances?.length ?? 0) > 0;
  return (
    <g>
      <RoleRect x={box.x} y={box.y} width={box.width} height={box.height} role={node.role} radius={10} />
      <text x={box.x + 8} y={box.y + HEADER / 2 + 1} dominantBaseline="central" fill={roleText(node.role)} className="font-mono text-[12px] font-semibold">
        {node.label}
        <title>{`${node.label} (${TYPE_NAME[node.type]})`}</title>
      </text>
      {!hasInstances && node.label !== TYPE_NAME[node.type] && node.label.length * 7.4 + TYPE_NAME[node.type].length * 5.6 + 24 <= box.width && (
        <text x={box.x + box.width - 8} y={box.y + HEADER / 2 + 1} textAnchor="end" dominantBaseline="central" fill="var(--text-muted)" className="text-[10px]">
          {TYPE_NAME[node.type]}
        </text>
      )}
      {node.badge && (
        <text x={box.x + box.width / 2} y={box.y - 6} textAnchor="middle" fill="var(--text-muted)" className="font-mono text-[10px]">
          {node.badge}
        </text>
      )}
      {(node.instances ?? []).map((instance, i) => {
        const r = box.instances[i]!;
        return (
          <g key={instance.id}>
            <RoleRect x={r.x} y={r.y} width={r.width} height={r.height} role={instance.role} radius={6} />
            <text x={r.x + 6} y={r.y + r.height / 2} dominantBaseline="central" fill={roleText(instance.role)} className="font-mono text-[11px] font-semibold">
              {instance.id}
            </text>
            {instance.badge && instance.id.length * 6.8 + instance.badge.length * 5.6 + 18 <= r.width && (
              <text x={r.x + r.width - 6} y={r.y + r.height / 2} textAnchor="end" dominantBaseline="central" fill={roleText(instance.role)} className="font-mono text-[9px]">
                {instance.badge}
              </text>
            )}
            {instance.badge && <title>{`${instance.id}: ${instance.badge}`}</title>}
          </g>
        );
      })}
    </g>
  );
}

/** Services in layout columns (rows on a phone), the messages crossing their links, then each request's progress and a short log. */
export function ServicesRenderer({ view }: { view: ServicesView }) {
  const root = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  // The Visualizer's stage wraps views in a padded, content-sized box, so measure the stage itself (minus that padding),
  // before paint and on every resize: wide systems then switch to rows instead of shrinking.
  useLayoutEffect(() => {
    const wrapper = root.current?.parentElement;
    const stage = wrapper?.parentElement;
    if (!wrapper || !stage) return;
    const measure = () => {
      const style = getComputedStyle(wrapper);
      setAvailable(stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const narrow = available > 0 && chooseOrientation(view, available) === 'rows';
  // Rows fill the stage they are given, so phone text stays at full size.
  const layout = layoutServices(view, narrow ? 'rows' : 'columns', narrow ? Math.min(NARROW_WIDTH, available - 2 * MARGIN) : NARROW_WIDTH);
  const boxes = new Map(layout.boxes.map((b) => [b.id, b]));
  const deliveries = view.requests.filter((r) => r.id.includes('/')).length;
  const width = layout.width + MARGIN * 2;
  const height = layout.height + MARGIN * 2;

  return (
    <div ref={root} className="flex w-full max-w-full flex-col gap-4">
      <svg
        width={width}
        height={height}
        viewBox={`${-MARGIN} ${-MARGIN} ${width} ${height}`}
        role="img"
        aria-label={`${view.requests.length - deliveries} requests, ${deliveries > 0 ? `${deliveries} deliveries, ` : ''}${view.messages.length} messages in flight`}
        className="mx-auto h-auto max-w-full overflow-visible"
      >
        {view.links.map((link) => {
          const [a, b] = [boxes.get(link.from), boxes.get(link.to)];
          if (!a || !b) return null;
          const { x1, y1, x2, y2 } = linkEnds(a, b);
          const busy = link.role !== 'default';
          return (
            <line
              key={`${link.from}-${link.to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={busy ? roleBorder(link.role) : 'var(--text-muted)'}
              strokeOpacity={busy ? 1 : 0.45}
              strokeWidth={busy ? 2 : 1.5}
              strokeDasharray={ROLE_META[link.role].cue === 'dashed' ? '5 4' : undefined}
            />
          );
        })}
        {view.nodes.map((node) => {
          const box = boxes.get(node.id);
          return box ? <NodeBox key={node.id} node={node} box={box} /> : null;
        })}
        {stackMessages(view.messages).map((message) => {
          const [a, b] = [boxes.get(message.from), boxes.get(message.to)];
          if (!a || !b) return null;
          const { x1, y1, x2, y2 } = linkEnds(a, b);
          const along = DEPARTED_AT + (ARRIVED_AT - DEPARTED_AT) * message.progress;
          // Pills that share a spot step sideways off the link, one pill height each.
          const length = Math.hypot(x2 - x1, y2 - y1) || 1;
          // Lanes are measured from the link's alphabetically first end, so pills going both ways share one stack.
          const shift = (LANES[message.slot] ?? 0) * (PILL_HEIGHT + 2) * (message.from < message.to ? 1 : -1);
          const x = x1 + (x2 - x1) * along - ((y2 - y1) / length) * shift;
          const y = y1 + (y2 - y1) * along + ((x2 - x1) / length) * shift;
          const text = narrow ? message.label.replace(/^(GET|POST|PUT|DELETE) /, '') : message.label;
          const pill = Math.max(36, text.length * 6.2 + 12);
          return (
            <motion.g key={message.id} initial={{ x: x1, y: y1, opacity: 0 }} animate={{ x, y, opacity: 1 }} transition={spring}>
              <rect
                x={-pill / 2}
                y={-PILL_HEIGHT / 2}
                width={pill}
                height={PILL_HEIGHT}
                rx={PILL_HEIGHT / 2}
                fill={roleFill(message.role)}
                stroke={roleBorder(message.role)}
                strokeWidth={1.5}
                strokeDasharray={ROLE_META[message.role].cue === 'dashed' ? '4 3' : undefined}
              />
              <text textAnchor="middle" dominantBaseline="central" fill={roleText(message.role)} className="font-mono text-[10px] font-semibold">
                {text}
              </text>
            </motion.g>
          );
        })}
      </svg>

      {view.requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[18rem] border-collapse text-left font-mono text-xs">
            <caption className="sr-only">Each request, its status, the path it took and how long it took</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="pb-1 pr-2 font-semibold">#</th>
                <th scope="col" className="pb-1 pr-2 font-semibold">Request</th>
                <th scope="col" className="pb-1 pr-2 font-semibold">Status</th>
                <th scope="col" className="pb-1 pr-2 font-semibold">Path taken</th>
                <th scope="col" className="pb-1 text-right font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {view.requests.map((r) => {
                const status = STATUS[r.status];
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-1 pr-2">{r.id}</td>
                    <td className="whitespace-nowrap py-1 pr-2">{r.label}</td>
                    <td className="py-1 pr-2">
                      <span className="rounded px-1.5 py-0.5" style={{ background: roleFill(status.role), color: roleText(status.role) }}>
                        {status.text}
                      </span>
                      {r.attempts !== undefined && r.attempts > 1 && <span className="ml-1 text-muted">· {r.attempts} tries</span>}
                      {r.reason && <div className="mt-0.5 font-sans text-[11px] text-muted">{r.reason}</div>}
                    </td>
                    <td className="break-words py-1 pr-2 text-muted">{r.hops}</td>
                    <td className="whitespace-nowrap py-1 text-right">{r.ms === undefined ? '' : `${r.ms} ms`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view.log.length > 0 && (
        <ol aria-label="Recent events" className="space-y-0.5 border-t border-border pt-2 font-mono text-[11px] text-muted">
          {view.log.map((line, i) => (
            <li key={`${view.log.length}-${i}`} className={i === view.log.length - 1 ? 'text-text' : ''}>
              {line}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
