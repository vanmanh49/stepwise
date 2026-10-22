# Microservices Track, Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 Data & Operations lessons live (saga, transactional outbox, CQRS, event sourcing, distributed tracing, deployment strategies, strangler fig, service mesh). This completes the Microservices track at 23 lessons.

**Architecture:** The phase 1–2 simulator stays as it is, and phase 3 adds these pieces:
- **Records and data calls** in db nodes (`sim.ts`).
- **Engine features:**
  - `Call.path` and saga compensation;
  - the `errors`, `crash-after`, `deploy`, `shift` and `reroute` faults;
  - an event store;
  - a weighted balancer with a canary guard (`behaviours.ts`);
  - an outbox relay (`relay.ts`);
  - sidecar proxies (`sidecar.ts`).
- **Tracing:** a pure span builder (`tracing.ts`) feeds an optional waterfall in the `services` view.

Each engine task also narrates its own new trace events in `steps.ts`. Each lesson is a scenario module driven by the `form` input.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Motion, Tailwind, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-22-microservices-track-phase-3-design.md`. The phase 1 and 2 specs (`2026-10-21-…-phase-1-design.md`, `2026-10-22-…-phase-2-design.md`) still apply where this one is silent.

## Global Constraints

- **Branch:**
  - `microservices-phase-3`, in `/Users/manhluu/untitled folder/stepwise` (no worktree), cut from `main` at 1ca3f31;
  - the spec and this plan are already committed there.
- **Engine rules:**
  - `src/microservices/` contains no React, and all lesson text lives in `src/lessons/`;
  - engine entry points never throw on user input, and unusable form values return one step through `refusal(title, why, emptyServicesView())`.
- **Run limits and determinism:**
  - `MAX_TIME = 10_000` ms and `MAX_STEPS = 200` (+1 summary step);
  - events are ordered by `(time, sequence)`, and the only randomness is the seeded generator;
  - lessons set `seed: 7`.
- **Nothing old changes.** Every phase 1 and phase 2 scenario gives the same steps as before, and every existing scenario test keeps passing unchanged.
- **Shared numbers** (`scenarios/shared.ts`):
  - links 5 ms, instances 10 ms;
  - gateway 2 ms, db 3 ms, broker 2 ms;
  - new: `SIDECAR_MS = 1` on 1 ms links, and `PER_EVENT_MS = 2`.
- **Code lines** use `lineOf(code, snippet)`, never hard-coded numbers.
- **Lesson content:**
  - category `microservices`, difficulty `advanced`, group `Data & Operations`;
  - no `complexity`;
  - `codeLabel: 'Pseudocode'`;
  - each field's `sample` equals the first preset's value;
  - quizzes have 4–5 questions of at least 3 types, including one `predict-next` with a `view`.
- **Copy** is plain, short sentences that use the run's actual values.
- **Badges and record values** are at most 24 characters; longer values are cut and end in "…".
- **Commit messages, PR titles and PR bodies** contain no AI attribution.
- **Every task ends green** on `npm run typecheck && npm run lint && npm test`.
- **Stale Vitest cache:** if "No content module for <id>" appears after adding a lesson file, delete `node_modules/.vitest-cache`.

## Review Focus

- **An event store with many events,** such as 20 operations and no snapshots, gives a db box with more than 6 records. It must show the newest 5 plus "+N older" and stay inside 343 px at phone width. Pinned in Task 1 (`recordRows`) and checked by eye in Task 11.
- **An outbox that can never drain,** because its db or broker is down until after `MAX_TIME`, must end the run at `MAX_TIME`, with no request row `pending` and a summary that says how many events were never published. Pinned in Task 3.
- **A weighted balancer with nothing in rotation** (the recreate gap, or v2 rolled back while v1 is draining) must fail the request with "no healthy app instance", never pick `undefined` or divide by a zero weight. Pinned in Task 5.
- **A compensation whose target is down or refuses** must still let the remaining compensations run, and the request still ends failed with the original reason. Pinned in Task 2.
- **A span that never closes,** such as a request that times out while a hung service keeps it open, must have no `ms` in every step and be drawn up to `endMs`. Retries must show as one span per attempt, not one merged span. Pinned in Task 7.

---

## File map

| File | Responsibility |
|---|---|
| `src/microservices/model.ts` | `DataOp`, `Call.data`/`path`/`compensate`, `RequestSpec.key`/`value`, db `records`/`events`, `Instance.version`, balancer `weights`/`canary`, relay and sidecar nodes, new faults, new trace events, `Message.value`/`path`/`dest`, `RequestOutcome.value` |
| `src/microservices/sim.ts` | `seeded`, data calls and templates, values in replies, compensation, `errors`/`crash-after`/`deploy` faults, event store, rotation state, wiring for relay and sidecar, run-end rule for the outbox |
| `src/microservices/behaviours.ts` | weighted picks, rotation, canary guard, `shift`; gateway `reroute` |
| `src/microservices/relay.ts` (new) | relay behaviour: poll, publish, delete |
| `src/microservices/sidecar.ts` (new) | sidecar behaviour: outbound and inbound routing, policy, mTLS |
| `src/microservices/tracing.ts` (new) | `spansOf` |
| `src/microservices/steps.ts` | narration, record rows, value cells, version/weight/sidecar/relay badges, `extend` |
| `src/microservices/scenarios/shared.ts` | `SIDECAR_MS`, `PER_EVENT_MS`, `db()` options, `sidecar()`, `relay()` |
| `src/microservices/scenarios/<id>.ts` (+ test) | one module per lesson |
| `src/types/visualization.ts` | node types `relay`/`sidecar`, request `value`, `spans` |
| `src/components/visualization/renderers/ServicesRenderer.tsx` | type names, value cell, waterfall (`SpanWaterfall.tsx`) |
| `src/components/visualization/renderers/SpanWaterfall.tsx` (new) | the waterfall section |
| `src/components/visualization/roles.ts` | `rolesInView` includes span roles |
| `src/lessons/meta/microservices.ts`, `src/lessons/microservices/<id>.ts` | metadata and content |

---

### Task 1: Records, data calls and values

**Files:**
- Modify:
  - `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/microservices/scenarios/shared.ts`;
  - `src/types/visualization.ts`, `src/components/visualization/renderers/ServicesRenderer.tsx`.
- Test: `src/microservices/sim.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Produces, in `model.ts`:**

