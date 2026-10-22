# Microservices track, phase 3: data and operations

Date: 2026-10-22
Status: draft, awaiting review

## Goal

Make the 8 **Data & Operations** topics live, which completes the Microservices track (23 of 23). Learners see:

- how data stays consistent when it is spread over services: sagas, the transactional outbox, CQRS and event sourcing;
- how a system is observed and changed while it runs: distributed tracing, deployment strategies, strangler fig migration and service meshes.

Phases 1 and 2 built the simulator, the `services` view, call policies and the broker. Phase 3 adds:

- data in databases (records that requests read and write);
- saga compensation;
- an outbox relay;
- an event store with snapshots;
- versions, deploys and canary rollback at the balancer;
- route changes at the gateway;
- sidecar proxies;
- spans, drawn as a waterfall.

The event loop doesn't change.

## Decisions

- **Same approach as phases 1 and 2.** The lessons are about patterns, not tooling, and use short pseudocode. Each is driven by the existing `form` input and drawn as a `services` view. There is no new input kind and no new view kind.
- **Data lives in db nodes as records** (key → value). A db call can read, write, delete or add to records. Records are drawn as rows inside the db box, the same way phase 2 draws broker queues as rows. Four lessons share this: saga, outbox, CQRS and event sourcing.
- **Saga = orchestration only.** An orchestrator service runs the steps in order and, when a step fails, runs the compensations of the finished steps in reverse. Choreography is explained in the lesson text and asked about in the quiz, but not simulated.
- **Tracing is an observation layer.** Spans are computed from the trace by a pure function. The simulator gains nothing for it.
- **Operator actions are scheduled faults.** Deploy steps (start, stop), weight shifts and route changes are scheduled like faults. A lesson's scenario decides when they happen, for example "the operator switches back at 320 ms" when v2 is buggy. The only automatic decision is the canary guard.
- **The view changes only where a lesson needs it:**
  - node types `relay` and `sidecar`;
  - record rows for db nodes;
  - a value column in the request table;
  - an optional span waterfall.
- **Process:** one spec, one plan and one PR on branch `microservices-phase-3`, cut from `main` at 1ca3f31. Work happens in the `stepwise` folder only, with no worktree.

## Curriculum

The topics already exist in `curriculum.ts`. Registering metadata makes them live. All 8 are `advanced`, in group `Data & Operations`, in this order. Prerequisites chain from `idempotency`.

| # | id | Title |
|---|---|---|
| 16 | `saga` | Saga |
| 17 | `transactional-outbox` | Transactional Outbox |
| 18 | `cqrs` | CQRS |
| 19 | `event-sourcing` | Event Sourcing |
| 20 | `distributed-tracing` | Distributed Tracing |
| 21 | `deployment-strategies` | Deployment Strategies |
| 22 | `strangler-fig` | Strangler Fig Migration |
| 23 | `service-mesh` | Sidecar & Service Mesh |

## 1. Engine additions (`src/microservices/`)

The phase 1 rules still apply:

- no React;
- entry points never throw on user input;
- runs are deterministic: events are ordered by `(time, sequence)`, and the only randomness comes from the seeded `rng`;
- runs stop at `MAX_TIME` (10,000 ms) and are capped at `MAX_STEPS` (200) steps plus one summary step.

Every phase 1 and phase 2 scenario must give the same steps as before.

### Records and data calls

- **Records.** A `db` node gains `records?: Record<string, string>` (its starting data, in insertion order). Each run works on its own copy.
- **Request data.** `RequestSpec` gains `key?: string` and `value?: string`, the data a request carries, such as key `order 42` and value `paid`.
- **Data calls.** A `Call` to a db gains `data?: DataOp`:

```ts
type DataOp =
  | { read: string }                       // reply carries the value (missing key → no value)
  | { write: Record<string, string> }      // all records in one query: atomic
  | { delete: string[] }
  | { add: Record<string, string> }        // numeric add: "+50", "-20"; a missing key counts as 0
  | { append: string };                    // event stores only, see below
```

