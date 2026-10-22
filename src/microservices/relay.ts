import type { Message } from './model';
import type { Behaviour } from './sim';

const PREFIX = 'outbox/';

/**
 * Polls its db for outbox records, oldest first, publishes each to the broker and deletes it once the broker has
 * stored it. The next poll is scheduled `pollMs` after the last one ended, so polls never overlap.
 */
export const relay: Behaviour = (ctx, node) => {
  if (node.type !== 'relay') return () => {};
  const poll = () => {
    ctx.query(node.id, node.db, { read: `${PREFIX}*` }, 'poll outbox', undefined, (reply: Message) => {
      const found = reply.ok ? (reply.records ?? []) : [];
      ctx.trace({ kind: 'poll', relay: node.id, found: found.map(([key]) => key.slice(PREFIX.length)) });
      const publish = (index: number) => {
        const record = found[index];
        if (!record) return ctx.at(ctx.now + node.pollMs, poll);
        const [key, label] = record;
        const request = key.slice(PREFIX.length);
        ctx.at(ctx.now + node.processMs, () =>
          ctx.send(node.id, node.to, { kind: 'request', label: `${label} ${request}`, request }, (stored) => {
            // Not stored: the record stays, and the next poll tries again.
            if (!stored.ok) return publish(index + 1);
            ctx.query(node.id, node.db, { delete: [key] }, `delete ${key}`, request, () => publish(index + 1));
          }),
        );
      };
      publish(0);
    });
  };
  ctx.at(node.pollMs, poll);
  return () => {};
};
