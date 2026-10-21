import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario, SimResult, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { client, db, gateway, link, scenarioSteps, service, serviceOf } from './shared';

export const serviceBoundariesCode = `// Split by layer: one checkout crosses every layer
function uiCheckout(order) {
  return logic.checkout(order)
}
function logicCheckout(order) {
  const cart = data.readCart(order)
  const stock = data.readStock(order)
  return data.writeOrder(order)
}
function dataQuery(q) {
  return db.query(q)
}

// Split by capability: checkout lives in orders
function ordersCheckout(order) {
  inventory.reserve(order) // the only call to another service
  return ordersDb.insert(order)
}
function inventoryReserve(order) {
  return inventoryDb.update(order)
}`;

export function serviceBoundariesScenario(values: Record<string, string>): Read<Scenario> {
  const split = readChoice(values, 'split', 'Split', ['by-layer', 'by-capability']);
  if (!split.ok) return split;
  const count = readInt(values, 'requests', 'Requests', { min: 1, max: 6 });
  if (!count.ok) return count;
  const requests = Array.from({ length: count.value }, (_, i) => ({ label: 'POST /checkout', path: '/checkout', to: 'gateway', at: 30 * i }));
  if (split.value === 'by-layer') {
    return {
      ok: true,
      value: {
        nodes: [client(), gateway([{ prefix: '/checkout', to: 'ui' }]), service('ui', 2, ['logic']), service('logic', 3, ['data', 'data', 'data']), service('data', 4, ['db']), db('db', 5)],
        links: [link('client', 'gateway'), link('gateway', 'ui'), link('ui', 'logic'), link('logic', 'data'), link('data', 'db')],
        requests,
        faults: [],
      },
    };
  }
  return {
    ok: true,
    value: {
      nodes: [client(), gateway([{ prefix: '/checkout', to: 'orders' }]), service('orders', 2, ['inventory', 'orders-db']), service('inventory', 3, ['inventory-db']), db('orders-db', 3), db('inventory-db', 4)],
      links: [link('client', 'gateway'), link('gateway', 'orders'), link('orders', 'inventory'), link('orders', 'orders-db'), link('inventory', 'inventory-db')],
      requests,
      faults: [],
    },
  };
}

const HANDLE: Record<string, string> = {
  ui: 'function uiCheckout',
  logic: 'function logicCheckout',
  data: 'function dataQuery',
  orders: 'function ordersCheckout',
  inventory: 'function inventoryReserve',
};

const SEND: Record<string, string> = {
  ui: 'logic.checkout(order)',
  logic: 'data.readCart(order)',
  data: 'db.query(q)',
  inventory: 'inventoryDb.update(order)',
};

const isServiceToService = (event: TraceEvent, services: Set<string>) =>
  event.kind === 'send' &&
  event.message.kind === 'request' &&
  services.has(serviceOf(event.message.from)) &&
  services.has(serviceOf(event.message.to)) &&
  serviceOf(event.message.from) !== serviceOf(event.message.to);

export function serviceBoundariesSteps(values: Record<string, string>): Step[] {
  const read = serviceBoundariesScenario(values);
  const services = new Set(read.ok ? read.value.nodes.flatMap((n) => (n.type === 'service' ? [n.id] : [])) : []);
  const byLayer = values.split?.trim() === 'by-layer';
  return scenarioSteps(read, 'Check the settings', (result) => options(result, services, byLayer));
}

function options(result: SimResult, services: Set<string>, byLayer: boolean): StepOptions {
  // Cross-service calls so far, per request, at each event of the run.
  const running = new Map<TraceEvent, number>();
  const counts = new Map<string, number>();
  for (const event of result.trace) {
    const request = 'request' in event ? event.request : event.kind === 'send' || event.kind === 'arrive' ? event.message.request : undefined;
    if (!request) continue;
    if (isServiceToService(event, services)) counts.set(request, (counts.get(request) ?? 0) + 1);
    running.set(event, counts.get(request) ?? 0);
  }
  return {
    code: serviceBoundariesCode,
    lines: { done: byLayer ? 'function uiCheckout' : 'function ordersCheckout', route: byLayer ? 'function uiCheckout' : 'function ordersCheckout' },
    explain: (event) => {
      if (event.kind === 'handle') return HANDLE[event.node] ? { line: HANDLE[event.node]! } : undefined;
      if (event.kind !== 'send') return undefined;
      const from = serviceOf(event.message.from);
      if (from === 'orders') return { line: event.message.to.startsWith('inventory') ? 'inventory.reserve(order)' : 'ordersDb.insert(order)' };
      if (isServiceToService(event, services)) {
        return {
          line: SEND[from] ?? 'logic.checkout(order)',
          why: byLayer
            ? `${from} can't finish checkout alone: the next layer holds the rest of the work. Every one of these calls crosses the network.`
            : 'Orders owns checkout, so the only thing it needs from another service is to reserve stock.',
        };
      }
      return SEND[from] ? { line: SEND[from]! } : undefined;
    },
    variables: (event): Record<string, number> => {
      const count = running.get(event);
      return count === undefined ? {} : { 'cross-service calls': count };
    },
  };
}