```ts
export type DataOp =
  | { read: string }
  | { write: Record<string, string> }
  | { delete: string[] }
  | { add: Record<string, string> }
  | { append: string };
// Call gains: data?: DataOp
// RequestSpec gains: key?: string; value?: string
// db NodeSpec gains: records?: Record<string, string>
// Message gains: value?: string
// RequestOutcome gains: value?: string
// TraceEvent gains:
| { kind: 'write'; db: string; request: string; records: Record<string, string | null> }
| { kind: 'read'; db: string; request: string; key: string; value?: string; replayed?: number }
```

- **Produces, in `sim.ts`:**
  - `export function seeded(seed: number): () => number` (the existing mulberry32, renamed and exported; `simulate` uses it);
  - `export function fill(template: string, request: { id: string; key?: string; value?: string }): string` replaces `{req}`, `{key}` and `{value}`.
- **Produces, in `shared.ts`:** `db(id, column, columns = [], options: { records?: Record<string, string>; events?: { perEventMs: number; snapshotEvery?: number } } = {})`. The `events` option is used by Task 4.
- **Produces, in `steps.ts`:** `export function recordRows(records: [string, string][], changed: Set<string>): { id: string; role: Role; badge: string }[]`, which returns the newest 5 plus `{ id: '+N older', role: 'default', badge: '' }`, with badges cut to 24 characters.
- **Produces, in `visualization.ts`:** the request row gains `value?: string`.

- [ ] **Step 1: Write the failing tests** in `sim.test.ts`. They use `client → api → db` (5 ms links, api 10 ms, db 3 ms) and the shared builders.

```ts
it('writes, reads, deletes and adds records', () => {
  // api calls db with { write: { 'order {req}': '{value}', 'outbox/{req}': 'OrderPlaced' } }; request #1 value 'placed'
  expect(result.trace.find((e) => e.kind === 'write')).toMatchObject({ t: 23, db: 'db', request: '#1', records: { 'order #1': 'placed', 'outbox/#1': 'OrderPlaced' } });
  // second scenario: api calls [{ data: { delete: ['outbox/{req}'] } }, { data: { add: { balance: '{value}' } } }, { data: { read: 'balance' } }], records { balance: '100' }, value '-20'
  expect(added.requests[0]).toMatchObject({ status: 'ok', value: '80' });
  expect(added.trace.find((e) => e.kind === 'write' && 'outbox/#1' in e.records)).toMatchObject({ records: { 'outbox/#1': null } });
});
it('reads a missing key as no value', () => {
  expect(result.requests[0]!.value).toBeUndefined();
  expect(result.trace.find((e) => e.kind === 'read')).toMatchObject({ key: 'nope', value: undefined });
});
it('applies a multi-record write all or nothing', () => {
  // db down at 0
  expect(result.trace.some((e) => e.kind === 'write')).toBe(false);
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'db is down' });
});
it('fills templates from the request a broker delivery carries', () => {
  // client → orders → events broker (queue) → projector → view-db { write: { '{key}': '{value}' } }; request key 'order 42', value 'paid'
  expect(result.trace.filter((e) => e.kind === 'write').at(-1)).toMatchObject({ db: 'view-db', records: { 'order 42': 'paid' } });
});
it('passes the last value a service read back to the client', () => {
  // api calls db read 'a' then db read 'b'; records { a: '1', b: '2' }
  expect(result.requests[0]!.value).toBe('2');
});
```

Runs without data calls are pinned by the existing phase 1–2 scenario tests, which must pass unchanged. Also test `fill('order {req} {key}={value}', { id: '#2', key: 'k', value: 'v' })`, which gives `'order #2 k=v'`.

In `steps.test.ts`:
- `traceSteps` titles: `db saves order #1 = placed, outbox/#1 = OrderPlaced`, `db deletes outbox/#1` and `db reads balance = 80`.
- The db node in the view has record rows, with the changed row `active`.
- The request row shows `value: '80'`.
- `recordRows` with 8 records gives 6 rows: the newest 5, then `+3 older`.
- A 40-character value is cut to 24 characters ending in "…".

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/microservices/sim.test.ts src/microservices/steps.test.ts`
Expected: FAIL. `DataOp` doesn't exist, and `fill` and `recordRows` aren't exported.

- [ ] **Step 3: Implement**

- **`sim.ts`:**
  - each db's records are a `Map` copied from `records`;
  - a query keeps its filled `DataOp` beside `queryColumns`, as `queryOps`;
  - after `processMs`, a down db fails the query without touching the records;
  - otherwise it applies the op, traces `write` or `read`, and replies with `value` for reads;
  - `add` parses both values as integers and treats a missing key as 0;
  - `requests` remember `key` and `value`, and `requestInfo` returns them;
  - a service keeps the last value any of its calls answered with (a db read or a service reply that has one; answers without a value don't clear it) per job and passes it into `ctx.reply` (which gains an optional `value` argument);
  - the client stores it in `outcome.value`.
- **`steps.ts`:**
  - keep records per db from `write` events (a `null` value deletes the key);
  - draw them with `recordRows`;
  - narrate `write` as `<db> saves k = v, …` and `<db> deletes k`, and `read` as `<db> reads k = v` (or `… finds no k`);
  - copy `value` to the request row on `done`.
- **Renderer:** show `→ {value}` after the status cell's text when it's present.

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx vitest run src/microservices`
Expected: PASS, including every phase 1–2 scenario test.

- [ ] **Step 5: Commit**

```bash
git add src/microservices src/types src/components
git commit -m "Simulator: records in databases, data calls and values in replies"
```

---

### Task 2: `Call.path`, compensation, `errors` and `reroute`

**Files:**
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/behaviours.ts`, `src/microservices/steps.ts`
- Test: `src/microservices/sim.test.ts`, `src/microservices/behaviours.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Consumes:** Task 1's `fill` and `DataOp`.
- **Produces:**

```ts
// Call gains: path?: string; compensate?: Call
// Message gains: path?: string   (the callee's `when` checks message.path ?? request path)
// Fault gains:
| { kind: 'errors'; node: string; rate: number; reason: string; version?: string; request?: string; from?: number }
| { kind: 'reroute'; gateway: string; at: number; prefix: string; to: string }
// TraceEvent gains:
| { kind: 'compensate'; node: string; instance: string; request: string; target: string }
```

- [ ] **Step 1: Write the failing tests**

