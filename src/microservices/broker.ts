import type { Message } from './model';
import type { Behaviour } from './sim';

interface Stored {
  delivery: string;
  request: string;
  label: string;
}

/**
 * Stores what it receives and answers "stored" at once; then hands each queue's oldest message to its lowest-index
 * free consumer instance, one at a time. A refused or failed delivery goes back to the front and is tried again
 * after `redeliverMs`, so delivery is at least once.
 */
export const broker: Behaviour = (ctx, node) => {
  if (node.type !== 'broker') return () => {};
  const names = node.mode === 'queue' ? [node.id] : node.consumers;
  const queues = new Map<string, Stored[]>(names.map((name) => [name, []]));
  const consumersOf = (queue: string) => (node.mode === 'queue' ? node.consumers : [queue]).flatMap((service) => ctx.instancesOf(service));
  /** Instances holding an unacked message, and those resting after a failed delivery. */
  const busy = new Set<string>();
  const resting = new Map<string, number>();
  const storedAt = new Map<string, number>();

  const dispatch = () => {
    for (const [queue, items] of queues) {
      for (const instance of consumersOf(queue)) {
        if (items.length === 0) break;
        if (busy.has(instance) || (resting.get(instance) ?? 0) > ctx.now) continue;
        const item = items.shift()!;
        busy.add(instance);
        const message = { kind: 'deliver' as const, label: `${item.label} ${item.request}`, request: item.request, delivery: item.delivery };
        ctx.send(node.id, instance, message, (answer: Message) => {
          busy.delete(instance);
          if (answer.ok) {
            ctx.trace({ kind: 'delivered', delivery: item.delivery, consumer: instance, ok: true, ms: ctx.now - storedAt.get(item.delivery)! });
          } else {
            items.unshift(item);
            resting.set(instance, ctx.now + node.redeliverMs);
            ctx.trace({ kind: 'requeue', broker: node.id, delivery: item.delivery, reason: answer.reason ?? 'no ack' });
            ctx.at(ctx.now + node.redeliverMs, dispatch);
          }
          dispatch();
        });
      }
    }
  };
  return (message) => {
    if (message.kind !== 'request' || !message.request) return;
    const request = message.request;
    ctx.at(ctx.now + node.processMs, () => {
      const label = message.label.endsWith(` ${request}`) ? message.label.slice(0, -request.length - 1) : message.label;
      ctx.trace({ kind: 'store', broker: node.id, request, label, queues: names });
      for (const queue of names) {
        const delivery = `${request}/${queue}`;
        storedAt.set(delivery, ctx.now);
        queues.get(queue)!.push({ delivery, request, label });
      }
      ctx.reply(message, true);
      dispatch();
    });
  };
};
