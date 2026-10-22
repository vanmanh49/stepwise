import type { BreakerState, CallPolicy, Message, RetryPolicy } from './model';
import type { SimContext } from './sim';

/** How long to wait before retry `n` (1, 2, …). Equal jitter keeps half the wait and randomises the other half. */
export function retryDelay(retry: RetryPolicy, n: number, rng: () => number): number {
  const delay = retry.backoff === 'none' ? 0 : retry.backoff === 'fixed' ? retry.baseMs : retry.baseMs * 2 ** (n - 1);
  return retry.jitter ? Math.floor(delay / 2 + rng() * (delay / 2)) : delay;
}

export type CallDone = (ok: boolean, reason?: string) => void;
export type CallFn = (
  from: string,
  to: string,
  message: Pick<Message, 'kind' | 'label'> & { request?: string },
  policy: CallPolicy | undefined,
  done: CallDone,
) => void;

interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
  /** Half-open only: the trial call is in flight. */
  trial: boolean;
}

/**
 * Sends calls through their policy, once per run: each attempt passes the bulkhead, then the breaker, then goes out
 * with its timeout; failures are retried after a backoff. A call without a policy is a plain send.
 */
export function createCaller(ctx: SimContext): CallFn {
  const breakers = new Map<string, Breaker>();
  const pools = new Map<string, number>();

  return (from, to, message, policy, done) => {
    if (!policy) {
      ctx.send(from, to, message, (reply) => done(reply.ok ?? false, reply.reason));
      return;
    }
    const caller = ctx.ownerOf(from);
    const target = ctx.ownerOf(to);
    const request = message.request ?? message.label;
    let retries = 0;

    const breaker = policy.breaker && { ...policy.breaker, key: `${caller}→${target}` };
    const stateOf = (key: string) => {
      let b = breakers.get(key);
      if (!b) breakers.set(key, (b = { state: 'closed', failures: 0, openedAt: 0, trial: false }));
      return b;
    };
    const moveTo = (b: Breaker, state: BreakerState, failures: number) => {
      b.state = state;
      b.failures = failures;
      if (state === 'open') b.openedAt = ctx.now;
      if (state !== 'half-open') b.trial = false;
      ctx.trace({ kind: 'breaker', caller, target, state, failures, threshold: breaker!.threshold });
    };
    const record = (ok: boolean) => {
      if (!breaker) return;
      const b = stateOf(breaker.key);
      if (b.state === 'half-open') return moveTo(b, ok ? 'closed' : 'open', ok ? 0 : b.failures);
      if (b.state !== 'closed') return;
      if (ok) {
        if (b.failures > 0) moveTo(b, 'closed', 0);
        return;
      }
      moveTo(b, b.failures + 1 >= breaker.threshold ? 'open' : 'closed', b.failures + 1);
    };

    const shed = (reason: 'circuit open' | 'bulkhead full') => {
      ctx.trace({ kind: 'shed', caller: from, request, reason });
      done(false, reason);
    };

    const attempt = () => {
      let release = () => {};
      if (policy.bulkhead) {
        const { pool, size } = policy.bulkhead;
        const key = `${from}:${pool}`;
        const used = pools.get(key) ?? 0;
        if (used >= size) return shed('bulkhead full');
        pools.set(key, used + 1);
        ctx.trace({ kind: 'pool', caller: from, pool, used: used + 1, size });
        let held = true;
        release = () => {
          if (!held) return;
          held = false;
          const now = (pools.get(key) ?? 1) - 1;
          pools.set(key, now);
          ctx.trace({ kind: 'pool', caller: from, pool, used: now, size });
        };
      }
      if (breaker) {
        const b = stateOf(breaker.key);
        if (b.state === 'open' && ctx.now - b.openedAt >= breaker.openMs) moveTo(b, 'half-open', b.failures);
        if (b.state === 'open' || (b.state === 'half-open' && b.trial)) {
          release();
          return shed('circuit open');
        }
        if (b.state === 'half-open') b.trial = true;
      }

      let settled = false;
      const end = (ok: boolean, reason?: string) => {
        if (settled) return;
        settled = true;
        release();
        record(ok);
        if (ok) return done(true);
        if (policy.retry && retries < policy.retry.attempts) {
          retries++;
          const delayMs = retryDelay(policy.retry, retries, ctx.rng);
          ctx.trace({ kind: 'retry', caller: from, request, attempt: retries, max: policy.retry.attempts, delayMs });
          ctx.at(ctx.now + delayMs, attempt);
          return;
        }
        done(false, reason);
      };
      const sent = ctx.send(from, to, message, (reply) => end(reply.ok ?? false, reply.reason));
      const { timeoutMs } = policy;
      if (timeoutMs !== undefined) {
        // Queued now, so at a tie it runs before the reply arrives: an answer at the deadline is late.
        ctx.at(ctx.now + timeoutMs, () => {
          if (settled) return;
          ctx.cancel(sent);
          ctx.trace({ kind: 'timeout', caller: from, target, request, afterMs: timeoutMs });
          end(false, `${target} timed out after ${timeoutMs} ms`);
        });
      }
    };
    attempt();
  };
}
