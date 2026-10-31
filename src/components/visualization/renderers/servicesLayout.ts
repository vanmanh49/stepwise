import type { ServicesView } from '../../../types/visualization';

const NODE_WIDTH = 132;
export const HEADER = 30;
export const INSTANCE_HEIGHT = 26;
export const INSTANCE_GAP = 6;
export const PAD = 8;
const COLUMN_GAP = 64;
const ROW_GAP = 20;
/** The space a phone leaves: 375 px minus a 16 px gutter on each side. */
export const NARROW_WIDTH = 343;
/** Room around the diagram for badges and rings. */
export const MARGIN = 14;
/** Columns may shrink to this share of their size before the diagram switches to rows. */
const MIN_SCALE = 0.8;

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedBox extends Rect {
  instances: Rect[];
}

const boxHeight = (instances: number) =>
  instances === 0 ? HEADER + PAD : HEADER + instances * INSTANCE_HEIGHT + (instances - 1) * INSTANCE_GAP + PAD;

function place(node: ServicesView['nodes'][number], x: number, y: number, width: number): PlacedBox {
  const instances = (node.instances ?? []).map((instance, i) => ({
    id: instance.id,
    x: x + PAD,
    y: y + HEADER + i * (INSTANCE_HEIGHT + INSTANCE_GAP),
    width: width - 2 * PAD,
    height: INSTANCE_HEIGHT,
  }));
  return { id: node.id, x, y, width, height: boxHeight(instances.length), instances };
}

/**
 * Columns: one column per `column` value, left to right, each centred against the tallest.
 * Rows (phones): each column becomes a row, top to bottom, its nodes side by side and narrowed to fit.
 */
export function layoutServices(view: ServicesView, orientation: 'columns' | 'rows', rowWidth = NARROW_WIDTH): { boxes: PlacedBox[]; width: number; height: number } {
  const columns = [...new Set(view.nodes.map((n) => n.column))].toSorted((a, b) => a - b).map((c) => view.nodes.filter((n) => n.column === c));
  const boxes: PlacedBox[] = [];
  if (orientation === 'columns') {
    const heights = columns.map((nodes) => nodes.reduce((sum, n) => sum + boxHeight(n.instances?.length ?? 0), 0) + (nodes.length - 1) * ROW_GAP);
    const height = Math.max(0, ...heights);
    columns.forEach((nodes, c) => {
      let y = (height - heights[c]!) / 2;
      for (const node of nodes) {
        const box = place(node, c * (NODE_WIDTH + COLUMN_GAP), y, NODE_WIDTH);
        boxes.push(box);
        y += box.height + ROW_GAP;
      }
    });
    return { boxes, width: columns.length > 0 ? columns.length * NODE_WIDTH + (columns.length - 1) * COLUMN_GAP : 0, height };
  }
  const widthOf = (count: number) => Math.min(NODE_WIDTH, (rowWidth - (count - 1) * ROW_GAP) / count);
  const rowWidths = columns.map((nodes) => nodes.length * widthOf(nodes.length) + (nodes.length - 1) * ROW_GAP);
  const width = Math.max(0, ...rowWidths);
  let y = 0;
  columns.forEach((nodes, r) => {
    const w = widthOf(nodes.length);
    let x = (width - rowWidths[r]!) / 2;
    const row = nodes.map((node) => {
      const box = place(node, x, y, w);
      x += w + ROW_GAP;
      return box;
    });
    boxes.push(...row);
    y += Math.max(...row.map((b) => b.height)) + COLUMN_GAP;
  });
  return { boxes, width, height: Math.max(0, y - COLUMN_GAP) };
}

/** Columns when they fit the available width at 80% or more of their size; otherwise rows, top to bottom. */
export function chooseOrientation(view: ServicesView, available: number): 'columns' | 'rows' {
  const width = layoutServices(view, 'columns').width + 2 * MARGIN;
  return available >= width * MIN_SCALE ? 'columns' : 'rows';
}

/** Where a link between two boxes starts and ends: facing side edges, or top and bottom when they share a column. */
export function linkEnds(from: Rect, to: Rect): { x1: number; y1: number; x2: number; y2: number } {
  const side = from.x + from.width <= to.x || to.x + to.width <= from.x;
  if (side) {
    const rightward = from.x < to.x;
    return {
      x1: rightward ? from.x + from.width : from.x,
      y1: from.y + from.height / 2,
      x2: rightward ? to.x : to.x + to.width,
      y2: to.y + to.height / 2,
    };
  }
  const downward = from.y < to.y;
  return {
    x1: from.x + from.width / 2,
    y1: downward ? from.y + from.height : from.y,
    x2: to.x + to.width / 2,
    y2: downward ? to.y : to.y + to.height,
  };
}

/** An instance row's badge as it fits beside the name: whole, cut to its first word ("2 waiting" → "2"), or not at all. */
export function fitBadge(id: string, badge: string | undefined, width: number): string | undefined {
  if (!badge) return undefined;
  const fits = (text: string) => id.length * 6.8 + text.length * 5.6 + 18 <= width;
  if (fits(badge)) return badge;
  const first = badge.split(' ')[0]!;
  return fits(first) ? first : undefined;
}

/**
 * Where an instance row's badge goes: beside the name when it fits, otherwise on its own line under the name, so
 * values such as a record's "refunded" are not cut; failing both, its first word beside the name.
 */
export function placeBadge(id: string, badge: string | undefined, width: number): { text: string; below: boolean } | undefined {
  if (!badge) return undefined;
  if (fitBadge(id, badge, width) === badge) return { text: badge, below: false };
  if (badge.length * 5.6 + 12 <= width) return { text: badge, below: true };
  const first = fitBadge(id, badge, width);
  return first ? { text: first, below: false } : undefined;
}

type StackedPill = ServicesView['messages'][number] & { slot: number };

/** How close two messages on one link may be, in progress, before their pills would overlap. */
const STACK_WITHIN = 0.05;
const STACK_MAX = 3;

/**
 * Messages at the same spot of a link (within 0.05 progress, whichever way they travel) stack in slots 0–2;
 * the rest fold into one "+N more" pill in slot 3.
 */
export function stackMessages(messages: ServicesView['messages']): StackedPill[] {
  // Where a message sits, measured from the link's alphabetically first end, so both directions compare.
  const spot = (m: ServicesView['messages'][number]) =>
    m.from < m.to ? { link: `${m.from} ${m.to}`, at: m.progress } : { link: `${m.to} ${m.from}`, at: 1 - m.progress };
  const groups: { link: string; at: number; members: ServicesView['messages'][number][] }[] = [];
  for (const m of messages) {
    const { link, at } = spot(m);
    const group = groups.find((g) => g.link === link && Math.abs(g.at - at) <= STACK_WITHIN + 1e-9);
    if (group) group.members.push(m);
    else groups.push({ link, at, members: [m] });
  }
  const slots = new Map<string, number>();
  const folded = new Map<string, StackedPill>();
  for (const { members } of groups) {
    members.forEach((m, i) => slots.set(m.id, i));
    const extra = members.slice(STACK_MAX);
    if (extra.length > 0) {
      const first = extra[0]!;
      folded.set(first.id, { ...first, id: `more-${first.id}`, label: `+${extra.length} more`, slot: STACK_MAX });
    }
  }
  return messages.flatMap((m): StackedPill[] => {
    const slot = slots.get(m.id)!;
    if (slot < STACK_MAX) return [{ ...m, slot }];
    const more = folded.get(m.id);
    return more ? [more] : [];
  });
}
