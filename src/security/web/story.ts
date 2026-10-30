import { lineOf } from '../../data-structures/shared';
import type { GridView, PanelsView, ServicesView, Step } from '../../types/visualization';
import { MAX_STEPS } from '../steps';
import { pathOf } from './http';
import type { StoredCookie } from './browser';
import type { WebEvent, World } from './world';

export type NodeId = 'browser' | 'attacker' | 'evil' | 'shop' | 'login' | 'db' | 'internal' | 'images';

export type Note = { from: NodeId; to: NodeId; label: string };

export type Story = {
  step(input: { title: string; why: string; next?: string; line: string; variables?: Step['variables']; rows?: GridView; note?: Note }): void;
  steps: Step[];
};

const NODES: Record<NodeId, { label: string; type: ServicesView['nodes'][number]['type']; column: number }> = {
  browser: { label: 'Browser', type: 'client', column: 0 },
  attacker: { label: 'Attacker', type: 'attacker', column: 0 },
  shop: { label: 'shop.example', type: 'service', column: 1 },
  login: { label: 'login.example', type: 'service', column: 1 },
  evil: { label: 'evil.example', type: 'attacker', column: 1 },
  db: { label: 'Shop db', type: 'db', column: 2 },
  internal: { label: 'Internal network', type: 'service', column: 2 },
  images: { label: 'images.example', type: 'service', column: 2 },
};

const LINKS: [NodeId, NodeId][] = [
  ['browser', 'shop'],
  ['browser', 'login'],
  ['browser', 'evil'],
  ['attacker', 'shop'],
  ['attacker', 'login'],
  ['attacker', 'browser'],
  ['evil', 'shop'],
  ['shop', 'login'],
  ['evil', 'login'],
  ['shop', 'db'],
  ['attacker', 'db'],
  ['shop', 'internal'],
  ['shop', 'images'],
];

const LOG_LINES = 4;
const SHOWN_CHARS = 12;

const short = (text: string) => (text.length > SHOWN_CHARS ? `${text.slice(0, SHOWN_CHARS)}…` : text);

const flagsOf = (cookie: StoredCookie) => [cookie.httpOnly && 'HttpOnly', cookie.secure && 'Secure', cookie.sameSite].filter(Boolean).join(', ') || 'none';

export function cookieGrid(world: World): GridView {
  const cookies = world.browser.jar();
  if (cookies.length === 0) return { kind: 'grid', rows: [{ cells: [{ id: 'cookie-none', value: 'No cookies', role: 'default' }] }] };
  return {
    kind: 'grid',
    colLabels: ['Name', 'Value', 'Flags'],
    rows: cookies.map((cookie) => ({
      cells: [cookie.name, short(cookie.value), flagsOf(cookie)].map((value, i) => ({ id: `cookie-${cookie.host}-${cookie.name}-${i}`, value, role: 'default' as const })),
    })),
  };
}

export function rowsGrid(rows: Record<string, unknown>[], prefix: string): GridView {
  if (rows.length === 0) return { kind: 'grid', rows: [{ cells: [{ id: `${prefix}-none`, value: 'No rows', role: 'default' }] }] };
  return {
    kind: 'grid',
    colLabels: Object.keys(rows[0]!),
    rows: rows.map((row, r) => ({
      cells: Object.entries(row).map(([key, value]) => ({ id: `${prefix}-${r}-${key}`, value: short(String(value)), role: 'default' as const })),
    })),
  };
}

export const resultOf = (ok: boolean): 'attacker in' | 'stopped' => (ok ? 'attacker in' : 'stopped');

const labelOf = (event: WebEvent) => `${event.request.method} ${pathOf(event.request.url)}`;

export function createStory({ world, code, nodes }: { world: World; code: string; nodes: NodeId[] }): Story {
  const steps: Step[] = [];
  const log: string[] = [];
  let seen = 0;
  let nextMessage = 0;

  const links = LINKS.filter(([from, to]) => nodes.includes(from) && nodes.includes(to));
  const linked = (from: NodeId, to: NodeId) => links.some(([a, b]) => (a === from && b === to) || (a === to && b === from));

  function services(note?: Note): ServicesView {
    const fresh = world.events.slice(seen);
    seen = world.events.length;
    log.push(...fresh.map((event) => `${labelOf(event)} → ${event.response.status}`));
    const wire = fresh.flatMap((event) => (event.to && linked(event.from, event.to) ? [{ from: event.from, to: event.to, label: labelOf(event), role: event.response.status >= 400 ? ('discarded' as const) : ('active' as const) }] : []));
    return {
      kind: 'services',
      nodes: nodes.map((id) => ({ id, ...NODES[id], role: 'default' })),
      links: links.map(([from, to]) => ({ from, to, role: 'default' })),
      messages: [...wire, ...(note ? [{ ...note, role: 'active' as const }] : [])].map((message) => ({ ...message, id: `message-${nextMessage++}`, progress: 0.5 })),
      requests: [],
      log: log.slice(-LOG_LINES),
    };
  }

  return {
    steps,
    step: ({ title, why, next, line, variables, rows, note }) => {
      const codeLine = lineOf(code, line);
      if (steps.length === MAX_STEPS) return;
      const panels: PanelsView['panels'] = [
        { label: 'On the wire', view: services(note) },
        { label: 'Cookies', view: cookieGrid(world) },
      ];
      if (rows) panels.push({ label: 'Rows', view: rows });
      steps.push({ title, why, ...(next && { next }), codeLine, ...(variables && { variables }), view: { kind: 'panels', panels } });
    },
  };
}