```ts
it('undoes finished steps newest first when a later step fails', () => {
  // orders calls [db write pending (compensate: write cancelled), payments path /pay (compensate: path /refund), inventory path /reserve]; errors { node: 'inventory', rate: 1, reason: 'out of stock' }
  expect(result.trace.filter((e) => e.kind === 'compensate').map((e) => e.target)).toEqual(['payments', 'orders-db']);
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'out of stock' });
  // payments has calls [{ to: 'payments-db', when: '/pay', write charged }, { to: 'payments-db', when: '/refund', write refunded }]
  expect(lastWrite(result, 'payments-db')).toEqual({ 'charge #1': 'refunded' });
});
it('skips the compensation of the step that failed', () => {
  // errors on payments instead: only orders-db is compensated
});
it('keeps compensating when a compensation fails', () => {
  // payments outage refuse from the moment /refund is sent → refund fails, orders-db still cancelled
  expect(result.trace.filter((e) => e.kind === 'compensate')).toHaveLength(2);
  expect(lastWrite(result, 'orders-db')).toEqual({ 'order #1': 'cancelled' });
  expect(result.requests[0]!.reason).toBe('out of stock');
});
it('fails requests at the errors rate, limited by version, request and from', () => {
  // rate 1 → every request fails with the reason; rate 0 → none; request '#2' → only #2; from 50 → only requests handled from 50 on
});
it('ignores compensate in a parallel service', () => {});
```

In `behaviours.test.ts`: `reroute { gateway, at: 100, prefix: '/orders', to: 'monolith' }` sends `/orders` requests before 100 to `orders`, and after it to `monolith`.

In `steps.test.ts`, expect these titles:
- `orders undoes payments for #1: /refund`;
- `inventory-1 fails #1: out of stock`;
- `The gateway now sends /orders to monolith`.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **Call path:** `call()` in `handle` sends `path: target.path` on the message, and `handle` filters `calls` by `message.path ?? request path`.
  - **Compensation:** the sequential `next` keeps the list of calls that succeeded. On a failure it walks that list backwards, tracing `compensate` and calling each `compensate` with the same `call()`. It ignores their results, then calls `finish(false, reason)`.
  - **`errors`:** checked when the processing time ends, before the calls. Matching faults draw `ctx.rng() < rate` (with no draw when rate is 1 or 0, so other runs keep their random sequence), then trace `fail` and reply with the reason.
  - **`reroute`:** a scheduled fault that the gateway behaviour reads. It keeps its routes in a mutable copy, and the fault replaces or adds the route.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npx vitest run src/microservices`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -am "Simulator: saga compensation, call paths, error rates and route changes"`

---

### Task 3: `crash-after` and the outbox relay

**Files:**
- Create: `src/microservices/relay.ts`, `src/microservices/relay.test.ts`
- Modify:
  - `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/microservices/scenarios/shared.ts`;
  - `src/types/visualization.ts`, `ServicesRenderer.tsx`.

**Interfaces:**
- **Consumes:** Task 1's records and `write`, and phase 2's broker.
- **Produces:**

```ts
// NodeSpec gains: | { type: 'relay'; processMs: number; pollMs: number; db: string; to: string }
// Fault gains: | { kind: 'crash-after'; node: string; after: string; request: string; restartMs?: number }
// TraceEvent gains: | { kind: 'poll'; relay: string; found: string[] }   // found: request ids, oldest first
// recover: node may be an instance id
export const relay: Behaviour;                                       // relay.ts
export const relayNode = (id: string, column: number, db: string, to: string, pollMs = 40): NodeSpec; // shared.ts
```

- **View:** `ServicesView` node `type` gains `'relay'`, and `TYPE_NAME.relay` is "outbox relay".

- [ ] **Step 1: Write the failing tests** in `relay.test.ts` and `sim.test.ts`:

```ts
it('crashes right after the named call answers and restarts later', () => {
  // orders calls [db write order, events broker]; crash-after { node: 'orders', after: 'db', request: '#1', restartMs: 30 }
  expect(lastWrite(result, 'db')).toEqual({ 'order #1': 'placed' });
  expect(result.trace.some((e) => e.kind === 'store')).toBe(false);
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: 'orders-1 crashed' });
  expect(result.trace.find((e) => e.kind === 'recover')).toMatchObject({ node: 'orders-1' });
});
it('publishes each outbox record once, then deletes it', () => {
  // orders writes { 'order {req}': 'placed', 'outbox/{req}': 'OrderPlaced' }; relay → events (queue, email)
  expect(result.deliveries.map((d) => [d.id, d.status])).toEqual([['#1/events', 'ok'], ['#2/events', 'ok']]);
  expect(result.trace.filter((e) => e.kind === 'store')).toHaveLength(2);
  expect(finalRecords(result, 'db')).toEqual({ 'order #1': 'placed', 'order #2': 'placed' });
});
it('never starts a poll while the last one is still running', () => {
  // pollMs 1
  const polls = result.trace.filter((e) => e.kind === 'poll');
  // each poll comes after the previous poll's last delete reply
});
it('keeps the run open until the outbox is empty', () => {
  // the client's request is done before the relay's first poll at 40 ms
  expect(result.trace.at(-1)!.t).toBeGreaterThan(40);
});
it('ends at MAX_TIME when the outbox can never drain', () => {
  // events broker outage refuse from 0 to 20_000
  expect(result.timedOut).toBe(true);
  expect(result.endedAt).toBeLessThanOrEqual(MAX_TIME);
  expect(result.deliveries).toEqual([]);
  expect(finalRecords(result, 'db')).toHaveProperty(['outbox/#1']);
});
```

In `steps.test.ts`:
- titles `The relay finds 1 unsent event: #1` and `The relay finds nothing to send`;
- for a run that ends with outbox rows left, the summary step `why` mentions `1 event never published`;
- the relay badge `next poll 40 ms`.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **`crash-after`:** the call's `then` checks the fault for this instance and request, and the target owner `after`, when the answer is ok. If it matches, it traces `fault`, calls `kill(instance, message)`, and with `restartMs` schedules `dead.delete(instance)` plus `recover { node: instance }`.
  - **`relay.ts`:**
    - each poll is a `query` whose op lists `outbox/` keys; add prefix reads to the db: a `read` whose key ends in `/*` replies with `Message.records: [string, string][]` (new optional field: the matching keys and values, oldest first);
    - each key is published as a `request` to `to`, with label `${value} ${request}`;
    - on "stored", the record is removed with `{ delete: [key] }`;
    - the next poll is scheduled `pollMs` after the previous poll ended.
  - **Run end:** the main loop's end condition also requires that no db holds an `outbox/` key.
  - **Steps:** a `recover` for an instance id clears that instance only. The summary step counts the `outbox/` records left.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npm run lint && npx vitest run src/microservices`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Simulator: crash after a call, and the outbox relay"`

---

### Task 4: Event store

**Files:**
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`
- Test: `src/microservices/sim.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Consumes:** Task 1's `DataOp.append`, `read`, and the `events` option of `db()`.
- **Produces:**

```ts
// db NodeSpec gains: events?: { perEventMs: number; snapshotEvery?: number }
// TraceEvent gains:
| { kind: 'append'; db: string; request: string; seq: number; event: string }
| { kind: 'snapshot'; db: string; seq: number; value: number }
```

