import type { SpanRow } from '../types/visualization';
import type { Scenario, TraceEvent } from './model';

interface OpenSpan extends SpanRow {
  /** The node or instance doing the work, so its own calls can find their parent. */
  node: string;
  request: string;
  failed: boolean;
  parent?: string;
}

/**
 * Spans for each sampled request, from the first `upTo` trace events. A span runs from a request or query reaching
 * a live node to that node sending its reply; the client's root span runs from its first send to `done`. With
 * `propagate`, a span's parent is the open span of the node that sent the message, and every span of a request
 * shares trace T<n>; without it, every span is its own trace at depth 0. Open spans have no `ms`.
 */
export function spansOf(scenario: Scenario, trace: TraceEvent[], upTo: number, options: { propagate: boolean; sampled: Set<string> }): Map<string, SpanRow[]> {
  const owner = new Map<string, string>();
  for (const n of scenario.nodes) if (n.type === 'service') for (const i of n.instances) owner.set(i.id, n.id);
  const ownerOf = (id: string) => owner.get(id) ?? id;
  const paths = new Map(scenario.requests.map((r, i) => [`#${i + 1}`, r.path]));
  const clientId = scenario.nodes.find((n) => n.type === 'client')?.id;

  const spans = new Map<string, OpenSpan[]>();
  const byId = new Map<string, OpenSpan>();
  const dead = new Set<string>();
  const traceIds = new Map<string, number>();
  const traceOf = (request: string) => {
    const n = request.slice(1);
    if (options.propagate) return `T${n}`;
    const k = (traceIds.get(request) ?? 0) + 1;
    traceIds.set(request, k);
    return `T${n}.${k}`;
  };
  const open = (span: Omit<OpenSpan, 'trace' | 'role' | 'failed'>) => {
    const row: OpenSpan = { ...span, trace: traceOf(span.request), role: 'visited', failed: false };
    byId.set(row.id, row);
    let list = spans.get(span.request);
    if (!list) spans.set(span.request, (list = []));
    list.push(row);
  };
  const parentOf = (request: string, node: string) => spans.get(request)?.findLast((s) => s.node === node && s.ms === undefined);

  for (const event of trace.slice(0, upTo)) {
    if (event.kind === 'fault' && event.fault.kind === 'kill') dead.add(event.fault.instance);
    if (event.kind === 'fail' && /(crashed|stopped)$/.test(event.reason)) dead.add(event.at);
    if (event.kind === 'recover') dead.delete(event.node);
    const request = event.kind === 'send' || event.kind === 'arrive' ? event.message.request : event.kind === 'done' ? event.request : undefined;
    if (!request || !options.sampled.has(request)) continue;
    if (event.kind === 'send' && event.message.from === clientId && event.message.kind === 'request' && !byId.has(`root${request}`)) {
      open({ id: `root${request}`, label: `client ${paths.get(request) ?? ''}`.trim(), start: event.t, depth: 0, node: event.message.from, request });
    }
    if (event.kind === 'arrive' && (event.message.kind === 'request' || event.message.kind === 'query') && !dead.has(event.message.to)) {
      const m = event.message;
      const parent = options.propagate ? parentOf(request, m.from) : undefined;
      const what = m.kind === 'query' ? 'query' : (m.path ?? paths.get(request) ?? '');
      open({ id: m.id, label: `${ownerOf(m.to)} ${what}`.trim(), start: event.t, depth: parent ? parent.depth + 1 : 0, node: m.to, request, ...(parent && { parent: parent.id }) });
    }
    if (event.kind === 'send' && event.message.kind === 'reply') {
      const span = byId.get(event.message.replyTo ?? '');
      if (span && span.ms === undefined) {
        span.ms = event.t - span.start;
        span.failed = !event.message.ok;
      }
    }
    if (event.kind === 'done') {
      const root = byId.get(`root${request}`);
      if (root && root.ms === undefined) {
        root.ms = event.t - root.start;
        root.failed = !event.ok;
      }
    }
  }

  const result = new Map<string, SpanRow[]>();
  for (const [request, list] of spans) {
    // The finished span that spent the most time itself (not waiting on its children) is where the time went.
    const slowest = list
      .filter((s) => !s.id.startsWith('root') && s.ms !== undefined && !s.failed)
      .map((s) => ({ id: s.id, self: selfTime(s, list.filter((c) => c.parent === s.id)) }))
      .toSorted((a, b) => b.self - a.self)[0]?.id;
    result.set(
      request,
      list.map(({ node: _node, request: _request, failed, parent: _parent, ...row }) => ({ ...row, role: failed ? 'discarded' : row.id === slowest ? 'active' : 'visited' })),
    );
  }
  return result;
}

/** A span's own time: its length minus the time covered by its children (overlapping children count once). */
function selfTime(span: SpanRow, children: SpanRow[]): number {
  const end = span.start + (span.ms ?? 0);
  let covered = 0;
  let reach = span.start;
  for (const c of children.toSorted((a, b) => a.start - b.start)) {
    const from = Math.max(c.start, reach);
    const to = Math.min(end, c.start + (c.ms ?? end - c.start));
    if (to > from) covered += to - from;
    reach = Math.max(reach, to);
  }
  return (span.ms ?? 0) - covered;
}
