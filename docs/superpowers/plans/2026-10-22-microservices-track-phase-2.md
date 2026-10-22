# Microservices Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 Communication & Resilience lessons live (timeouts, retries, circuit breaker, bulkhead, rate limiting, message queues, pub/sub, idempotency). The engine gains call policies, a message broker, three faults and a rate limiter.

**Architecture:** The phase 1 simulator stays as it is. The new pieces:
- **Call policies:** `resilience.ts` (`createCaller`) wraps client sends and service calls.
- **Broker:** `broker.ts` adds a node behaviour that stores, delivers and redelivers messages.
- **Gateway:** `behaviours.ts` gains a rate limiter (`createLimiter`).
- **Faults:** `sim.ts` gains the new faults, `dedupe` and `Call.when`.

Each engine task also narrates its own new trace events in `steps.ts`. Each lesson is a scenario module driven by the `form` input, as in phase 1.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Motion, Tailwind, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-22-microservices-track-phase-2-design.md` (phase 1's spec, `2026-10-21-microservices-track-phase-1-design.md`, still applies where this one is silent).

## Global Constraints

- **Branch and worktree:**
  - branch `microservices-phase-2`, in the worktree `/Users/manhluu/untitled folder/stepwise-phase-2`, cut from `main` at 1ba880c;
  - the spec and this plan are already committed there;
  - rebase onto `main` if PR #19 merges first.
- **Engine rules:**
  - `src/microservices/` contains no React, and all lesson text lives in `src/lessons/`;
  - engine entry points never throw on user input, and unusable form values return one step through `refusal(title, why, emptyServicesView())`.
- **Run limits and determinism:**
  - `MAX_TIME = 10_000` ms and `MAX_STEPS = 200` (+1 summary step);
  - events are ordered by `(time, sequence)`, and the only randomness is `rng(seed)`;
  - lessons that use randomness set `seed: 7`.
- **A call with no policy behaves exactly as in phase 1.** Every phase 1 scenario test must keep passing unchanged.
- **Shared numbers** (from `scenarios/shared.ts`):
  - links 5 ms, instances 10 ms;
  - gateway 2 ms, db 3 ms;
  - broker 2 ms (new: `BROKER_MS`).
- **Code lines** use `lineOf(code, snippet)`, never hard-coded numbers.
- **Lesson content:**
  - category `microservices`, difficulty `intermediate`, group `Communication & Resilience`;
  - no `complexity`;
  - `codeLabel: 'Pseudocode'`;
  - quizzes have 4–5 questions of at least 3 types, including one `predict-next` with a `view`.
- **Copy** is plain, short sentences that use the run's actual values.
- **Badges** are at most 24 characters.
- **Commit messages, PR titles and PR bodies** contain no AI attribution.
- **Every task ends green** on `npm run typecheck && npm run lint && npm test`.
- **Stale Vitest cache:** if "No content module for <id>" appears after adding a lesson file, delete `node_modules/.vitest-cache`.

## Review Focus

- **A reply that arrives exactly at the timeout deadline** counts as late: the attempt fails and the reply is traced as `late`. This is pinned in Task 2 ("tie at the deadline").
- **A run that can't finish**, such as a hang with no timeout, or a consumer down past `MAX_TIME`, ends at `MAX_TIME`. Every request and delivery row is `failed`, never `pending`. Pinned in Task 1 (hang) and Task 4 (undelivered).
- **Fast failures combined with retries:** a call turned away by its own breaker or bulkhead is not retried, and its try count doesn't grow. Pinned in Task 2.
- **Many messages on one link at once**, such as 8 retries sent at 0 ms, stay readable as 3 pills plus "+N more". Pinned in Task 5 (`stackMessages`) and checked by eye in Task 7.
- **Phone width with a broker and 3 subscribers:** every box fits inside 343 px in the rows layout. Pinned in Task 12.

---

## File map

| File | Responsibility |
|---|---|
| `src/microservices/model.ts` | new types: `CallPolicy`, `RetryPolicy`, `RateLimit`, broker node, faults, trace events, `DeliveryOutcome` |
| `src/microservices/resilience.ts` | `retryDelay`, `createCaller` (bulkhead → breaker → send with timeout, and retries) |
| `src/microservices/broker.ts` | broker behaviour: store, deliver, requeue |
| `src/microservices/behaviours.ts` | `createLimiter`, and the gateway's rate limit |
| `src/microservices/sim.ts` | outage and lose-reply faults, `dedupe`, `Call.when`, policy wiring, `deliver` messages, waiting for deliveries, `SimResult.deliveries` |
| `src/microservices/steps.ts` | narration for the new events, badges, try counts, delivery rows, queue rows |
| `src/microservices/scenarios/shared.ts` | `BROKER_MS`, `broker()`, `callsTo()`, `busiest()` |
| `src/microservices/scenarios/<id>.ts` (+ test) | one module per lesson |
| `src/types/visualization.ts` | `ServicesView` node type `'broker'`, request row `attempts` |
| `src/components/visualization/renderers/servicesLayout.ts` | `stackMessages` |
| `src/components/visualization/renderers/ServicesRenderer.tsx` | broker type name, try counts, stacked pills |
| `src/lessons/meta/microservices.ts`, `src/lessons/microservices/<id>.ts` | metadata and content |

---

### Task 1: Outages, lost replies, `Call.when` and `dedupe`

**Files:**
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/microservices/scenarios/shared.ts`
- Test: `src/microservices/sim.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Produces, in `model.ts`:**

```ts
// Fault gains:
| { kind: 'outage'; node: string; from: number; until: number; mode: 'refuse' | 'hang' }
| { kind: 'lose-reply'; node: string; request: string }
// Call gains: when?: string   (path prefix)
// service NodeSpec gains: dedupe?: boolean
// TraceEvent gains:
| { kind: 'recover'; node: string }
| { kind: 'lost'; message: Message }
| { kind: 'duplicate'; node: string; instance: string; request: string; status: 'replayed' | 'in progress' }
```

- **Produces, in `shared.ts`:** `service()` options gain `dedupe?: boolean`.

- [ ] **Step 1: Set up the worktree**

Run: `cd "/Users/manhluu/untitled folder/stepwise-phase-2" && npm ci && npm test 2>&1 | tail -3`
Expected: the suite passes (about 3,039 tests).

- [ ] **Step 2: Write the failing tests** in `sim.test.ts`. They use `client → api` (1 instance, 10 ms) and the shared builders.

```ts
it('stops work in progress during a refuse outage and recovers at until', () => {
  // api takes 30 ms here; requests at 0, 40 and 120; outage refuse on api from 20 to 100
  expect(result.requests.map((r) => [r.status, r.reason])).toEqual([
    ['failed', 'api-1 stopped'], ['failed', 'api-1 refused the connection'], ['ok', undefined],
  ]);
  expect(result.trace.find((e) => e.kind === 'recover')).toMatchObject({ t: 100, node: 'api' });
});
it('never answers a request that arrives during a hang', () => {
  // hang from 0 to 50; requests at 0 and 60
  expect(result.requests.map((r) => r.status)).toEqual(['failed', 'ok']);
  expect(result.requests[0]!.reason).toBe('no reply by 10,000 ms');
});
it('loses the first reply a node sends for the named request', () => {
  // lose-reply { node: 'api', request: '#2' }; requests at 0 and 50
  const lost = result.trace.filter((e) => e.kind === 'lost');
  expect(lost).toHaveLength(1);
  expect(lost[0]).toMatchObject({ t: 70, message: { from: 'api-1', request: '#2' } });
  expect(result.requests.map((r) => r.status)).toEqual(['ok', 'failed']);
});
it('replays a finished request and refuses one still in progress when dedupe is on', () => {
  // s1 calls [api, api] sequentially → second is replayed; parallel → second is 'in progress'
  expect(sequential.trace.filter((e) => e.kind === 'duplicate').map((e) => e.status)).toEqual(['replayed']);
  expect(sequential.requests[0]!.status).toBe('ok');
  expect(parallel.trace.filter((e) => e.kind === 'duplicate').map((e) => e.status)).toEqual(['in progress']);
  expect(parallel.requests[0]).toMatchObject({ status: 'failed', reason: 'already in progress' });
});
it('skips calls whose path does not match when', () => {
  // api calls [{ to: 'a', when: '/a' }, { to: 'b', when: '/b' }]; request path '/b/x'
  expect(result.requests[0]!.hops).toEqual(['client', 'api-1', 'b-1']);
});
```

In `steps.test.ts`, run `traceSteps` on the outage, lose-reply and dedupe scenarios, and expect these titles:
- `api stops answering` (refuse) and `api hangs` (hang);
- `api is back`;
- `The reply to #2 is lost on the way`;
- `api-1 has already handled #1, so it returns the saved result`;
- `api-1 is still working on #1, so it turns the repeat away`.

