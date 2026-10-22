import type { Message } from './model';
import type { Behaviour } from './sim';

/**
 * A proxy beside one service. Outbound (a message with `dest`, from its own service): it sends the call on through
 * its policy, to the target's sidecar when there is one. Inbound: with mTLS it accepts only other sidecars, then
 * hands the request to the first live instance of its service.
 */
export const sidecar: Behaviour = (ctx, node) => {
  if (node.type !== 'sidecar') return () => {};
  return (message: Message) => {
    if (message.kind !== 'request' || !message.request) return;
    const request = message.request;
    const outbound = { kind: 'request' as const, label: message.label, request, ...(message.path && { path: message.path }) };
    if (message.dest) {
      const dest = message.dest;
      ctx.at(ctx.now + node.processMs, () =>
        ctx.call(node.id, ctx.entryOf(dest), outbound, node.policy, (ok, reason, value) => ctx.reply(message, ok, reason, undefined, value)),
      );
      return;
    }
    if (node.mtls && ctx.node(message.from).type !== 'sidecar') {
      const reason = '403: no client certificate';
      ctx.trace({ kind: 'deny', node: node.id, request, reason });
      return ctx.reply(message, false, reason);
    }
    ctx.at(ctx.now + node.processMs, () => {
      const instance = ctx.instancesOf(node.of).find((id) => !ctx.isDead(id)) ?? ctx.instancesOf(node.of)[0]!;
      ctx.send(node.id, instance, outbound, (answer) => ctx.reply(message, answer.ok ?? false, answer.reason, undefined, answer.value));
    });
  };
};
