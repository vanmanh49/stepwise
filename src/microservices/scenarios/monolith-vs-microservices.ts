import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, db, GATEWAY_MS, link, scenarioSteps, service } from './shared';

export const monolithVsMicroservicesCode = `// Monolith: one process handles every path
function handle(req) {
  if (req.path.startsWith("/reviews") && bug) {
    crash()                  // takes the whole process down
  }
  const data = db.query(req)
  return reply(data)
}

// Microservices: the gateway picks a service per path
function gateway(req) {
  const service = route(req.path)
  return service.handle(req) // its own process and database
}`;

const PATHS = ['/products', '/reviews'];

export function monolithVsMicroservicesScenario(values: Record<string, string>): Read<Scenario> {
  const architecture = readChoice(values, 'architecture', 'Architecture', ['monolith', 'microservices']);
  if (!architecture.ok) return architecture;
  const bug = readChoice(values, 'bug', 'Reviews bug', ['off', 'on']);
  if (!bug.ok) return bug;
  const count = readInt(values, 'requests', 'Requests', { min: 1, max: 8 });
  if (!count.ok) return count;

  const monolith = architecture.value === 'monolith';
  const requests = Array.from({ length: count.value }, (_, i) => {
    const path = PATHS[i % 2]!;
    return { label: `GET ${path}`, path, to: monolith ? 'app' : 'gateway', at: 50 * i };
  });
  const crashIn = monolith ? 'app' : 'reviews';
  const faults = bug.value === 'on' ? [{ kind: 'crash-on' as const, node: crashIn, prefix: '/reviews' }] : [];
  if (monolith) {
    return {
      ok: true,
      value: { nodes: [client(), service('app', 1, ['db']), db('db', 2)], links: [link('client', 'app'), link('app', 'db')], requests, faults },
    };
  }
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        {
          id: 'gateway',
          label: 'gateway',
          type: 'gateway',
          column: 1,
          processMs: GATEWAY_MS,
          requireToken: false,
          routes: [
            { prefix: '/products', to: 'products' },
            { prefix: '/reviews', to: 'reviews' },
          ],
        },
        service('products', 2, ['products-db']),
        service('reviews', 2, ['reviews-db']),
        db('products-db', 3),
        db('reviews-db', 3),
      ],
      links: [link('client', 'gateway'), link('gateway', 'products'), link('gateway', 'reviews'), link('products', 'products-db'), link('reviews', 'reviews-db')],
      requests,
      faults,
    },
  };
}

const options = (monolith: boolean): StepOptions => ({
  code: monolithVsMicroservicesCode,
  lines: { handle: monolith ? 'function handle(req)' : 'function gateway(req)', route: 'route(req.path)', fault: 'crash()', fail: 'crash()', done: 'return reply(data)' },
  explain: (event) => {
    if (event.kind === 'send') {
      const m = event.message;
      if (m.kind === 'query') return { line: 'db.query(req)' };
      if (m.kind === 'reply') return { line: m.from === 'gateway' ? 'return service.handle(req)' : 'return reply(data)' };
      return { line: m.from === 'gateway' ? 'return service.handle(req)' : monolith ? 'function handle(req)' : 'function gateway(req)' };
    }
    if (event.kind === 'fault' && event.fault.kind === 'crash-on') {
      return monolith
        ? {
            title: 'A bug in the reviews code crashes app',
            why: 'The bug is only in the reviews code, but the monolith runs everything in one process. When it crashes, products goes down with it.',
          }
        : { title: 'A bug crashes the reviews service', why: 'Only the reviews service crashes. Products runs in its own process, so it keeps working.' };
    }
    if (event.kind === 'route') return { why: `The gateway looks at the path and sends ${event.request} to ${event.to}, the service that owns it. That is one more network hop than the monolith.` };
    return undefined;
  },
});

export function monolithVsMicroservicesSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(monolithVsMicroservicesScenario(values), 'Check the settings', options(values.architecture?.trim() === 'monolith'));
}