Also check that the api instances have role `discarded` between the `refuse` fault step and the `recover` step.

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run src/microservices/sim.test.ts src/microservices/steps.test.ts`
Expected: FAIL. The new fault kinds don't type-check, and the outcomes don't match.

- [ ] **Step 4: Implement in `sim.ts`**

- **Refuse outage:**
  - at `from`, trace `fault`, then `kill` every instance of the node;
  - at `until`, remove them from `dead` and trace `recover`.
- **Hang outage:** a request or delivery handled while `from ≤ now < until` is traced `handle` and never finishes.
- **Lose-reply:** in `deliver`, the first `reply` whose owner is `node` and whose `request` matches is traced `lost` and dropped. Its awaiting handler stays, so a timeout can still fire.
- **Dedupe:** each service with `dedupe` keeps `finished: Map<request, { ok; reason? }>` and `running: Set<request>`.
  - A repeat of a finished request is traced `duplicate replayed` and answered at once with the saved result. It skips the processing time and the calls.
  - A repeat of a running request is traced `duplicate in progress` and fails at once with "already in progress".
- **`Call.when`:** a call is skipped when the request's path doesn't start with `when`.

In `steps.ts`, narrate the events above:
- `fault` outage marks the instances dead (refuse only);
- `recover` clears them.

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run src/microservices`
Expected: PASS, including every phase 1 scenario test.

- [ ] **Step 6: Commit**

```bash
git add src/microservices
git commit -m "Simulator: outages, lost replies, path-conditional calls and dedupe"
```

---

### Task 2: Call policies (`resilience.ts`)