- [ ] **Step 1: Write the failing tests**

```ts
it('appends numbered events and folds them on read', () => {
  // values +50, -20, +100 then a read of 'balance'
  expect(result.trace.filter((e) => e.kind === 'append').map((e) => [e.seq, e.event])).toEqual([[1, '+50'], [2, '-20'], [3, '+100']]);
  expect(result.requests.at(-1)).toMatchObject({ value: '130' });
  expect(result.trace.find((e) => e.kind === 'read')).toMatchObject({ replayed: 3 });
});
it('charges perEventMs for each replayed event', () => {
  // read with 3 events takes 3 + 2 × 3 = 9 ms at the db: reply leaves the db 9 ms after the query arrives
});
it('starts from the latest snapshot', () => {
  // snapshotEvery 5, 18 appends → snapshot @5, @10, @15; read replays 3
  expect(result.trace.filter((e) => e.kind === 'snapshot').map((e) => e.seq)).toEqual([5, 10, 15]);
  expect(result.trace.find((e) => e.kind === 'read')).toMatchObject({ replayed: 3 });
});
it('keeps events and snapshots as records', () => {
  // records end with keys e1 … e18 and 'snapshot @5', 'snapshot @10', 'snapshot @15'
});
```

In `steps.test.ts`, expect the titles `account-db appends e3: +100`, `account-db stores snapshot @5 = 160` and `account-db replays 3 events to answer #19`.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement.** In an event-store db:
  - `append` writes record `e<seq>` and traces `append`; every `snapshotEvery`-th append also writes `snapshot @seq` and traces `snapshot`;
  - `read` computes the latest snapshot's value plus the sum of the later events;
  - the reply is scheduled at `processMs + perEventMs × replayed` instead of `processMs`.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npx vitest run src/microservices`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -am "Simulator: event store with replay cost and snapshots"`

---

### Task 5: Versions, deploys, weighted balancer and canary guard

**Files:**
- Modify: `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/behaviours.ts`, `src/microservices/steps.ts`
- Test: `src/microservices/behaviours.test.ts`, `src/microservices/sim.test.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- **Consumes:** Task 2's `errors` fault.
- **Produces:**

```ts
// Instance gains: version?: string
// balancer NodeSpec gains: weights?: Record<string, number>; canary?: { version: string; maxErrors: number }
// Fault gains:
| { kind: 'deploy'; instance: string; at: number; action: 'start' | 'stop' }
| { kind: 'shift'; balancer: string; at: number; weights: Record<string, number> }
// TraceEvent gains:
| { kind: 'drained'; instance: string }
| { kind: 'rollback'; balancer: string; version: string; errors: number }
// SimContext gains: inRotation(instance: string): boolean   // false while not started or draining
/** Draws a version by weight among those with an instance in rotation; undefined when none has one. */
export function pickVersion(weights: Record<string, number>, available: string[], rng: () => number): string | undefined;
```

- [ ] **Step 1: Write the failing tests**

```ts
it('draws versions by weight', () => {
  // pickVersion({ v1: 0.75, v2: 0.25 }, ['v1', 'v2'], seeded(7)) over 400 draws: v2 share between 0.2 and 0.3
});
it('passes the share of a version with nothing in rotation to the others', () => {
  expect(pickVersion({ v1: 0, v2: 1 }, ['v1'], seeded(7))).toBe('v1');
  expect(pickVersion({ v1: 1 }, [], seeded(7))).toBeUndefined();
});
it('never picks an instance before it starts or while it drains', () => {
  // app-1 stop at 100, app-2 start at 100; picks after 100 are app-2 only; app-1 traces drained after its last job
});
it('fails with no healthy instance when nothing is in rotation', () => {
  // stop app-1 at 50, start app-2 at 150; a request at 100 fails with 'no healthy app instance'
});
it('rolls the canary back after maxErrors failures', () => {
  // weights v1 .75 / v2 .25, canary { version: 'v2', maxErrors: 2 }, errors rate 1 on v2, 16 requests
  expect(result.trace.filter((e) => e.kind === 'rollback')).toHaveLength(1);
  expect(result.requests.filter((r) => r.status === 'failed')).toHaveLength(2);
});
it('applies a shift at its time', () => {
  // weights v1 1 / v2 0; shift to v2 1 at 100: every pick after 100 is v2
});
it('keeps phase 1 load balancing unchanged', () => {
  // the existing load-balancing scenario tests already pin this; run them
});
```

In `steps.test.ts`:
- titles `app-1 (v1) leaves rotation and finishes its work`, `app-4 (v2) starts serving`, `The balancer rolls back v2 after 2 errors` and `The balancer now sends v1 0%, v2 100%`;
- badges `v2, not started` and `v1 75%, v2 25%`, each at most 24 characters.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **Deploy state in `sim.ts`:**
    - instances with a `deploy start` fault begin in a `notStarted` set, which `isDead` reports as dead, and `start` removes them from it;
    - `stop` adds the instance to `draining`; once its job set is empty (checked after each `finish`), it is killed and traced `drained`;
    - `inRotation` is false for both sets.
  - **Balancer:**
    - `live` also filters out instances that are not in rotation;
    - with `weights`, it takes `pickVersion`, then round robin within that version (one cursor per version);
    - the canary guard counts failed answers from instances of `canary.version` and, at `maxErrors`, sets that weight to 0 and traces `rollback`;
    - `shift` replaces the weights.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npx vitest run src/microservices`. Expected: PASS, with the load-balancing and service-discovery scenario tests unchanged.
- [ ] **Step 5: Commit:** `git commit -am "Simulator: versions, deploys, weighted balancing and canary rollback"`

---

### Task 6: Sidecars and mTLS

**Files:**
- Create: `src/microservices/sidecar.ts`, `src/microservices/sidecar.test.ts`
- Modify:
  - `src/microservices/model.ts`, `src/microservices/sim.ts`, `src/microservices/steps.ts`, `src/microservices/scenarios/shared.ts`;
  - `src/types/visualization.ts`, `ServicesRenderer.tsx`.

**Interfaces:**
- **Consumes:** phase 2's `ctx.call` and `CallPolicy`, and Task 2's `errors`.
- **Produces:**

```ts
// NodeSpec gains: | { type: 'sidecar'; of: string; processMs: number; policy?: CallPolicy; mtls?: boolean }
// Message gains: dest?: string
// TraceEvent gains: | { kind: 'deny'; node: string; request: string; reason: string }
// SimContext gains: sidecarOf(service: string): string | undefined
export const sidecar: Behaviour;                                         // sidecar.ts
export const sidecarNode = (of: string, column: number, extra?: { policy?: CallPolicy; mtls?: boolean }): NodeSpec; // id `${of}-proxy`, shared.ts
export const SIDECAR_MS = 1;
```

