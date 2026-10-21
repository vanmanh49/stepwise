import type { ServicesView } from '../../../types/visualization';

export const NODE_WIDTH = 132;
export const HEADER = 30;
export const INSTANCE_HEIGHT = 26;
export const INSTANCE_GAP = 6;
export const PAD = 8;
export const COLUMN_GAP = 64;
export const ROW_GAP = 20;
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