**Files:**
- Create: `src/microservices/resilience.ts`, `src/microservices/resilience.test.ts`
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/types/visualization.ts`
- Test: `src/microservices/steps.test.ts`

**Interfaces:**
- **Consumes:** `SimContext` and `Behaviour` (`sim.ts`), and Task 1's faults.
- **Produces, in `model.ts`:**

```ts
export interface RetryPolicy { attempts: number; backoff: 'none' | 'fixed' | 'exponential'; baseMs: number; jitter: boolean }
export interface CallPolicy { timeoutMs?: number; retry?: RetryPolicy; breaker?: { threshold: number; openMs: number }; bulkhead?: { pool: string; size: number } }
export type BreakerState = 'closed' | 'open' | 'half-open';
// Call gains: policy?: CallPolicy.  Scenario gains: clientPolicy?: CallPolicy.
// RequestOutcome gains: attempts: number   (request messages the client sent for it)
// TraceEvent gains:
| { kind: 'timeout'; caller: string; request: string; afterMs: number }
| { kind: 'late'; message: Message }
| { kind: 'retry'; caller: string; request: string; attempt: number; delayMs: number }
| { kind: 'breaker'; caller: string; target: string; state: BreakerState; failures: number }
| { kind: 'shed'; caller: string; request: string; reason: 'circuit open' | 'bulkhead full' }
| { kind: 'pool'; caller: string; pool: string; used: number; size: number }
```

- **Produces, in `resilience.ts`:**

```ts
export function retryDelay(retry: RetryPolicy, n: number, rng: () => number): number;
export type CallDone = (ok: boolean, reason?: string) => void;
export type CallFn = (from: string, to: string, message: Pick<Message, 'kind' | 'label'> & { request?: string }, policy: CallPolicy | undefined, done: CallDone) => void;
export function createCaller(ctx: SimContext): CallFn;
```

- **Produces, in `SimContext`:** `cancel(message: Message): void` stops waiting for that message's reply. When the reply arrives, it's traced `arrive`, then `late`, and dropped.
- **Produces, in the view:** `ServicesView['requests'][number]` gains `attempts?: number`.
- **Who owns the state:**
  - `caller` in `timeout`, `retry`, `shed` and `pool` events is the sending node or instance id;
  - in `breaker` events, `caller` is the owning service (or `client`) and `target` is the target's owner.

- [ ] **Step 1: Write the failing tests** in `resilience.test.ts`. They use `client → api` with `clientPolicy` unless a test says otherwise.

```ts
it('computes retry delays', () => {
  const base = { attempts: 4, baseMs: 50, jitter: false };
  expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'none' }, n, rng))).toEqual([0, 0, 0, 0]);
  expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'fixed' }, n, rng))).toEqual([50, 50, 50, 50]);
  expect([1, 2, 3, 4].map((n) => retryDelay({ ...base, backoff: 'exponential' }, n, rng))).toEqual([50, 100, 200, 400]);
});
it('keeps equal-jitter delays between half and all of the delay', () => {
  // 100 draws per n with backoff exponential, jitter true: Number.isInteger(d) && d >= full / 2 && d <= full
});
it('fails an attempt at sent + timeoutMs and ignores the late reply', () => {
  // api 100 ms, timeoutMs 50
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'api timed out after 50 ms', ms: 50 });
  expect(result.trace.find((e) => e.kind === 'late')).toMatchObject({ t: 110 });
});
it('treats a reply at the deadline as late (tie at the deadline)', () => {
  // api 40 ms → reply arrives at 50; timeoutMs 50
  expect(result.requests[0]!.status).toBe('failed');
  expect(result.trace.find((e) => e.kind === 'late')).toMatchObject({ t: 50 });
});
it('retries refused calls and counts the tries', () => {
  // refuse outage 0–1000, retry { attempts: 2, backoff: 'none' }
  expect(result.requests[0]).toMatchObject({ status: 'failed', attempts: 3 });
});
it('does not retry a call its own breaker turns away', () => {
  // breaker { threshold: 1, openMs: 1000 }, retry { attempts: 3, backoff: 'none' }, refuse outage 0–1000
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'circuit open', attempts: 1 });
});
it('moves the breaker closed → open → half-open → closed, or back to open', () => {
  // threshold 2, openMs 100; requests at 0, 20, 40, 160; refuse outage until 150 (recovers) / until 5000 (stays down)
  const states = (r: SimResult) => r.trace.flatMap((e) => (e.kind === 'breaker' ? [e.state] : [])).filter((s, i, all) => s !== all[i - 1]);
  expect(states(recovers)).toEqual(['closed', 'open', 'half-open', 'closed']);
  expect(states(staysDown)).toEqual(['closed', 'open', 'half-open', 'open']);
  expect(recovers.requests[2]).toMatchObject({ status: 'failed', reason: 'circuit open' });
});
it('turns calls away when the pool is full and frees the slot when an attempt ends, even by timeout', () => {
  // api → slow (200 ms) with bulkhead { pool: 'p', size: 1 }, timeoutMs 30
  // requests at 0, 1 and 60: #2 'bulkhead full'; #1 times out; #3 gets the slot (times out, not 'bulkhead full')
});
it('adds no new event kinds to phase 1 lessons', () => {
  // every preset of the 7 phase 1 lessons: trace kinds ⊆ the phase 1 set
});
```

In `steps.test.ts`, check these titles:
- `api gives up on inventory after 200 ms` (`timeout`, narrated with the caller's service name);
- `#1 tries again in 50 ms (retry 1 of 2)`;
- `The breaker on api → payments opens after 3 failures in a row`;
- `api turns #7 away: circuit open`;
- a `late` step whose title contains `too late`.