- **View:** `ServicesView` node `type` gains `'sidecar'`, and `TYPE_NAME.sidecar` is "sidecar proxy".

- [ ] **Step 1: Write the failing tests**

```ts
it('routes a call out through the caller sidecar and in through the target sidecar', () => {
  expect(result.requests[0]!.hops).toEqual(['client', 'orders-proxy', 'orders-1', 'orders-proxy', 'payments-proxy', 'payments-1']);
});
it('adds 6 ms per call: four loopback hops and 1 ms in each proxy on the way in', () => {
  // callMs: from orders-1 sending its call for #1 to the answer arriving back at orders-1
  expect(callMs(mesh) - callMs(plain)).toBe(6);
});
it('retries in the sidecar while the app code stays the same', () => {
  // payments errors rate 1 until 30 ms; orders-proxy policy retry 2 fixed 10
  expect(result.requests[0]!.status).toBe('ok');
  expect(scenario.nodes.find((n) => n.id === 'orders')).toEqual(plainOrdersNode);
});
it('refuses a caller without a certificate when mtls is on', () => {
  // request from client straight to payments with payments-proxy mtls
  expect(result.requests[0]).toMatchObject({ status: 'failed', reason: '403: no client certificate' });
  expect(result.trace.find((e) => e.kind === 'deny')).toMatchObject({ node: 'payments-proxy' });
});
```

The whole request takes 9 ms more, because the client's own hop to orders also goes through orders-proxy. The lesson's step variable counts only the service-to-service call.

In `steps.test.ts`:
- titles `orders-1 hands #1 to its sidecar`, `payments-proxy refuses #1: 403: no client certificate` and `orders-proxy tries #1 again in 10 ms (retry 1 of 2)`;
- the sidecar badge `3 calls, 1 retried`.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **Outbound (`sim.ts`):** when the calling instance's service has a sidecar, `call()` sends the request to that sidecar with `dest: target.to`.
  - **Inbound (`sim.ts`):** a message whose target service has a sidecar, and which doesn't come from that sidecar, goes to the sidecar.
  - **`sidecar.ts`:**
    - an inbound request with `mtls` that doesn't come from a sidecar is traced `deny` and refused;
    - an outbound request (`dest` set) is sent after `processMs` with `ctx.call(node.id, targetSidecarOrInstance, …, node.policy, done)`;
    - an inbound one is forwarded to the first live instance of `of`;
    - each passes the answer back;
    - the sidecar counts calls and retries for its badge (retries from `retry` events whose caller is the sidecar).
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npm run lint && npx vitest run src/microservices`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Simulator: sidecar proxies with mesh policies and mTLS"`

---

### Task 7: Spans and the waterfall

**Files:**
- Create:
  - `src/microservices/tracing.ts`, `src/microservices/tracing.test.ts`;
  - `src/components/visualization/renderers/SpanWaterfall.tsx`.
- Modify:
  - `src/microservices/steps.ts`, `src/types/visualization.ts`;
  - `ServicesRenderer.tsx`, `src/components/visualization/roles.ts`.

**Interfaces:**
- **Produces:**

```ts
// visualization.ts, ServicesView gains:
spans?: { title: string; endMs: number; rows: SpanRow[] };
export interface SpanRow { id: string; label: string; start: number; ms?: number; depth: number; trace: string; role: Role }
// tracing.ts
export function spansOf(scenario: Scenario, trace: TraceEvent[], upTo: number, options: { propagate: boolean; sampled: Set<string> }): Map<string, SpanRow[]>; // by request id
// steps.ts, StepOptions gains:
extend?: (event: TraceEvent, result: SimResult) => Partial<Pick<ServicesView, 'spans'>>;
```

- **Spans:**
  - a span opens when a `request` or `query` message for a sampled request arrives at a live node, and closes when that node sends the reply;
  - its label is `<owner> <path or "query">`;
  - the client's root span runs from the first send to `done`;
  - its `id` is the inbound message id; the client's root is `root#n`;
  - its parent is the open span of the node that sent the message, so depth is the parent's depth + 1;
  - its `trace` is `T<n>` with `propagate`; without it, `T<n>.<k>` gives each span its own trace at depth 0;
  - its role is `discarded` when the reply failed and `active` for the longest closed span; the others are `visited`.
- **`rolesInView`:** the `services` case adds `view.spans?.rows.map((r) => r.role)`.

- [ ] **Step 1: Write the failing tests** in `tracing.test.ts`. They use `client → gateway → orders → payments + inventory` (parallel) and dbs.

```ts
it('links each span to the span that called it', () => {
  const rows = spansOf(s, r.trace, r.endedAt, { propagate: true, sampled: new Set(['#1']) }).get('#1')!;
  expect(rows.map((x) => [x.label.split(' ')[0], x.depth])).toEqual([['client', 0], ['gateway', 1], ['orders', 2], ['payments', 3], ['inventory', 3], ['payments-db', 4], ['inventory-db', 4]]);
  expect(new Set(rows.map((x) => x.trace))).toEqual(new Set(['T1']));
});
it('starts a new trace for every span without propagation', () => {
  // every depth 0, every trace different
});
it('leaves unsampled requests out', () => {
  expect(spansOf(s, r.trace, r.endedAt, { propagate: true, sampled: new Set() }).size).toBe(0);
});
it('keeps a span open until its reply', () => {
  // upTo before payments replies: payments row has no ms
});
it('gives each retry attempt its own span', () => {
  // clientPolicy retry 1 with a refuse outage: two gateway-level rows for #1
});
it('never closes the span of a request that hangs', () => {
  // hang outage on payments past the end: payments row has no ms at upTo = endedAt
});
```

In `steps.test.ts`:
- `extend` returning spans puts them in every step's view;
- without `extend`, views have no `spans` key, so phase 1–2 steps are unchanged.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - `spansOf` replays the trace up to `upTo`, as described in the Interfaces block.
  - `snapshot` merges `options.extend?.(event, result)`.
  - **`SpanWaterfall.tsx`** draws:
    - a heading with `title`;
    - one row per span, indented `depth × 12px`;
    - a bar from `start/endMs` with width `(ms ?? endMs − start)/endMs`, and an open bar has a dashed end;
    - `"{ms} ms"` after the bar.

    Colours come from the role variables. Below 640 px, labels show only the owner, and the section is `overflow-x-auto` in its own box.
  - `ServicesRenderer` renders it between the diagram and the request table when `view.spans` is set.
