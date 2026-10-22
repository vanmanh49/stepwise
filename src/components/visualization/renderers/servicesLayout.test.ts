import { describe, expect, it } from 'vitest';
import type { ServicesView } from '../../../types/visualization';
import { chooseOrientation, HEADER, INSTANCE_GAP, INSTANCE_HEIGHT, layoutServices, linkEnds, NARROW_WIDTH, PAD, type PlacedBox, stackMessages } from './servicesLayout';

type ViewNode = ServicesView['nodes'][number];

const node = (id: string, column: number, instances = 0): ViewNode => ({
  id,
  label: id,
  type: instances > 0 ? 'service' : 'gateway',
  column,
  role: 'default',
  ...(instances > 0 && { instances: Array.from({ length: instances }, (_, i) => ({ id: `${id}-${i + 1}`, role: 'default' as const })) }),
});

const view = (nodes: ViewNode[]): ServicesView => ({ kind: 'services', nodes, links: [], messages: [], requests: [], log: [] });

const system = view([node('client', 0), node('gateway', 1), node('orders', 2, 3), node('users', 2, 1), node('db', 3)]);
const fourBranches = view([node('client', 0), node('s1', 1, 1), node('b1', 2, 1), node('b2', 2, 1), node('b3', 2, 1), node('b4', 2, 1)]);

const overlap = (a: PlacedBox, b: PlacedBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const at = (boxes: PlacedBox[], id: string) => boxes.find((b) => b.id === id)!;

describe('layoutServices', () => {
  it('places columns left to right without overlap', () => {
    const { boxes, width, height } = layoutServices(system, 'columns');
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false);
    expect(at(boxes, 'client').x).toBeLessThan(at(boxes, 'gateway').x);
    expect(at(boxes, 'gateway').x).toBeLessThan(at(boxes, 'orders').x);
    expect(at(boxes, 'orders').x).toBe(at(boxes, 'users').x);
    for (const b of boxes) {
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(b.y + b.height).toBeLessThanOrEqual(height);
    }
  });

  it('sizes a service box by its instances and stacks them inside', () => {
    const orders = at(layoutServices(system, 'columns').boxes, 'orders');
    expect(orders.height).toBe(HEADER + 3 * INSTANCE_HEIGHT + 2 * INSTANCE_GAP + PAD);
    expect(orders.instances.map((i) => i.y - orders.y)).toEqual([HEADER, HEADER + INSTANCE_HEIGHT + INSTANCE_GAP, HEADER + 2 * (INSTANCE_HEIGHT + INSTANCE_GAP)]);
    expect(at(layoutServices(system, 'columns').boxes, 'gateway').height).toBe(HEADER + PAD);
  });

  it('stacks columns as rows in the narrow layout', () => {
    const { boxes } = layoutServices(system, 'rows');
    expect(at(boxes, 'client').y).toBeLessThan(at(boxes, 'gateway').y);
    expect(at(boxes, 'gateway').y).toBeLessThan(at(boxes, 'orders').y);
    expect(at(boxes, 'orders').y).toBe(at(boxes, 'users').y);
    expect(at(boxes, 'orders').x).toBeLessThan(at(boxes, 'users').x);
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false);
  });

  it('fits rows to the width it is given', () => {
    const { boxes, width } = layoutServices(fourBranches, 'rows', 265);
    expect(width).toBeLessThanOrEqual(265);
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(265);
  });

  it('fits four nodes in one row inside 343 px', () => {
    const { boxes, width } = layoutServices(fourBranches, 'rows');
    expect(width).toBeLessThanOrEqual(NARROW_WIDTH);
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(NARROW_WIDTH);
  });
});

describe('chooseOrientation', () => {
  it('keeps columns while they fit at 80% or more, and stacks rows otherwise', () => {
    const wide = view([node('a', 0), node('b', 1), node('c', 2), node('d', 3), node('e', 4), node('f', 5)]);
    expect(chooseOrientation(system, 650)).toBe('columns');
    expect(chooseOrientation(wide, 650)).toBe('rows');
    expect(chooseOrientation(system, NARROW_WIDTH)).toBe('rows');
    expect(chooseOrientation(wide, 2000)).toBe('columns');
  });
});

describe('linkEnds', () => {
  it('anchors links on the facing edges', () => {
    const { boxes } = layoutServices(system, 'columns');
    const [client, gateway] = [at(boxes, 'client'), at(boxes, 'gateway')];
    expect(linkEnds(client, gateway)).toEqual({ x1: client.x + client.width, y1: client.y + client.height / 2, x2: gateway.x, y2: gateway.y + gateway.height / 2 });
    expect(linkEnds(gateway, client)).toEqual({ x1: gateway.x, y1: gateway.y + gateway.height / 2, x2: client.x + client.width, y2: client.y + client.height / 2 });
    const rows = layoutServices(system, 'rows').boxes;
    const [top, below] = [at(rows, 'client'), at(rows, 'gateway')];
    expect(linkEnds(top, below)).toEqual({ x1: top.x + top.width / 2, y1: top.y + top.height, x2: below.x + below.width / 2, y2: below.y });
  });
});

describe('stackMessages', () => {
  const message = (id: string, progress: number, from = 'client', to = 'api') => ({ id, from, to, label: `GET ${id}`, role: 'frontier' as const, progress });

  it('stacks up to three pills on one spot and folds the rest', () => {
    const six = Array.from({ length: 6 }, (_, i) => message(`m${i}`, 0.5));
    const pills = stackMessages(six);
    expect(pills.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
    expect(pills.at(-1)).toMatchObject({ id: 'more-m3', label: '+3 more', role: 'frontier' });
  });

  it('stacks within 0.05 progress only, and only on the same link', () => {
    expect(stackMessages([message('a', 0.5), message('b', 0.53)]).map((p) => p.slot)).toEqual([0, 1]);
    expect(stackMessages([message('a', 0.5), message('b', 0.6)]).map((p) => p.slot)).toEqual([0, 0]);
    expect(stackMessages([message('a', 0.5), message('b', 0.5, 'api', 'db')]).map((p) => p.slot)).toEqual([0, 0]);
  });

  it('keeps a lone message as it is', () => {
    expect(stackMessages([message('a', 1)])).toEqual([{ ...message('a', 1), slot: 0 }]);
  });
});