Check these view values too:
- the badge `breaker open` on the caller's node;
- the badge `pool 1/1` (one pool) and `recs 2/2, checkout 0/2` (two pools);
- a request row with `attempts: 3`;
- no step is created for a `pool` event alone.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/microservices/resilience.test.ts src/microservices/steps.test.ts`
Expected: FAIL, because `resilience.ts` doesn't exist yet.

- [ ] **Step 3: Implement `retryDelay` and `createCaller` in `resilience.ts`.** Follow the spec's "Call policies" section:
  - **Each attempt:** bulkhead → breaker → `ctx.send`, with a timer at `sent + timeoutMs`. The timer is queued at send time, so at a tie it runs before the reply arrives, which makes the reply late. When the timer fires, it calls `ctx.cancel(sent)`.
  - **Retries:** on a refused connection, a failed reply or a timeout, wait `retryDelay` and try again, until `retry.attempts` retries have been made.
  - **State keys:**
    - a breaker for each `ownerOf(from) + '→' + ownerOf(to)`;
    - a pool for each `from + ':' + pool`.
  - **Pool events:** trace `pool` on every change in use.

  Wire it into `sim.ts`:
  - `ctx.call = createCaller(ctx)`;
  - direct client sends use `ctx.call(client.id, to, …, scenario.clientPolicy, finish)`;
  - service calls use `ctx.call(instance, first, …, target.policy, …)`. Calls to a db keep using `ctx.send` directly, with their `queryColumns`. Policies apply only to calls to services and brokers, and no lesson puts a policy on a db call.
  - `RequestOutcome.attempts` counts the `request` messages sent from the client for that id.

- [ ] **Step 4: Narrate in `steps.ts`:**
  - each new event;
  - the breaker badge (`breaker closed 1/3`, `breaker open`, `breaker half-open`) on the caller's node;
  - the pool badges, from `pool` events, which are applied but never get a step of their own;
  - `attempts` on request rows when it's more than 1.

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run src/microservices`
Expected: PASS, including every phase 1 test.

- [ ] **Step 6: Commit**

```bash
git add src/microservices src/types/visualization.ts
git commit -m "Simulator: call policies with timeouts, retries, circuit breaker and bulkhead"
```

---

### Task 3: Rate limiter at the gateway

**Files:**
- Modify: `src/microservices/model.ts`, `src/microservices/behaviours.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`
- Test: `src/microservices/behaviours.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Produces, in `model.ts`:**

```ts
export interface RateLimit { algorithm: 'fixed-window' | 'token-bucket'; limit: number; windowMs: number; per: 'all' | 'caller' }
// gateway NodeSpec gains: rateLimit?: RateLimit.  RequestSpec gains: caller?: string.
// reject status becomes 401 | 404 | 429.  TraceEvent gains:
| { kind: 'limit'; gateway: string; request: string; key: string; allowed: boolean; used: number; limit: number }
```

- **Produces, in `behaviours.ts`:** `export function createLimiter(config: RateLimit): (key: string, now: number) => { allowed: boolean; used: number }`.
  - Fixed window: `used` is the count in the current window, including this request when it is allowed.
  - Token bucket: `used` is `limit − floor(tokens left)` after the check.
  - The key is `'all'`, or the request's `caller` when `per` is `'caller'`.
- **Produces, in `SimContext`:** `requestInfo` also returns `caller?: string`.

- [ ] **Step 1: Write the failing tests** in `behaviours.test.ts`.

```ts
it('allows limit requests per fixed window', () => {
  const allow = createLimiter({ algorithm: 'fixed-window', limit: 2, windowMs: 100, per: 'all' });
  expect([0, 10, 20, 100].map((t) => allow('all', t).allowed)).toEqual([true, true, false, true]);
});
it('refills a token bucket continuously from full', () => {
  const allow = createLimiter({ algorithm: 'token-bucket', limit: 5, windowMs: 100, per: 'all' });
  expect([0, 0, 0, 0, 0, 0].map((t) => allow('all', t).allowed)).toEqual([true, true, true, true, true, false]);
  expect(allow('all', 20).allowed).toBe(true);
  expect(allow('all', 21).allowed).toBe(false);
});
it('keeps a separate count per key', () => { /* bob uses up limit 1; alice still allowed */ });
it('refuses over-limit requests with 429 at the gateway', () => {
  // client → gateway(limit 1, fixed) → api; requests at 0 and 1
  expect(result.requests[1]).toMatchObject({ status: 'failed', reason: '429: rate limit', hops: ['client', 'gateway'] });
});
```

In `steps.test.ts`, check:
- the titles `The gateway lets #1 through: 1 of 5 used` and `The gateway refuses #6 with 429: 5 of 5 used in this window`;
- for the token bucket, `The gateway refuses #7 with 429: no tokens left`;
- the gateway badges `5/5 this window` and `tokens 0/5`, and per caller `bob 5/5, alice 1/5`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/microservices/behaviours.test.ts src/microservices/steps.test.ts`
Expected: FAIL, because `createLimiter` is missing.

- [ ] **Step 3: Implement.**
  - **Limiter:** `createLimiter` as specified above.
  - **Gateway:** it checks the limit after the token check and before routing. It traces `limit`, and if the request is refused, it traces `reject` with status 429 and replies `429: rate limit`.
  - **Steps:** narrate `limit` and the 429 reject, and add the badges.

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx vitest run src/microservices`
Expected: PASS.

- [ ] **Step 5: Commit:** `git commit -am "Simulator: rate limiting at the gateway"`

---

### Task 4: Message broker