- [ ] **Step 4: Run the checks.** Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit:** `git commit -m "Services view: spans and a trace waterfall"`

---

### Tasks 8–15: the eight lessons

Every lesson task has the shape of phase 2's Tasks 6–13.

**Files per lesson:**
- Create:
  - `src/microservices/scenarios/<id>.ts`;
  - `src/microservices/scenarios/<id>.test.ts`;
  - `src/lessons/microservices/<id>.ts`.
- Modify:
  - `src/lessons/meta/microservices.ts`: append the lesson;
  - `src/lessons/lessons.test.ts`: append the id to `EXPECTED_IDS`, and raise `lessonsIn('microservices')` by one;
  - `src/microservices/contract.test.ts`: add a `RANGES` entry.

**Interfaces per lesson:** `<camel>Code`, `<camel>Scenario(values): Read<Scenario>` and `<camel>Steps(values): Step[]`, using `scenarioSteps(read, 'Check the settings', options)`.

**Steps per lesson:**
- [ ] **Step 1: Write the teaching-moment tests,** one per preset plus one refusal, using `<camel>Scenario` + `simulate` (and `<camel>Steps` for titles and variables).
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/microservices/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the scenario module.** Use the topology, fields and numbers below. The pseudocode is 10–20 lines and contains the listed snippets.
- [ ] **Step 4: Write the content and metadata.**
  - **Content:**
    - `overview`;
    - at least 2 `concept` items and at least 4 `howItWorks` items;
    - the `form` visualization, whose first preset equals the samples;
    - `prosCons`;
    - at least 3 `applications` and at least 3 `commonMistakes`;
    - the quiz;
    - at least 3 `summary` lines.
  - **Metadata:**
    - difficulty `advanced`, group `Data & Operations`;
    - `prerequisites`: the previous lesson (`idempotency` for Saga);
    - a description and keywords.
- [ ] **Step 5: Run the checks.** Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 6: Check it in the browser.** Run `npm run dev` and open `/microservices/<id>`, then:
  - play every preset and check the narration, the pills, the badges, the record rows and the table;
  - repeat at 375 px (no sideways scroll) and in dark mode.
- [ ] **Step 7: Commit:** `git commit -m "Microservices lesson: <Title>"`.

### Task 8: Saga

- **Topology:**
  - `client`(0) → `orders`(1) → `orders-db`(2), `payments`(2) → `payments-db`(3), and `inventory`(2) → `inventory-db`(3).
  - orders' calls, sequential:
    1. orders-db `write { 'order {req}': 'pending' }`, compensate `write { 'order {req}': 'cancelled' }`;
    2. payments `path: '/pay'`, compensate `path: '/refund'`;
    3. inventory `path: '/reserve'`, compensate `path: '/release'`;
    4. orders-db `write { 'order {req}': 'confirmed' }`.
  - payments writes `charge {req}` = `charged` / `refunded` by `when`.
  - inventory writes `reserve {req}` = `held` / `released` by `when`.
  - Without the saga, the calls have no `compensate`.
- **Fields:**
  - `saga` (off/on), sample off;
  - `fails` (none/payment/inventory), sample none. Payment = `errors { node: 'payments', rate: 1, request: '#2', reason: 'card declined' }`, and inventory is the same on inventory with `out of stock`;
  - `orders` (1–4), sample 3, one every 60 ms.
- **Presets:**
  - "All in stock" `{off, none, 3}`;
  - "Out of stock, no saga" `{off, inventory, 3}`;
  - "Out of stock, saga" `{on, inventory, 3}`;
  - "Card declined, saga" `{on, payment, 3}`.
- **Tests:**
  - *All in stock:* every `order #n = confirmed` and every `charge #n = charged`.
  - *No saga:* #2 fails with `out of stock`, and the final records are `order #2 = pending` and `charge #2 = charged`. `inconsistent orders` is 1 in the last step.
  - *Saga:* the compensations are `['payments', 'orders-db']`, and the final records are `order #2 = cancelled` and `charge #2 = refunded`. `inconsistent orders` is 0.
  - *Card declined:* one compensation (`orders-db`), and there's no `charge #2` record.
  - Refusal: `orders: '0'`.
- **Step variable:** `inconsistent orders` = failed requests whose order isn't `cancelled`, or whose charge is still `charged`.
- **Snippets:** `compensate` → `for (const step of done.reverse())`, `handle` → `async function placeOrder(order)`, `done` → `return 'confirmed'`.
- **RANGES:** `orders [1, 4]`.

### Task 9: Transactional Outbox

- **Topology:**
  - `client`(0) → `orders`(1) → `orders-db`(2), and `events`(2, broker queue, consumer `email`) → `email`(3).
  - Outbox mode adds `relay`(2, `pollMs` 40, db `orders-db`, to `events`).
- **orders' calls by approach:**
  - *save-then-publish:* `[orders-db write { 'order {req}': 'placed' }, { to: 'events', label: 'OrderPlaced' }]`;
  - *publish-then-save:* the reverse;
  - *outbox:* `[orders-db write { 'order {req}': 'placed', 'outbox/{req}': 'OrderPlaced' }]`.
- **Fields:**
  - `approach` (save-then-publish/publish-then-save/outbox), sample save-then-publish;
  - `fault` (none/crash/db-down), sample crash. Crash = `crash-after { node: 'orders', after: <first call target>, request: '#2', restartMs: 10 }`, and db-down = `down orders-db at 60`;
  - `orders` (1–5), sample 3, one every 50 ms.
- **Presets:**
  - "Save then publish, crash" `{save-then-publish, crash}`;
  - "Publish then save, db down" `{publish-then-save, db-down}`;
  - "Outbox, crash" `{outbox, crash}`;
  - "Outbox, no fault" `{outbox, none}`.
- **Tests:**
  - *Save then publish, crash:* `order #2` is saved, there's no delivery `#2/events`, and `saved` 3 vs `published` 2.
  - *Publish then save, db down:* deliveries `#2/events` and `#3/events` are ok, while `order #2` and `order #3` don't exist.
  - *Outbox, crash:* `#2/events` is ok, and every saved order has a delivery.
  - *No fault:* 3 saved, 3 published, and no `outbox/` record left.
  - Refusal: `orders: '6'`.
- **Snippets:** `write` → `db.transaction(`, `poll` → `async function poll()`, `store` → `broker.publish(`, `done` → `return order`.
- **RANGES:** `orders [1, 5]`.

### Task 10: CQRS