- **Templates.** Keys and values may contain `{req}` (the request id, `#2`), `{key}` and `{value}` (the request's data). They are filled in when the call is made, so a broker delivery fills them from the request it carries.
- **Atomic writes.** A query with a `write` of several records applies all of them or, when the db is down, none.
- **Values in replies.**
  - A read's reply carries the value it read (`Message.value`).
  - A service's reply carries the last value any of its calls answered with for that request (a db read, or a service reply that has one).
  - `RequestOutcome.value` keeps what reached the client.
- **Trace events:**
  - `write`: `{ db, request, records }`, where a deleted key has the value `null`;
  - `read`: `{ db, request, key, value?, replayed? }`.

### `Call.path` and saga compensation

- **`Call.path?: string`.** The path the call sends, such as `/refund`. The callee's `Call.when` checks it, and calls without one use the request's path. This lets one service do different work for `/pay` and `/refund`.
- **`Call.compensate?: Call`.** The call that undoes this one.
  - In a sequential service, if call *k* fails, the service runs the `compensate` calls of calls *k−1 … 0* that succeeded, newest first, one after another. Then it fails the request with the original reason.
  - Compensations don't compensate themselves, and they are not retried. A failed compensation is traced and the next one still runs. Retrying compensations is out of scope; the lesson text mentions it.
  - Each one is traced as `compensate { node, instance, request, target }`.
  - Parallel services ignore `compensate`.

### New faults

| Fault | What it does |
|---|---|
| `errors { node, rate, reason, version?, request?, from? }` | When an instance of `node` (a service or one instance) finishes its processing time, it fails the request with `reason` instead of making its calls. This happens with chance `rate` (1 means always), drawn from the seeded `rng`. `version` limits the fault to instances of that version, `request` limits it to one request id, and `from` makes it start at that time. It is traced as `fail` at the instance. |
| `crash-after { node, after, request, restartMs? }` | The instance of `node` handling `request` crashes right after its call to `after` answers ok. Its job is then cut short, as with `crash-on`. With `restartMs`, it comes back that long later, traced `recover` with the instance id. |
| `deploy { instance, at, action: 'start' \| 'stop' }` | `start`: the instance starts serving at `at`. An instance with a `start` fault is not running before then. `stop`: the instance leaves rotation at `at`, finishes the work it holds, and then stops (traced `drained`). |
| `shift { balancer, at, weights }` | Replaces the balancer's version weights, as in a blue-green switch or a manual rollback. |
| `reroute { gateway, at, prefix, to }` | Points the gateway route for `prefix` at `to` (or adds it). |

### Event store

A `db` node gains `events?: { perEventMs: number; snapshotEvery?: number }`. It then works as an event store:

- **Appending.** `append` adds the next event `e<n>` with the call's value. This is traced as `append { db, request, seq, event }`.
- **Reading.** A `read` of any key replays the events since the latest snapshot. The value is the snapshot's value plus the sum of the replayed events, which are signed integers. The read takes `processMs + perEventMs × replayed` and is traced as `read` with `replayed`.
- **Snapshots.** With `snapshotEvery = N`, every N-th append also stores `snapshot @n` holding the running total, traced as `snapshot { db, seq, value }`.
- **Records.** The event store's records are its events and snapshots, so the history stays visible.

### Versions, deploys and the canary guard

- **Versions.** `Instance.version?: string` (`v1`, `v2`), shown as the instance badge.
- **Balancer.** The balancer gains `weights?: Record<string, number>` (version → share) and `canary?: { version: string; maxErrors: number }`.
  - **Rotation.** Instances that are not started, or that are draining, are never picked. Instances killed by other faults stay in rotation unless health checks are on, so the phase 1 Load Balancing lesson behaves as before.
  - **Weighted picks.** With `weights`, the balancer first draws a version by weight (seeded `rng`), then takes that version's instances in turn. A version with no instance in rotation gives its share to the others. When nothing is in rotation, the request fails with "no healthy app instance", as in phase 1.
  - **Canary guard.** It counts failed answers from the canary version. When the count reaches `maxErrors`, the canary's weight becomes 0, traced as `rollback { balancer, version, errors }`.
- **Trace events:** `drained { instance }`, `rollback`, and `fault` for `deploy`, `shift` and `reroute`.

### Outbox relay

- **The node.** `{ type: 'relay'; processMs; pollMs; db; to }`.
  - Every `pollMs` it queries `db` for records whose key starts with `outbox/`, oldest first.
  - For each record in turn, it publishes a request to the broker `to`, with the record's request id and its value as the label.
  - After the broker answers "stored", it deletes the record with a second query.
  - A poll doesn't start while the previous one is still running.
  - Each poll is traced as `poll { relay, found }`.
- **When a run ends.** A run doesn't end while any `outbox/` record exists, so the relay always gets to publish. An outbox record left at `MAX_TIME` is reported in the summary step.

### Sidecars and mTLS

- **The node.** `{ type: 'sidecar'; of: string; processMs; policy?: CallPolicy; mtls?: boolean }`.
- **Routing.** When a service has a sidecar:
  - **outbound:** each call its instances make goes first to its own sidecar, with the destination service in `Message.dest`. The sidecar sends it on through `ctx.call` with its `policy`, to the target's sidecar if it has one, otherwise to the target's first instance;
  - **inbound:** every request for the service reaches its sidecar first, which forwards it to the first live instance.
- **The app's calls don't change.** Retries, timeouts and the breaker now live in the sidecar.
- **mTLS.** A sidecar with `mtls: true` accepts requests only from another sidecar. Anything else is refused with "403: no client certificate", traced as `deny { node, request, reason }`.
- **Links.** Sidecar links are 1 ms, the local loopback, and sidecars take 1 ms to process.

### New trace events

| Event | Fields |
|---|---|
| `write` | db, request, records (`null` = deleted) |
| `read` | db, request, key, value?, replayed? |
| `append` | db, request, seq, event |
| `snapshot` | db, seq, value |
| `compensate` | node, instance, request, target |
| `drained` | instance |
| `rollback` | balancer, version, errors |
| `poll` | relay, found |
| `deny` | node, request, reason |

`recover` also accepts an instance id, for `crash-after` restarts.

## 2. Steps and the `services` view

- **Narration.** `traceSteps` describes every new event with real values. For example:
  - `orders-db saves order #2 = pending`;
  - `orders undoes payments for #2: /refund`;
  - `The relay finds 1 unsent event: #2`;
  - `account-db replays 18 events to answer #19`;
  - `app-4 (v2) leaves rotation and finishes its work`;
  - `The balancer rolls back v2 after 2 errors`;
  - `The gateway now sends /orders to monolith`;
  - `payments-proxy refuses #9: 403: no client certificate`.
- **Record rows.** A db node's records are drawn with the `instances` rows. The row id is the key, the badge is the value, and the role is `active` on the step that changed it.
  - At most 6 rows are shown: the newest 5 and a "+N older" row.
  - A deleted record disappears.
  - The badge is at most 24 characters, with longer values cut to fit and ending in "…".
- **Badges, at most 24 characters:**
  - an instance with a version shows `v2`, or `v2, not started` / `v1, stopped`;
  - a weighted balancer shows `v1 75%, v2 25%`, or `v2 rolled back`;
  - a sidecar shows the calls it has made and retried, `8 calls, 3 retried`;
  - a relay shows `next poll 40 ms`.
- **View type changes.**
  - **Node types.** `ServicesView` node `type` gains `'relay'` and `'sidecar'`. In the renderer, `TYPE_NAME.relay` is "outbox relay" and `TYPE_NAME.sidecar` is "sidecar proxy".
  - **Values.** Request rows gain `value?: string`, shown after the status as `→ paid`.
  - **Spans.** An optional section:

```ts
spans?: {
  /** "trace of #2", or "#2: 4 separate traces" without propagation. */
  title: string;
  /** The timeline's right edge in ms (the run's end). */
  endMs: number;
  rows: { id: string; label: string; start: number; ms?: number; depth: number; trace: string; role: Role }[];
};
```

- **Hook.** `StepOptions` gains `extend?: (event, result) => Partial<Pick<ServicesView, 'spans'>>`, merged into each step's view.
- **Seeded numbers outside a run.** `sim.ts` exports its generator as `seeded(seed)`, so a scenario module can make seeded choices, such as which requests to sample.
- **Spans (`tracing.ts`).** `spansOf(scenario, trace, upTo, { propagate, sampled }) → SpanRow[]` is pure and tested.
  - **What a span is:** the time from a request or query reaching a node to that node sending its reply. The client's span runs from the first send to `done`.
  - **Parents and traces:** a span's parent is the span of the node that sent the message. With `propagate`, all spans of a request share trace `T<n>`. Without it, every span starts its own trace, at depth 0.
  - **Sampling:** requests not in `sampled` have no spans.
  - **Open spans** have no `ms`, so the bar grows to the current time.
  - **What the view shows:** the spans of the step's own request, or of the latest request when the event has none.
- **Renderer.** Below the diagram and above the request table, it draws the waterfall:
  - one row per span, indented by depth;
  - a bar placed by `start` and `ms` on a 0 → `endMs` scale;
  - the duration printed after the bar;
  - roles from the palette (`discarded` for failed spans, `active` for the slowest one).

  At 375 px, labels shorten to the service name, and the section scrolls inside its own box if it must. As before, it is checked by hand in light and dark mode and at 375 px.

## 3. Lessons

Every lesson follows the phase 1 shape:

- the usual text sections and pseudocode;
- a `form` visualization with `codeLabel: 'Pseudocode'`;
- no complexity section;
- a quiz of 4–5 questions using at least 3 question types, with at least one `predict-next` question that shows a step's view;
- plain, short sentences that use the run's actual values.

The shared numbers are those of phases 1–2, unless a row says otherwise:

- 5 ms links;
- 10 ms instances;
- gateway 2 ms;
- db 3 ms;
- broker 2 ms;
- sidecar 1 ms, on 1 ms links.

The random seed is 7. Each field's sample value equals the lesson's first preset, which is the default run.

| # | Lesson | Topology | Fields (range, sample) | Presets → what the learner should see |
|---|---|---|---|---|
| 16 | Saga | client → orders (orchestrator) → orders-db, payments (→ payments-db), inventory (→ inventory-db). orders runs: save `order {req} = pending` · `/pay` · `/reserve` · save `order {req} = confirmed`. Compensations: `order {req} = cancelled`, `/refund` (→ `charge {req} = refunded`), `/release`. | `saga` (off/on, off), `fails` (none/payment/inventory, none; an `errors` fault on #2: "card declined" or "out of stock"), `orders` (1–4, 3; one every 60 ms) | *All in stock*: every order is `confirmed` and charged. *Out of stock, no saga*: #2 fails, yet the records show `order #2 = pending` and `charge #2 = charged`. The customer paid for nothing. *Out of stock, saga*: orders refunds the payment and cancels the order, newest step first, so the records end `refunded` and `cancelled`. *Card declined, saga*: only the order is cancelled, because the failed step itself needs no undo. Step variable: `inconsistent orders`. |
| 17 | Transactional Outbox | client → orders → orders-db, and → events broker (queue, consumer `email`). Outbox mode adds a relay (poll 40 ms) between orders-db and the broker. | `approach` (save-then-publish / publish-then-save / outbox, save-then-publish), `fault` (none / crash / db-down, crash; crash = orders-1 crashes after its first call for #2 and restarts 10 ms later; db-down = orders-db down from 60 ms), `orders` (1–5, 3; one every 50 ms) | *Save then publish, crash*: `order #2` is saved, but no OrderPlaced is ever stored, so email never hears of it. *Publish then save, db down*: email processes #2 and #3, which were never saved: ghost orders. *Outbox, crash*: the order and its `outbox/#2` row are saved in one write. The relay finds the row on its next poll and publishes it, so every saved order reaches email. Step variables: `saved` and `published`. |
| 18 | CQRS | Single: client → orders → orders-db, users (→ users-db), products (→ products-db); a read needs all three. CQRS: writes go client → orders → orders-db and publish OrderUpdated to the broker; projector consumes them into view-db; reads go client → query → view-db. Paths include the method (`PUT /orders/42`, `GET /orders/42`), so `when` tells them apart. | `model` (single/cqrs, single), `readDelay` (0–140, 0; each write of order 42, placed / paid / shipped every 150 ms, is followed by a read this much later), `projector` (10–300, 30; projector processing time) | *Single model*: every read sees the latest status but makes 3 calls. *CQRS, read at once*: reads take about half as long, but the first read after each write returns the old status. *CQRS, read 80 ms later*: every read is fresh. *Slow projector* (200): even 80 ms later, reads are stale. Step variable: `stale reads`. |
| 19 | Event Sourcing | client → account → account-db. State store: `add balance {value}`. Event store: `append {value}`, with `perEventMs` 2. A final `GET /balance` comes 20 ms after the last operation. | `store` (state/events, state), `operations` (2–20, 8; one every 20 ms, values cycling +50, −20, +100, −30, +10, +20), `snapshot` (off / every 5, off) | *State store*: the balance is 160 and the records hold only `balance = 160`. The history is gone. *Event store*: the same 160, with 8 events kept, and the read replays 8 events. *20 operations*: the read replays 20 events and takes 40 ms longer than the state store. *Snapshots every 5, 18 operations*: the read starts from `snapshot @15` and replays only 3 events. Step variable: `events replayed`. |
| 20 | Distributed Tracing | client → gateway → orders → payments and inventory, in parallel, each → its db. | `slow` (none/payments/inventory, payments; 200 ms from #3 on), `propagate` (off/on, on), `sampling` (all / 10 %, all), `requests` (1–5, 5; one every 60 ms) | *Find the slow service*: #3's waterfall shows the payments span taking about 200 ms of the request's total. *No propagation*: the same request becomes separate traces with no parents, so nothing links inventory's work to #3. *10 % sampling*: the scenario draws one number per request from `seeded(7)`, so only #1 and #2 are kept, and the slowdown that starts at #3 shows in no trace. Step variable: `slowest span`. |
| 21 | Deployment Strategies | client → lb (balancer) → app: `app-1…3` v1, `app-4…6` v2. Plans: **recreate**: stop v1 at 100, start v2 at 220. **rolling**: start one v2 and stop one v1 at 100, 220 and 340. **blue-green**: v2 runs from 0 with weight 0, shift to v2 at 200, and switch back at 320 when v2 is buggy. **canary**: app-4 starts at 0, weights v1 75 % / v2 25 %, guard `maxErrors` 2. | `strategy` (recreate / rolling / blue-green / canary, recreate), `v2` (healthy/buggy, healthy; buggy = `errors` rate 1 on v2), `requests` (6–16, 12; one every 40 ms) | *Recreate*: requests between 100 and 220 ms fail with "no healthy app instance": downtime. *Rolling, buggy v2*: failures start at 100 and grow as each v2 instance joins. *Blue-green, buggy v2*: every request fails from 200 to 320, then all succeed at once after the switch back. *Canary, buggy v2*: about a quarter of requests reach v2, and after 2 failures the balancer rolls v2 back, so only 2 requests fail. Step variables: `served by v1/v2` and `errors`. |
| 22 | Strangler Fig Migration | client → facade (gateway) → monolith, and the new services catalog, orders and payments. Requests cycle `/catalog`, `/orders`, `/payments`. | `approach` (strangler / big-bang, strangler), `migrated` (0–3, 0; how many paths go to new services, in that order; ignored by big bang), `bug` (none / new orders, none; `errors` rate 1 on the new orders service), `requests` (3–12, 9; one every 30 ms) | *Nothing moved*: every request goes to the monolith. *Two paths moved*: /catalog and /orders reach the new services, and clients use the same URLs. *Bug in new orders, strangler*: only /orders fails, and the facade routes /orders back to the monolith at 200 ms, so later /orders requests succeed again. *Big bang with the same bug*: there is no monolith to go back to, so every /orders request fails. Step variable: `monolith share`. |
| 23 | Sidecar & Service Mesh | client → orders → payments. Mesh adds orders-proxy and payments-proxy. payments has `errors` at rate 0.4 ("500: flaky"). A request from `scraper` goes straight to payments. | `mesh` (off/on, off), `retries` (0–3, 2; mesh retries, fixed 10 ms backoff; ignored without the mesh), `mtls` (off/on, off), `requests` (4–12, 8; one every 30 ms, plus the scraper's at 15 ms) | *No mesh*: some orders fail, and the only fix would be retry code inside orders. *Mesh with 2 retries*: the sidecars retry, and orders' code is unchanged. Most or all orders succeed, and each call takes 6 ms more: four 1 ms loopback hops, plus 1 ms in each proxy on the way in. *mTLS*: payments-proxy refuses the scraper with 403, while without the mesh the scraper gets through. Step variable: `extra ms per call`. |

Pseudocode examples:

- the saga orchestrator's `steps` and `compensate`;
- `placeOrder` with `db.transaction` writing the order and the outbox row, and the relay's `poll`;
- a command handler and a query handler, with the projector's `on(OrderUpdated)`;
- `append` and `balance()` folding the events from a snapshot;
- a handler that starts a child span and passes `traceparent`;
- the rollout loop with the canary's error check;
- the facade's route table;
- app code next to the mesh config (`retries`, `timeout`, `mtls: STRICT`).

## 4. App wiring

- **Metadata:** 8 entries are appended to `src/lessons/meta/microservices.ts`, and the content goes in `src/lessons/microservices/<id>.ts`. `lessons.test.ts` expects 23 microservices lessons, and no microservices topic is Coming soon any more.
- **No route or category work:** the category, routes and cards already exist.
- **Bundle:** the engine stays out of first-load JavaScript, within the 600 kB budget.

## 5. Testing

- **Records** (`sim.test.ts`):
  - reads, writes, deletes and adds change the records as described;
  - templates fill in `{req}`, `{key}` and `{value}`, also inside a broker delivery;
  - a multi-record write is atomic when the db is down;
  - a service's reply carries its last read value to `RequestOutcome.value`.
- **Saga:**
  - compensations run newest first, only for calls that succeeded;
  - a failed compensation doesn't stop the next one;
  - `Call.path` drives the callee's `when`.
- **Faults:**
  - `errors`: rate 1 always fails, rate 0 never does, and `version`, `request` and `from` limit it;
  - `crash-after`: the call was made and the reply never comes; the restart is traced;
  - `deploy`: not-started and draining instances are never picked, and a stop drains;
  - `shift` and `reroute` take effect at their time.
- **Event store:** sequence numbers, snapshots, replay counts and read times.
- **Balancer:** weighted picks follow the weights with seed 7, a version with nothing in rotation passes its share on, and the canary guard rolls back at `maxErrors`. Phase 1 load-balancing outcomes are unchanged.
- **Relay:** it publishes each outbox record once, deletes it after "stored", never overlaps polls, and keeps the run open until the outbox is empty.
- **Sidecar:**
  - outbound and inbound routing;
  - the sidecar's policy retries;
  - mTLS refuses a direct caller;
  - the app's `Call` list is not touched.
- **Tracing** (`tracing.test.ts`): parent and child links, depths, a shared trace id with propagation and separate ones without, unsampled requests left out, and open spans without `ms`.
- **Steps and layout:**
  - new events are narrated;
  - record rows show the newest 5 plus "+N older";
  - badges are at most 24 characters;
  - value cells appear;
  - `extend` merges spans into the view.
- **Contract:** `contract.test.ts` gains a `RANGES` entry for each new lesson. Random and edge settings keep the phase 1 contract, and spans, when present, only name requests that are in the table.
- **Teaching moments:** one test per preset in `scenarios/<id>.test.ts`, asserting the outcome in the table above.

## 6. Docs

- **README:** the lesson list, and the "How to add a microservices lesson" section, which gains records and data calls, faults as operator actions, and `extend` for extra view data.
- **CLAUDE.md:** the `microservices/` bullet gains `relay`, `sidecar` and `tracing.ts`, and the test count is updated.

## Out of scope

- **Saga choreography** as a simulation (it is covered in the text and quiz), and retries for compensations.
- **Outbox extras:** change data capture, and relay crashes that publish twice (the text links this to the Idempotency lesson).
- **Event sourcing extras:** optimistic concurrency, and upcasting old event versions.
- **Tracing extras:** tail-based sampling and metrics.
- **Deployment extras:** feature flags, automatic canary promotion, and database migrations during a deploy.
- **Mesh extras:** control-plane config pushes, and traffic splitting in the mesh.
- **Minors deferred in PRs #18 and #20.**
