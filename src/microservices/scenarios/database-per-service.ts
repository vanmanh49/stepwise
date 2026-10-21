import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, db, gateway, link, scenarioSteps, service, serviceOf } from './shared';

export const databasePerServiceCode = `// Shared database: orders reads the users table itself
function getOrder(id) {
  return db.query("SELECT orders.id, users.name FROM orders JOIN users ...")
}

// The users team changes its own table, and its own queries
ALTER TABLE users RENAME COLUMN name TO full_name

// Database per service: orders asks the users service instead
function getOrderOwned(id) {
  const order = ordersDb.query("SELECT id FROM orders ...")
  const user = users.get(order.userId) // the users API stays the same
  return { ...order, user }
}`;

export const RENAME_AT = 70;

export function databasePerServiceScenario(values: Record<string, string>): Read<Scenario> {
  const model = readChoice(values, 'model', 'Data model', ['shared', 'per-service']);
  if (!model.ok) return model;
  const rename = readChoice(values, 'rename', 'Rename users.name', ['no', 'yes']);
  if (!rename.ok) return rename;
  const shared = model.value === 'shared';
  const requests = Array.from({ length: 4 }, (_, i) => ({ label: 'GET /orders/1', path: '/orders/1', to: 'gateway', at: 30 * i }));
  const routes = [
    { prefix: '/orders', to: 'orders' },
    { prefix: '/users', to: 'users' },
  ];
  const usersDb = shared ? 'shared-db' : 'users-db';
  const faults =
    rename.value === 'yes' ? [{ kind: 'rename-column' as const, node: usersDb, from: 'users.name', to: 'users.full_name', at: RENAME_AT, owner: 'users' }] : [];
  if (shared) {
    return {
      ok: true,
      value: {
        nodes: [
          client(),
          gateway(routes),
          service('orders', 2, [{ to: 'shared-db', columns: ['orders.id', 'users.name'] }]),
          service('users', 2, [{ to: 'shared-db', columns: ['users.name'] }]),
          db('shared-db', 3, ['orders.id', 'orders.total', 'users.id', 'users.name']),
        ],
        links: [link('client', 'gateway'), link('gateway', 'orders'), link('gateway', 'users'), link('orders', 'shared-db'), link('users', 'shared-db')],
        requests,
        faults,
      },
    };
  }
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        gateway(routes),
        service('orders', 2, [{ to: 'orders-db', columns: ['orders.id'] }, 'users']),
        service('users', 2, [{ to: 'users-db', columns: ['users.name'] }]),
        db('orders-db', 3, ['orders.id', 'orders.total']),
        db('users-db', 3, ['users.id', 'users.name']),
      ],
      links: [link('client', 'gateway'), link('gateway', 'orders'), link('gateway', 'users'), link('orders', 'orders-db'), link('orders', 'users'), link('users', 'users-db')],
      requests,
      faults,
    },
  };
}

export function databasePerServiceSteps(values: Record<string, string>): Step[] {
  const shared = values.model?.trim() === 'shared';
  const options: StepOptions = {
    code: databasePerServiceCode,
    lines: { handle: shared ? 'function getOrder(' : 'function getOrderOwned(', fault: 'ALTER TABLE', done: shared ? 'function getOrder(' : 'return { ...order, user }' },
    explain: (event) => {
      if (event.kind === 'handle' && event.node === 'users') return { line: 'users.get(order.userId)' };
      if (event.kind === 'send') {
        const m = event.message;
        const from = serviceOf(m.from);
        if (m.kind === 'reply' && !m.ok && m.reason?.startsWith('no column')) {
          return { line: 'db.query(', why: "Orders still asks for users.name, which no longer exists. The users team's change broke another team's service." };
        }
        if (m.kind === 'query') return { line: from === 'orders' ? (shared ? 'db.query(' : 'ordersDb.query(') : 'users.get(order.userId)' };
        if (from === 'orders' && serviceOf(m.to) === 'users') {
          return { line: 'users.get(order.userId)', why: "Orders doesn't read the users table. It asks the users service, whose API stays the same whatever happens to its table." };
        }
        return undefined;
      }
      if (event.kind === 'fault' && event.fault.kind === 'rename-column') {
        return {
          why: shared
            ? 'The users team renames a column in its table and updates its own queries. The orders service reads that table too, and nobody told it.'
            : 'The users team renames a column in its own database and updates its own queries. Nothing else reads users-db, so nothing else has to change.',
        };
      }
      return undefined;
    },
  };
  return scenarioSteps(databasePerServiceScenario(values), 'Check the settings', options);
}