- **Topology:**
  - **Single:** `client`(0) → `orders`(1) → `orders-db`(2), `users`(2) → `users-db`(3), and `products`(2) → `products-db`(3).
    - For `when: 'PUT'`, orders calls orders-db `write { '{key}': '{value}' }`.
    - For `when: 'GET'`, it calls `[orders-db read '{key}', users, products]`; users and products each make one plain query.
  - **CQRS:**
    - writes: `client` → `orders`(1) → `orders-db`(2) `write`, then `{ to: 'events', label: 'OrderUpdated' }`;
    - projection: `events`(2, queue, consumer `projector`) → `projector`(3, `processMs` = field) → `view-db`(4) `write { '{key}': '{value}' }`;
    - reads: `client` → `query`(1) → `view-db` read `'{key}'`.
- **Workload:**
  - `PUT /orders/42` with key `order 42` and values placed, paid and shipped, at 0, 150 and 300;
  - each followed by `GET /orders/42` at `+readDelay`, with `to: 'orders'` (single) or `'query'` (CQRS);
  - paths equal labels.
- **Fields:**
  - `model` (single/cqrs), sample single;
  - `readDelay` (0–140), sample 0;
  - `projector` (10–300), sample 30.
- **Presets:**
  - "Single model" `{single, 0, 30}`;
  - "CQRS, read at once" `{cqrs, 0, 30}`;
  - "CQRS, read 80 ms later" `{cqrs, 80, 30}`;
  - "Slow projector" `{cqrs, 80, 200}`.
- **Tests:**
  - *Single:* the reads' values are `['placed', 'paid', 'shipped']`.
  - *CQRS at once:* the first read returns no value (nothing projected yet), and every read is stale. The CQRS read `ms` is less than the single model's.
  - *80 ms later:* every value is fresh.
  - *Slow projector:* at least 2 reads are stale.
  - Refusal: `readDelay: '150'`.
- **Step variable:** `stale reads` = reads whose value differs from the last write sent before them.
- **Snippets:** `write` → `function handleCommand(cmd)`, `read` → `function handleQuery(q)`, `delivered` → `on('OrderUpdated'`, `done` → `return view`.
- **RANGES:** `readDelay [0, 140], projector [10, 300]`.

### Task 11: Event Sourcing

- **Topology:** `client`(0) → `account`(1) → `account-db`(2). With the event store, the db has `events: { perEventMs: PER_EVENT_MS, snapshotEvery }`.
  - For `when: 'POST'`, account calls `add { balance: '{value}' }` (state store) or `append '{value}'` (event store).
  - For `when: 'GET'`, it calls `read 'balance'`.
- **Workload:**
  - `operations` × `POST /account`, every 20 ms, with values cycling `+50, -20, +100, -30, +10, +20`;
  - then `GET /balance` 20 ms after the last one.
- **Fields:**
  - `store` (state/events), sample state;
  - `operations` (2–20), sample 8;
  - `snapshot` (off/every-5), sample off.
- **Presets:**
  - "State store" `{state, 8, off}`;
  - "Event store" `{events, 8, off}`;
  - "Event store, 20 operations" `{events, 20, off}`;
  - "Snapshots every 5" `{events, 18, every-5}`.
- **Tests:**
  - *State:* value `160`, and the final records are exactly `{ balance: '160' }`.
  - *Events:* value `160`, 8 event records, and `replayed` 8.
  - *20 ops:* the read's `ms` is 40 more than the state store's read with 20 ops.
  - *Snapshots:* `replayed` 3, and a `snapshot @15` record exists.
  - Refusal: `operations: '1'`.
- **Check by eye:** with 20 ops, the account-db box shows 5 records plus `+15 older` at 375 px.
- **Step variable:** `events replayed`.
- **Snippets:** `append` → `events.append(`, `read` → `function balance()`, `snapshot` → `saveSnapshot(`, `done` → `return total`.
- **RANGES:** `operations [2, 20]`.

### Task 12: Distributed Tracing

- **Topology:**
  - `client`(0) → `gateway`(1, route `/orders` → orders) → `orders`(2, parallel calls) → `payments`(3) → `payments-db`(4), and `inventory`(3) → `inventory-db`(4).
  - `slow` = `slow { instance: '<service>-1', processMs: 200, from: 120 }`, so it starts at #3.
- **Sampling:**
  - `sampled` = request ids whose draw from `seeded(7)` (one per request, in order) is below the rate: 1 for all, 0.1 for 10 %;
  - with seed 7, the 10 % set is `#1` and `#2`.
- **`extend`:** `spans: { title, endMs: result.endedAt, rows: spansOf(...).get(step request ?? latest request) ?? [] }`.
  - With propagation, the title is `trace of #3`.
  - Without it, the title is `#3: <k> separate traces`.
  - An unsampled request gets the title `#4 was not sampled` and no rows.
- **Fields:**
  - `slow` (none/payments/inventory), sample payments;
  - `propagate` (off/on), sample on;
  - `sampling` (all/10%), sample all;
  - `requests` (1–5), sample 5, one every 60 ms.
- **Presets:**
  - "Find the slow service" `{payments, on, all}`;
  - "No propagation" `{payments, off, all}`;
  - "10 % sampling" `{payments, on, 10%}`;
  - "Nothing slow" `{none, on, all}`.
- **Tests:**
  - *Slow:* in #3's spans, the payments span is `active` with `ms` ≥ 200.
  - *No propagation:* #3's rows all have depth 0, with distinct `trace`s.
  - *10 %:* only #1 and #2 have spans, and neither root span is longer than 100 ms, while #3's request takes over 200 ms.
  - *Nothing slow:* the slowest span is under 50 ms.
  - Refusal: `requests: '0'`.
- **Step variable:** `slowest span` (`payments 210 ms`).
- **Snippets:** `handle` → `const span = tracer.startSpan(`, `send` → `headers.traceparent =`, `done` → `span.end()`.
- **RANGES:** `requests [1, 5]`.

### Task 13: Deployment Strategies

- **Topology:** `client`(0) → `lb`(1, balancer round-robin) → `app`(2). `app-1…3` are `v1` and `app-4…6` are `v2`.
- **Plans** (deploy faults):
  - *recreate:* stop app-1…3 at 100, start app-4…6 at 220;
  - *rolling:* at 100, 220 and 340, start app-(3+k) and stop app-k;
  - *blue-green:*
    - start app-4…6 at 0;
    - weights `{ v1: 1, v2: 0 }`;
    - shift to `{ v1: 0, v2: 1 }` at 200;
    - when buggy, also shift back at 320.
  - *canary:* start app-4 at 0, with weights `{ v1: 0.75, v2: 0.25 }` and `canary { version: 'v2', maxErrors: 2 }`.

  In every plan except blue-green and canary, any v2 instance that isn't started gets a `start` fault.