**Files:**
- Create: `src/microservices/broker.ts`, `src/microservices/broker.test.ts`
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/microservices/scenarios/shared.ts`, `src/types/visualization.ts`, `src/components/visualization/renderers/ServicesRenderer.tsx` (`TYPE_NAME.broker = 'message broker'` only)
- Test: `src/microservices/steps.test.ts`

**Interfaces:**
- **Produces, in `model.ts`:**

```ts
// NodeSpec gains: | { type: 'broker'; processMs: number; mode: 'queue' | 'topic'; consumers: string[]; redeliverMs: number }
// MessageKind gains 'deliver'.  Call gains: label?: string  (message label for this call, e.g. 'OrderPlaced').
export interface DeliveryOutcome { id: string; request: string; label: string; queue: string; consumer?: string; status: 'ok' | 'failed'; ms: number; attempts: number; reason?: string }
// SimResult gains: deliveries: DeliveryOutcome[]
// TraceEvent gains:
| { kind: 'store'; broker: string; request: string; label: string; queues: string[] }
| { kind: 'requeue'; broker: string; delivery: string; reason: string }
| { kind: 'delivered'; delivery: string; consumer?: string; ok: boolean; ms: number; reason?: string }
```

- **Naming:**
  - a queue is named after the broker in `queue` mode, or after the consumer service in `topic` mode;
  - a delivery id is `${request}/${queue}`, and its label is `${label} → ${queue}`.
- **Produces, in `broker.ts`:** `export const broker: Behaviour`.
- **Produces, in `shared.ts`:** `BROKER_MS = 2` and `broker(id: string, column: number, mode: 'queue' | 'topic', consumers: string[], redeliverMs = 50): NodeSpec`.
- **Produces, in the view:** `ServicesView` node `type` gains `'broker'`.
  - A broker's `instances` are its queues: the id is the queue name, the badge is `N waiting` or `empty`, and the role is `active` while the queue isn't empty.
  - Delivery rows use the delivery id and label.

- [ ] **Step 1: Write the failing tests** in `broker.test.ts`.

```ts
it('gives each queued message to exactly one free worker instance', () => {
  // client → jobs (queue, consumers ['worker']) → worker ×2 (60 ms); 4 requests at 0
  expect(result.deliveries.map((d) => d.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
  expect(new Set(result.deliveries.map((d) => d.consumer))).toEqual(new Set(['worker-1', 'worker-2']));
});
it('copies each message into every subscriber queue in topic mode', () => {
  expect(result.deliveries.map((d) => d.id)).toEqual(['#1/a', '#1/b', '#2/a', '#2/b']);
});
it('answers the producer once the message is stored', () => {
  expect(result.requests[0]).toMatchObject({ status: 'ok', ms: 12 });
});
it('never gives one instance two unacked messages', () => { /* walk the trace: deliver sends vs acks per instance */ });
it('requeues a refused delivery and redelivers it after redeliverMs', () => {
  // worker refuse outage 0–100, redeliverMs 50
  expect(result.trace.some((e) => e.kind === 'requeue')).toBe(true);
  expect(result.deliveries[0]).toMatchObject({ status: 'ok' });
  expect(result.deliveries[0]!.attempts).toBeGreaterThan(1);
});
it('keeps running until every delivery is acked', () => {
  expect(result.endedAt).toBeGreaterThanOrEqual(Math.max(...result.deliveries.map((d) => d.ms)));
});
it('fails deliveries still open at MAX_TIME', () => {
  // worker refuse outage 0–20000
  expect(result.deliveries.every((d) => d.status === 'failed' && d.reason === 'not processed by 10,000 ms')).toBe(true);
});
```

In `steps.test.ts`, check:
- the titles `The broker stores #3 in 3 queues`, `The broker puts #1 back in the queue` (requeue), and `email-1 finishes #1` (delivered);
- the row ids in order: `['#1', '#1/a', '#1/b', '#2', '#2/a', '#2/b']`;
- the queue badge `2 waiting`;
- no row is `pending` in the last step.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/microservices/broker.test.ts src/microservices/steps.test.ts`
Expected: FAIL, because `broker.ts` doesn't exist yet.

- [ ] **Step 3: Implement.**
  - **Broker behaviour:** follow the spec's Broker paragraph. It stores the message after `processMs`, replies "stored", and calls a `dispatch()` that sends each queue's oldest message to its lowest-index free consumer instance (prefetch 1).
    - On an ok reply, it traces `delivered`.
    - On a refused or failed reply, it puts the message back at the front of its queue, traces `requeue`, and schedules `dispatch` after `redeliverMs`.
  - **Service behaviour:** handles `deliver` like `request`.
  - **The sim:**
    - tracks open deliveries from `store` and `delivered` events, inside `ctx.trace`;
    - doesn't stop while any delivery is open;
    - at the end, fails the leftovers with "not processed by 10,000 ms";
    - builds `deliveries`.

  A `Call` to a broker sends a `request` message labelled `${call.label ?? request label} ${request}`.
- [ ] **Step 4: Steps.**
  - **Narration:** narrate `store`, `requeue` and `delivered`. Name brokers "the broker".
  - **Delivery rows:** a row is created at `store`, gains hops from `deliver` arrivals and settles at `delivered`. Rows are sorted by request number, with each request before its deliveries.
  - **Queue rows:** show each broker queue as a row with its badge.

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run src/microservices`
Expected: PASS.

- [ ] **Step 6: Commit:** `git commit -am "Simulator: message broker with queues, topics and redelivery"` (stage the new files first).

---

### Task 5: Stacked message pills and the renderer

**Files:**
- Modify: `src/components/visualization/renderers/servicesLayout.ts`, `src/components/visualization/renderers/ServicesRenderer.tsx`
- Test: `src/components/visualization/renderers/servicesLayout.test.ts`

**Interfaces:**
- **Produces:**

```ts
export type StackedPill = ServicesView['messages'][number] & { slot: number };
/** Messages on the same from→to link within 0.05 progress stack in slots 0–2; the rest fold into one "+N more" pill in slot 3. */
export function stackMessages(messages: ServicesView['messages']): StackedPill[];
```

- [ ] **Step 1: Write the failing tests**

```ts
it('stacks up to three pills on one spot and folds the rest', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, from: 'client', to: 'api', label: `GET #${i}`, role: 'frontier' as const, progress: 0.5 }));
  const pills = stackMessages(six);
  expect(pills.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
  expect(pills.at(-1)).toMatchObject({ id: 'more-m3', label: '+3 more' });
});
it('stacks within 0.05 progress only, and only on the same link', () => {
  // 0.50 & 0.53 same link → slots 0,1; 0.50 & 0.60 → both slot 0; same progress on another link → slot 0
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/components/visualization/renderers/servicesLayout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **`stackMessages`:** pills keep their message order. A "+N more" pill takes the role of the first message it folds.
  - **Renderer:**
    - draw `stackMessages(view.messages)` and shift each pill by `slot × (PILL_HEIGHT + 2)` along the link's normal;
    - show `· N tries` after a row's status when `attempts > 1`;
    - include delivery rows in the table caption's count.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -am "Services view: stack messages that share a link"`

---

### Tasks 6–13: the eight lessons

Every lesson task has the shape of phase 1 Tasks 6–12.

**Files per lesson:**
- Create:
  - `src/microservices/scenarios/<id>.ts`;
  - `src/microservices/scenarios/<id>.test.ts`;
  - `src/lessons/microservices/<id>.ts`.
- Modify:
  - `src/lessons/meta/microservices.ts`: append the lesson;
  - `src/lessons/lessons.test.ts`: append the id to `EXPECTED_IDS`, and raise `lessonsIn('microservices')` by one;
  - `src/microservices/contract.test.ts`: add a `RANGES` entry.

**Interfaces per lesson:** `<camel>Code`, `<camel>Scenario(values): Read<Scenario>` and `<camel>Steps(values): Step[]`, using `scenarioSteps(read, 'Check the settings', options)`. `Steps` returns a refusal for unusable values.

**Steps per lesson:**
- [ ] **Step 1: Write the teaching-moment tests,** one per preset plus one refusal, using `<camel>Scenario` + `simulate` (and `<camel>Steps` for titles and variables).
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the scenario module.** Use the topology, fields and numbers below. The pseudocode is 10–20 lines and contains the listed snippets.
- [ ] **Step 4: Write the content and metadata.**
  - **Content:**
    - `overview`;
    - at least 2 `concept` items and at least 4 `howItWorks` items;
    - the `form` visualization, whose first preset is the default;
    - `prosCons`;
    - at least 3 `applications` and at least 3 `commonMistakes`;
    - the quiz;
    - at least 3 `summary` lines.
  - **Metadata:**
    - difficulty `intermediate`, group `Communication & Resilience`;
    - `prerequisites`: the previous lesson (`database-per-service` for Timeouts);
    - a description and keywords.
- [ ] **Step 5: Run the checks.** Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 6: Check it in the browser.** Run `npm run dev` and open `/microservices/<id>`, then:
  - play every preset and check the narration, the pills, the badges and the table;
  - repeat at 375 px (no sideways scroll) and in dark mode.
- [ ] **Step 7: Commit:** `git commit -m "Microservices lesson: <Title>"`.

### Task 6: Timeouts

- **Topology:** `client`(0) → `api`(1) → `inventory`(2, `processMs` = field).
  - api → inventory: `policy: { timeoutMs: apiTimeout }` when it's greater than 0.
  - `clientPolicy: { timeoutMs: clientTimeout }` when it's greater than 0.
- **Fields** (all numbers):
  - `inventory`: "Inventory time" (10–1000), sample 600;
  - `apiTimeout`: "API timeout" (0–2000, where 0 means none), sample 0;
  - `clientTimeout` (0–2000), sample 0;
  - `requests` (1–4), sample 2, one every 100 ms.
- **Presets:**
  - "No timeouts" `{600, 0, 0, 2}`;
  - "API timeout 200 ms" `{600, 200, 0, 2}`;
  - "Timeout too short" `{20, 25, 0, 2}`;
  - "Client gives up first" `{600, 400, 150, 2}`.
- **Tests:**
  - *No timeouts:* both ok with `ms` 630.
  - *API timeout 200:* #1 fails with `ms` 220 and reason `inventory timed out after 200 ms`, and there's a `late` event at 625.
  - *Too short:* every request fails, and inventory still `handle`s each one.
  - *Client first:* #1 fails with `ms` 150. api's `timeout` event (t 415) comes after the client's (t 150), and its failed reply to the client is `late`.
  - Refusal: `inventory: '0'`.
- **Snippets:** `handle` → `async function handle(req)`, `timeout` → `setTimeout`, `late` → `// too late`, `done` → `return`.
- **RANGES:** `inventory [10, 1000], apiTimeout [0, 2000], clientTimeout [0, 2000], requests [1, 4]`.

### Task 7: Retries with Backoff & Jitter

- **Topology:** `client`(0) → `api`(1). Refuse outage on `api` from 0 until `outage`. `seed: 7`.
  - `clientPolicy.retry = { attempts: retries, backoff, baseMs: 50, jitter: jitter === 'on' }`.
- **Fields:**
  - `retries` (0–4), sample 3;
  - `backoff` (none/fixed/exponential), sample none;
  - `jitter` (off/on), sample off;
  - `outage` (0–500), sample 200;
  - `requests` (1–8), sample 6, all at 0.
- **Shared helpers** in `shared.ts`:
  - `callsTo(trace, node): number[]` gives the arrival times of `request` messages at the node's instances;
  - `busiest(times, windowMs = 10): number` gives the most arrivals in any `[t, t + windowMs)`.
- **Step variables:** `calls to api` and `busiest 10 ms`, counting arrivals so far.
- **Presets:**
  - "No retries" `{0, none, off}`;
  - "Immediate retries" `{3, none, off}`;
  - "Fixed backoff" `{3, fixed, off}`;
  - "Exponential backoff" `{3, exponential, off}`;
  - "Exponential backoff with jitter" `{3, exponential, on}`.

  All presets use `outage 200` and `requests 6`.
- **Tests:**
  - *No retries:* 6 failed, 6 calls.
  - *Immediate:* 6 failed, 24 calls, and every call arrives before 200.
  - *Fixed:* 6 failed, and the 4th tries arrive at 185.
  - *Exponential:* 6 ok with `ms` 400, and `busiest` is 6.
  - *Jitter:* 6 ok, `busiest` is under 6, and the same values give the same steps.
  - Refusal: `retries: '5'`.
- **Snippets:** `retry` → `await sleep(backoff(n))`, `handle` → `async function callWithRetry(`, `done` → `return answer`.
- **Check by eye:** the pills at 0 ms stack as 3 plus "+3 more".
- **RANGES:** `retries [0, 4], outage [0, 500], requests [1, 8]`.

### Task 8: Circuit Breaker

- **Topology:** `client`(0) → `api`(1) → `payments`(2). A hang outage on `payments` runs from 40 until `recovers`.
  - api → payments `policy`: `{ timeoutMs: 100, breaker: { threshold, openMs } }` when `breaker` is on, otherwise `{ timeoutMs: 100 }`.
- **Fields:**
  - `breaker` (off/on), sample off;
  - `threshold` (1–5), sample 3;
  - `openMs` (50–500), sample 150;
  - `recovers` (100–2000), sample 300;
  - `requests` (4–16), sample 12, `POST /pay` every 40 ms.
- **Presets:**
  - "No breaker" `{off}`;
  - "Breaker opens, then closes" `{on}`;
  - "Payments stays down" `{on, recovers 2000}`.
- **Tests:**
  - *No breaker:* #2–#7 fail with `ms` ≥ 120 and reason `payments timed out after 100 ms`; #8 is ok.
  - *Breaker:*
    - #2–#4 time out;
    - the breaker opens at 235;
    - #7–#10 fail with reason `circuit open` and `ms` 20;
    - payments gets no request between 235 and 385;
    - #11 is the half-open trial and is ok, after which the breaker is `closed`.
  - *Stays down:* #11's trial times out, the breaker opens again, and #12 fails `circuit open`.
  - Refusal: `threshold: '0'`.
- **Badge:** `breaker closed 2/3` on api after #3's timeout.
- **Snippets:** `breaker` → `state = 'open'`, `shed` → `throw new CircuitOpen()`, `timeout` → `callWithTimeout(`, `done` → `onSuccess()`.
- **RANGES:** `threshold [1, 5], openMs [50, 500], recovers [100, 2000], requests [4, 16]`.

### Task 9: Bulkhead

- **Topology:** `client`(0) → `api`(1) → `recommendations`(2, labelled `recs`; 10 ms, or 400 ms when slow) and `checkout`(2).
  - api calls `{ to: 'recommendations', when: '/recs', policy: { bulkhead } }` and `{ to: 'checkout', when: '/checkout', policy: { bulkhead } }`.
  - Pools: `shared` size 4 for both calls, or `recs` size 2 and `checkout` size 2 when separate.
- **Fields:**
  - `pools` (shared/separate), sample shared;
  - `recs` (normal/slow), sample slow;
  - `requests` (2–12), sample 10, alternating `GET /recs` and `POST /checkout` every 10 ms from 0.
- **Presets:**
  - "Shared pool, slow recommendations" `{shared, slow}`;
  - "Separate pools, slow recommendations" `{separate, slow}`;
  - "Normal speed" `{shared, normal}`.
- **Tests:**
  - *Shared + slow:* at least one `POST /checkout` fails with `bulkhead full`.
  - *Separate + slow:* every checkout is ok, and at least one `/recs` fails with `bulkhead full`.
  - *Normal:* all ok for both settings of `pools`.
  - Refusal: `requests: '1'`.
- **Badges:** `pool 4/4` (shared) and `recs 2/2, checkout 0/2` (separate).
- **Snippets:** `pool` → `pool.acquire()`, `shed` → `throw new BulkheadFull()`, `done` → `pool.release()`.
- **RANGES:** `requests [2, 12]`.

### Task 10: Rate Limiting

- **Topology:** `client`(0) → `gateway`(1, route `/` → `api`, `rateLimit: { algorithm, limit, windowMs: 100, per }`) → `api`(2).
- **Traffic:**
  - *steady:* 10 `GET /data (alice)` every 25 ms from 0;
  - *edge:* 5 at 90 ms and 5 at 110 ms, all alice;
  - *noisy:* bob sends 8 at 0, 5, …, 35, and alice sends at 12 and 42.

  Each request sets `caller`.
- **Fields:**
  - `algorithm` (fixed-window/token-bucket), sample fixed-window;
  - `limit` (1–10), sample 5;
  - `per` (all/caller), sample all;
  - `traffic` (steady/edge/noisy), sample steady.
- **Presets:**
  - "Steady traffic" `{fixed-window, 5, all, steady}`;
  - "Fixed window: burst at the edge" `{fixed-window, 5, all, edge}`;
  - "Token bucket at the edge" `{token-bucket, 5, all, edge}`;
  - "Noisy caller, shared limit" `{fixed-window, 5, all, noisy}`;
  - "Limit per caller" `{fixed-window, 5, caller, noisy}`.
- **Tests:**
  - *Steady:* 10 ok.
  - *Edge, fixed:* 10 ok.
  - *Edge, token bucket:* 6 ok and 4 failed with `429: rate limit`.
  - *Noisy, shared:* alice's second request fails with 429.
  - *Per caller:* alice has 2 ok, and bob has 5 ok and 3 refused.
  - Refusal: `limit: '0'`.
- **Snippets:** `limit` → `function allow(req)`, `reject` → `return 429`, `route` → `forward(req)`.
- **RANGES:** `limit [1, 10]`.

### Task 11: Message Queues

- **Topology:**
  - *sync:* `client`(0) → `worker`(1, `workers` instances, 60 ms).
  - *queue:* `client`(0) → `jobs` (broker, queue mode, consumers `['worker']`, redeliver 50) at column 1 → `worker`(2).
  - With `outage` on, the worker has a refuse outage from 30 to 230.
- **Fields:**
  - `style` (sync/queue), sample sync;
  - `workers` (1–3), sample 1;
  - `jobs` (1–10), sample 6, `POST /resize` every 20 ms;
  - `outage` (off/on), sample on.
- **Step variable:** `waiting`, the depth of the jobs queue.
- **Presets:**
  - "Direct call, worker down" `{sync, 1, 6, on}`;
  - "Queue, worker down" `{queue, 1, 6, on}`;
  - "Queue, one worker" `{queue, 1, 6, off}`;
  - "Queue, three workers" `{queue, 3, 6, off}`.
- **Tests:**
  - *Sync + outage:* every request fails.
  - *Queue + outage:* every request is ok with `ms` 12, and every delivery is ok.
  - *One worker:* the jobs queue reaches 3 or more waiting, measured from `store` and `deliver` events in the trace.
  - *Three workers:* the last delivery acks earlier than with one worker.
  - Refusal: `workers: '4'`.
- **Snippets:** `store` → `queue.push(job)`, `send` → `worker.receive(`, `delivered` → `ack(job)`, `requeue` → `queue.unshift(job)`.
- **RANGES:** `workers [1, 3], jobs [1, 10]`.

### Task 12: Publish/Subscribe & Events

- **Topology:** `client`(0) → `orders`(1, calls `{ to: 'events', label: 'OrderPlaced' }`) → `events` (broker, `mode`, consumers = the first `subscribers` of `['email', 'stock', 'analytics']`) at column 2 → the subscribers (3, 30 ms each).
  - With `emailDown` on, email has a refuse outage from 20 to 300.
- **Fields:**
  - `subscribers` (1–3), sample 3;
  - `mode` (topic/queue), sample topic;
  - `emailDown` (off/on), sample off;
  - `orders` (1–5), sample 3, `POST /orders` every 40 ms.
- **Presets:**
  - "Every subscriber gets a copy" `{3, topic, off, 3}`;
  - "Email is down" `{3, topic, on, 3}`;
  - "Only email subscribes" `{1, topic, off, 3}`;
  - "Queue instead of topic" `{3, queue, off, 3}`.
- **Tests:**
  - *Topic:* 9 deliveries, all ok, and each order has one of each subscriber's queue.
  - *Email down:* request `ms` equals the topic preset's; all deliveries are ok; every stock delivery acks before the last email delivery.
  - *Only email:* the requests' `ms` equals the topic preset's.
  - *Queue:* 3 deliveries.
  - *Layout:* `layoutServices(view, 'rows', 343)` of the default preset's last step keeps every box within x ∈ [0, 343].
  - Refusal: `subscribers: '0'`.
- **Snippets:** `send` → `publish('OrderPlaced'`, `store` → `for (const queue of subscribers)`, `delivered` → `onMessage(event)`, `done` → `return accepted`.
- **RANGES:** `subscribers [1, 3], orders [1, 5]`.

### Task 13: Idempotency & Delivery Guarantees

- **Topology:** `client`(0) → `payments`(1, `dedupe` when `keys` is on; calls `ledger`) → `ledger`(2, db).
  - `clientPolicy`: at-most-once → `{ timeoutMs: 60 }`; at-least-once → `{ timeoutMs: 60, retry: { attempts: 2, backoff: 'fixed', baseMs: 20, jitter: false } }`.
  - With `lost` on, there's a `lose-reply` fault on `payments` for `#2`.
- **Fields:**
  - `delivery` (at-most-once/at-least-once), sample at-most-once;
  - `lost` (off/on), sample on;
  - `keys` (off/on), sample off;
  - `payments` (1–5), sample 3, `POST /pay` every 100 ms.
- **Step variable:** `charges`, the number of query arrivals at `ledger` so far.
- **Presets:**
  - "At most once, reply lost" `{at-most-once, on, off, 3}`;
  - "At least once, reply lost" `{at-least-once, on, off, 3}`;
  - "At least once with an idempotency key" `{at-least-once, on, on, 3}`;
  - "Nothing lost" `{at-least-once, off, off, 3}`.
- **Tests:**
  - *At most once:* #2 fails (timed out), and its charges are 1.
  - *At least once:* #2 is ok with 2 attempts, and its charges are 2.
  - *Keys:* #2 is ok, its charges are 1, and there's a `duplicate replayed` event.
  - *Nothing lost:* 3 charges in total.
  - Refusal: `payments: '6'`.
- **Snippets:** `handle` → `function handlePayment(req)`, `duplicate` → `if (seen.has(req.key))`, `send` → `ledger.charge(`, `done` → `seen.set(req.key, result)`.
- **RANGES:** `payments [1, 5]`.

---

### Task 14: Docs, final verification and PR

**Files:**
- Modify:
  - `README.md`: lesson list, and the "How to add a microservices lesson" section (call policies, `Call.when`, the broker);
  - `CLAUDE.md`: the `microservices/` bullet gains `resilience.ts` (call policies) and `broker.ts`, and the test count is updated.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Run everything CI runs.** Run: `npm run typecheck && npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, and first-load JS stays under 600 kB.
- [ ] **Step 3: Do a browser pass.**
  - The catalog shows 15 live microservices lessons and 8 Coming soon.
  - Each new lesson's default preset plays, at 375 px and in dark mode.
- [ ] **Step 4: Commit, push and open the PR**

```bash
git add README.md CLAUDE.md
git commit -m "Docs: Microservices phase 2"
git push -u origin microservices-phase-2
gh pr create --title "Microservices track, phase 2: communication and resilience" --body "<lessons, engine additions, deferred minors, test plan>"
```

The PR body has no AI attribution. Merging deploys, so ask before merging.
