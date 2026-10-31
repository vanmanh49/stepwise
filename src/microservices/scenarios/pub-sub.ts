import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { broker, client, link, scenarioSteps, service } from './shared';

export const pubSubCode = `// orders: publish the event, then answer the customer
async function placeOrder(req) {
  const order = save(req)
  await publish('OrderPlaced', order)   // stored: no subscriber is called
  return accepted
}

// broker: one queue per subscriber, and each gets a copy
function onPublish(event) {
  for (const queue of subscribers) queue.push(event)
}

// every subscriber, in its own time
async function onMessage(event) {
  await handle(event)                   // email a receipt, reserve stock…
  ack(event)
}`;

const SUBSCRIBERS = ['email', 'stock', 'analytics'];
const GAP_MS = 40;
const SUBSCRIBER_MS = 30;
const EMAIL_OUTAGE = { from: 20, until: 300 };

interface Settings {
  subscribers: number;
  topic: boolean;
  emailDown: boolean;
  orders: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const subscribers = readInt(values, 'subscribers', 'Subscribers', { min: 1, max: 3 });
  if (!subscribers.ok) return subscribers;
  const mode = readChoice(values, 'mode', 'Mode', ['topic', 'queue']);
  if (!mode.ok) return mode;
  const emailDown = readChoice(values, 'emailDown', 'Email down', ['off', 'on']);
  if (!emailDown.ok) return emailDown;
  const orders = readInt(values, 'orders', 'Orders', { min: 1, max: 5 });
  if (!orders.ok) return orders;
  return { ok: true, value: { subscribers: subscribers.value, topic: mode.value === 'topic', emailDown: emailDown.value === 'on', orders: orders.value } };
}

export function pubSubScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { subscribers, topic, emailDown, orders } = settings.value;
  const consumers = SUBSCRIBERS.slice(0, subscribers);
  return {
    ok: true,
    value: {
      nodes: [
        client(),
        service('orders', 1, [{ to: 'events', label: 'OrderPlaced' }]),
        broker('events', 2, topic ? 'topic' : 'queue', consumers),
        ...consumers.map((id) => service(id, 3, [], { processMs: SUBSCRIBER_MS })),
      ],
      links: [link('client', 'orders'), link('orders', 'events'), ...consumers.map((id) => link('events', id))],
      requests: Array.from({ length: orders }, (_, i) => ({ label: 'POST /orders', path: '/orders', to: 'orders', at: i * GAP_MS })),
      faults: emailDown ? [{ kind: 'outage', node: 'email', from: EMAIL_OUTAGE.from, until: EMAIL_OUTAGE.until, mode: 'refuse' }] : [],
    },
  };
}

export function pubSubSteps(values: Record<string, string>): Step[] {
  const options: StepOptions = {
    code: pubSubCode,
    lines: { store: 'for (const queue of subscribers)', delivered: 'ack(event)', requeue: 'for (const queue of subscribers)', done: 'return accepted' },
    explain: (event) => {
      if (event.kind === 'handle') return { line: event.node === 'orders' ? 'const order = save(req)' : 'await handle(event)' };
      if (event.kind === 'send') {
        const m = event.message;
        if (m.kind === 'request' && m.from === 'orders-1') return { line: "publish('OrderPlaced'" };
        if (m.kind === 'deliver') return { line: 'async function onMessage(event)' };
        if (m.kind === 'reply' && m.from === 'orders-1') return { line: 'return accepted' };
        if (m.kind === 'reply' && m.to === 'events') return { line: 'ack(event)' };
      }
      return undefined;
    },
  };
  return scenarioSteps(pubSubScenario(values), 'Check the settings', options);
}