- **Buggy:** `errors { node: 'app', version: 'v2', rate: 1, reason: '500: bug in v2' }`.
- **Fields:**
  - `strategy` (recreate/rolling/blue-green/canary), sample recreate;
  - `v2` (healthy/buggy), sample healthy;
  - `requests` (6–16), sample 12, one every 40 ms.
- **Presets:**
  - "Recreate" `{recreate, healthy}`;
  - "Rolling, buggy v2" `{rolling, buggy}`;
  - "Blue-green, buggy v2" `{blue-green, buggy}`;
  - "Canary, buggy v2" `{canary, buggy}`;
  - "Rolling, healthy" `{rolling, healthy}`.
- **Tests:**
  - *Recreate:* the requests sent at 120, 160 and 200 fail with `no healthy app instance`, and the others are ok.
  - *Rolling buggy:* no failure before 100, and the failure count in [100, 220) is at most the count in [340, 480).
  - *Blue-green buggy:* every request sent in [200, 320) fails, and every one from 320 on is ok.
  - *Canary buggy:* exactly 2 fail, there is one `rollback`, and no v2 pick follows it.
  - *Rolling healthy:* all ok.
  - Refusal: `requests: '5'`.
- **Step variables:** `served by v1/v2` (`7 / 5`) and `errors`.
- **Snippets:** `fault` → `deploy(next)`, `rollback` → `if (errors >= maxErrors) rollback()`, `pick` → `route(req)`, `done` → `promote()`.
- **RANGES:** `requests [6, 16]`.

### Task 14: Strangler Fig Migration

- **Topology:** `client`(0) → `facade`(1, gateway) → `monolith`(2) and `catalog`, `orders` and `payments`(2).
  - **Routes:**
    - `/` → monolith;
    - plus `/catalog`, `/orders` and `/payments` → the new service for the first `migrated` of them;
    - big bang has all three new routes and no monolith node.
- **Bug:** `errors { node: 'orders', rate: 1, reason: '500: bug in new orders' }`. With the strangler and the bug, `reroute { gateway: 'facade', at: 200, prefix: '/orders', to: 'monolith' }` is added.
- **Workload:** cycle `/catalog`, `/orders`, `/payments`, one every 30 ms.
- **Fields:**
  - `approach` (strangler/big-bang), sample strangler;
  - `migrated` (0–3), sample 0;
  - `bug` (none/new-orders), sample none;
  - `requests` (3–12), sample 9.
- **Presets:**
  - "Nothing moved" `{strangler, 0, none}`;
  - "Two paths moved" `{strangler, 2, none}`;
  - "Bug in new orders, strangler" `{strangler, 2, new-orders}`;
  - "Big bang, same bug" `{big-bang, 0, new-orders}`.
- **Tests:**
  - *Nothing moved:* every hop list contains `monolith-1`.
  - *Two paths:* /catalog and /orders reach the new services, /payments reaches monolith, and the request labels are the same as before.
  - *Bug, strangler:* the `/orders` requests before 200 fail, those after are ok, and the other paths are all ok.
  - *Big bang:* every `/orders` request fails.
  - Refusal: `migrated: '4'`.
- **Step variable:** `monolith share` (`33%`).
- **Snippets:** `route` → `const routes = {`, `fault` → `routes['/orders'] = monolith`, `done` → `return forward(req)`.
- **RANGES:** `migrated [0, 3], requests [3, 12]`.

### Task 15: Sidecar & Service Mesh

- **Topology:**
  - `client`(0) → `orders`(1) → `payments`(2).
  - The mesh adds `orders-proxy` and `payments-proxy`, in their service's column, linked at 1 ms to their service and at 5 ms to each other.
  - `errors { node: 'payments', rate: 0.4, reason: '500: flaky' }`.
  - The mesh policy on orders-proxy is `{ timeoutMs: 100, retry: { attempts: retries, backoff: 'fixed', baseMs: 10, jitter: false } }`, and `mtls` goes on payments-proxy.
  - The scraper is a `GET /charges (scraper)` request with `to: 'payments'` and `caller: 'scraper'` at 15 ms. Without the mesh, the client has a direct link to payments.
- **Fields:**
  - `mesh` (off/on), sample off;
  - `retries` (0–3), sample 2;
  - `mtls` (off/on), sample off;
  - `requests` (4–12), sample 8, one every 30 ms.
- **Presets:**
  - "No mesh" `{off, 2, off}`;
  - "Mesh with retries" `{on, 2, off}`;
  - "Mesh with mTLS" `{on, 2, on}`;
  - "Mesh without retries" `{on, 0, off}`.
- **Tests:**
  - *No mesh:* at least 1 order fails with `500: flaky`, and the scraper is ok.
  - *Mesh + retries:* fewer orders fail than with no mesh, and the orders node's `calls` are identical across presets.
  - *mTLS:* the scraper fails with `403: no client certificate`.
  - *Mesh without retries:* at least 1 order fails with `500: flaky`.
  - Refusal: `retries: '4'`.
- **Step variable:** `extra ms per call` = the mesh's orders → payments round trip minus the plain one, which is 6.
- **Snippets:** `handle` → `async function handle(req)`, `retry` → `retries: `, `deny` → `mtls: STRICT`, `done` → `return res`.
- **RANGES:** `retries [0, 3], requests [4, 12]`.

---

### Task 16: Docs, final verification and PR

**Files:**
- Modify:
  - `README.md`: the lesson list, and the "How to add a microservices lesson" section, covering records and `DataOp`, faults as operator actions, sidecars, and `extend` for spans;
  - `CLAUDE.md`: the `microservices/` bullet gains `relay.ts`, `sidecar.ts` and `tracing.ts`, and the test count is updated.
- Test: `src/lessons/lessons.test.ts` expects 23 microservices lessons and no microservices topic without a lesson.

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Run everything CI runs.** Run: `npm run typecheck && npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, and first-load JS stays under 600 kB.
- [ ] **Step 3: Do a browser pass.**
  - The catalog shows 23 live microservices lessons and no Coming soon card in Microservices.
  - Each new lesson's default preset plays, at 375 px and in dark mode.
  - The tracing waterfall and the event-store records fit at 375 px.
- [ ] **Step 4: Commit, push and open the PR**

```bash
git add README.md CLAUDE.md src/lessons/lessons.test.ts
git commit -m "Docs: Microservices phase 3"
git push -u origin microservices-phase-3
gh pr create --title "Microservices track, phase 3: data and operations" --body "<lessons, engine additions, deferred minors, test plan>"
```

The PR body has no AI attribution. Merging deploys, so ask before merging.
