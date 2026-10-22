# Microservices track, phase 2: communication and resilience

Date: 2026-10-22
Status: draft, awaiting review

## Goal

Make the 8 **Communication & Resilience** topics live. Learners see how services protect themselves when a dependency is slow, down or flooded, and how messages decouple a sender from its receivers:

- timeouts, retries, circuit breakers and bulkheads;
- rate limiting;
- queues and publish/subscribe;
- idempotency.

Phase 1 built the simulator, the `services` view and the 7 Foundations lessons. Phase 2 adds four things:

- call policies;
- a message broker;
- three faults;
- a rate limiter.

The rest of the engine stays as it is. The Data & Operations group stays Coming soon.

## Decisions

- **Same approach as phase 1.** The lessons are about patterns, not tooling, and use short pseudocode. Each one is driven by the existing `form` input and drawn as a `services` view. There is no new input kind and no new view kind.
- **Resilience is a policy on a call, not a new node.** A client request or a service's downstream call can carry a `CallPolicy`, which combines a timeout, retries, a circuit breaker and a bulkhead. Real libraries (Resilience4j, Polly) wrap calls the same way, and one wrapper serves 4 lessons.
- **One broker node type serves both messaging lessons.** In `queue` mode, consumers compete for each message. In `topic` mode, every subscriber gets its own copy.
- **The idempotency lesson uses retries, not the broker.** A payment's reply gets lost, the client retries, and the customer is charged twice unless the service remembers the request id. This reuses the timeout and retry policy. The lesson text explains that broker redelivery causes the same duplicates.
- **The view changes only where a lesson needs it:**
  - a `broker` node type;
  - a try count on request rows;
  - delivery rows in the request table;
  - stacked message pills, so several messages on one link stay readable. This fixes one of the minors deferred in PR #18.
- **Process:** one spec, one plan and one PR on branch `microservices-phase-2`, cut from `main`. If PR #19 (shared UI components) merges first, rebase onto it. Neither branch touches the other's files.

## Curriculum

The topics already exist in `curriculum.ts`. Registering metadata makes them live. All 8 are `intermediate`, in group `Communication & Resilience`, in this order. Prerequisites chain from `database-per-service`.

| # | id | Title |
|---|---|---|
| 8 | `timeouts` | Timeouts |
| 9 | `retries-backoff` | Retries with Backoff & Jitter |
| 10 | `circuit-breaker` | Circuit Breaker |
| 11 | `bulkhead` | Bulkhead |
| 12 | `rate-limiting` | Rate Limiting |
| 13 | `message-queues` | Message Queues |
| 14 | `pub-sub` | Publish/Subscribe & Events |
| 15 | `idempotency` | Idempotency & Delivery Guarantees |

## 1. Engine additions (`src/microservices/`)

The same rules as phase 1 apply:

- no React;
- entry points never throw on user input;
- runs are deterministic: events are ordered by `(time, sequence)`, and the only randomness comes from the seeded `rng`;
- runs stop at `MAX_TIME` (10,000 ms) and are capped at `MAX_STEPS` (200) steps plus one summary step.

### Call policies (`resilience.ts`)

```ts
interface CallPolicy {
  /** The caller stops waiting this long after sending an attempt. */
  timeoutMs?: number;
  /** attempts = retries after the first try (0–4). */
  retry?: { attempts: number; backoff: 'none' | 'fixed' | 'exponential'; baseMs: number; jitter: boolean };
  /** Opens after `threshold` failures in a row; stays open for `openMs`. */
  breaker?: { threshold: number; openMs: number };
  /** At most `size` calls in flight from one caller instance through the pool named `pool`. */
  bulkhead?: { pool: string; size: number };
}
```

- **Where a policy goes:** `Scenario.clientPolicy` applies to every request the client sends, and `Call.policy` applies to a service's downstream call. Client sends and service calls both go through one function, `callWithPolicy`. A call with no policy behaves exactly as in phase 1, so phase 1 lessons don't change.
- **Each attempt goes through three gates in order.** A later gate is never reached if an earlier one fails the attempt.
  1. **Bulkhead.** If the pool already has `size` calls in flight, the call fails at once with "bulkhead full". Otherwise it takes a slot, which it frees when the attempt ends.
  2. **Breaker.** If the breaker is open, the call fails at once with "circuit open".
  3. **Send.** The attempt is sent, with a timeout if the policy has one.
- **Timeouts.**
  - If no answer has arrived by `sent + timeoutMs`, the attempt fails with "timed out after X ms". This is traced as `timeout`.
  - An answer that arrives exactly at the deadline is too late.
  - An answer that arrives after the deadline is traced as `late` and ignored. The callee still did the work.
- **Retries.**
  - What gets retried: a refused connection, a failed answer, or a timeout.
  - What does not: fast failures from the call's own breaker or bulkhead. They end the call at once.
  - Before retry *n* (1, 2, …) the caller waits `delay(n)`:
    - `none`: 0;
    - `fixed`: `baseMs`;
    - `exponential`: `baseMs × 2^(n−1)`.
  - **Equal jitter** waits `floor(d/2 + rng() × d/2)`, where `d = delay(n)`. Half the wait is fixed, so backoff still waits out the trouble; the other half is random, so callers that failed together don't retry together.
  - Retries are traced as `retry`. `RequestOutcome.attempts` counts the client's tries.
- **Breaker.**
  - There is one breaker for each pair of caller service and target, shared by the caller's instances.
  - It has three states:
    - **closed** counts failures in a row, and a success resets the count;
    - **open** fails calls at once;
    - **half-open** lets exactly one trial call through, and fails the others at once while the trial is in flight.
  - The first call after `openMs` has passed moves the breaker to `half-open` and becomes the trial. If the trial succeeds, the breaker goes back to `closed`. If it fails, the breaker opens again for `openMs`.
  - Every change of state, and every change to the failure count, is traced as `breaker`, so the badge can show "closed 1/3".
  - Bulkhead pool usage changes are traced as `pool` events. They feed the badges and don't get steps of their own.
- **Bulkhead pools:**
  - each caller instance has its own pools;
  - two calls that name the same pool share it.

### Other node and request additions (`model.ts`)

- `Call.when?: string`: the call is made only for requests whose path starts with this prefix.
- `service.dedupe?: boolean`: the service remembers each request id it has finished, with its result.
  - A repeat of a finished request gets that result back at once, without the work being done again. This is traced as `duplicate`, with status `replayed`.
  - A repeat that arrives while the first is still running fails at once with "already in progress".
- `gateway.rateLimit?: { algorithm: 'fixed-window' | 'token-bucket'; limit: number; windowMs: number; per: 'all' | 'caller' }`.
  - **When the check runs:** after the token check and before routing.
  - **Fixed window:** allows `limit` requests in each window `[k·windowMs, (k+1)·windowMs)`.
  - **Token bucket:** starts full with `limit` tokens. It refills continuously at `limit` tokens per `windowMs`, up to `limit`, and each allowed request spends one token.
  - **Keys:** with `per: 'caller'`, each caller has its own window or bucket.
  - **Tracing:** each check is traced as `limit`, with whether it was allowed, the count used and the limit. A refused request is traced as `reject` with status 429 and fails with "429: rate limit".
- `RequestSpec.caller?: string` names the sender, such as alice or bob, for per-caller limits. Lessons include it in the request label.
- **Broker node:** `{ type: 'broker'; processMs; mode: 'queue' | 'topic'; consumers: string[]; redeliverMs }`.
  - **Queues:**
    - `queue` mode has one queue, named after the broker, and the instances of every consumer compete for its messages;
    - `topic` mode has one queue per consumer service, named after that service, and every message is copied into each of them.
  - **Storing:** a request or publish that reaches a broker is stored after `processMs`, traced as `store`. The broker then replies ok ("stored") at once. For the sender, that reply ends the call, so sending is asynchronous.
  - **Delivering:**
    - The broker sends a queue's oldest message to its lowest-index free consumer instance. An instance takes one message at a time (prefetch 1).
    - The consumer handles the message like a request, using its processing time and its calls. An ok answer is the ack.
    - A refused or failed delivery goes back to the front of its queue, traced as `requeue`, and is tried again after `redeliverMs`. That makes delivery at-least-once.
  - **Results:** each copy is a **delivery**. `SimResult.deliveries` lists them, each with:
    - an id `#3/email`;
    - its request;
    - its queue;
    - the instance that acked it;
    - its status;
    - `ms`, from store to ack;
    - its attempts.
- **New message kind:** `deliver`.

### Faults

- `outage { node, from, until, mode: 'refuse' | 'hang' }` affects every instance of a service for a while.
  - `refuse` works like `kill` at `from`: work in progress stops, and connections are refused. The instances come back at `until`, which is traced as `recover`.
  - `hang`: requests that arrive between `from` and `until` are accepted and never answered.
- `lose-reply { node, request }`: the first reply that `node` sends for `request` is lost on the network. It is traced as `lost` at the time it would have arrived.

### When a run ends

A run ends once every request is done and every stored message has been acked. Deliveries still open at `MAX_TIME` fail with "not processed by 10,000 ms". The event loop itself doesn't change.

### New trace events

| Event | Fields |
|---|---|
| `timeout` | caller, request, `afterMs` |
| `late` | the message that came too late |
| `retry` | caller, request, `attempt`, `delayMs` |
| `breaker` | caller, target, `state`, `failures` |
| `shed` | caller, request, `reason`: `circuit open` or `bulkhead full` |
| `limit` | gateway, request, key, `allowed`, `used`, `limit` |
| `store` | broker, request, the queues the message was copied into |
| `requeue` | broker, delivery, reason |
| `delivered` | delivery, `ok`, `ms`, reason |
| `duplicate` | node, request, `status`: `replayed` or `in progress` |
| `lost` | the message |
| `recover` | node |

`reject` also gains status 429.

## 2. Steps and the `services` view

- **Narration.** `traceSteps` describes every new event with real values. For example:
  - `api gives up on inventory after 200 ms`;
  - `#3 tries again in 74 ms (retry 2 of 3)`;
  - `The breaker on api → payments opens after 3 failures in a row`;
  - `api turns #7 away: circuit open`;
  - `The gateway refuses #6 with 429: 5 of 5 used in this window`;
  - `The broker stores #3 in 3 queues`;
  - `payments has already handled #2, so it returns the saved result`.

  Late and lost messages are narrated as wasted work or a missing answer.
- **Badges,** at most 24 characters:
  - a caller with a breaker: `breaker closed 1/3`, `breaker open` or `breaker half-open`;
  - a caller with bulkheads: its pools in use, `pool 3/4` or `recs 2/2, checkout 0/2`;
  - a gateway with a limit: `4/5 this window` or `tokens 2/5`, or per caller `bob 5/5, alice 1/5`;
  - each broker queue: `3 waiting` or `empty`.
- **View type changes:**
  - **Broker type.** `ServicesView` node `type` gains `'broker'`. A broker's queues are drawn with the `instances` rows: the id is the queue name, the badge shows what's waiting, and the role is `active` while the queue isn't empty.
  - **Tries.** Request rows gain `attempts?: number`, shown after the status when it's more than 1, as "3 tries".
  - **Delivery rows.** Each delivery is a row in the request table:
    - its id is `#3/email`;
    - its label is the message label and consumer, such as `OrderPlaced → email`;
    - its path is `broker → email-1`.

    Rows are sorted by request number, with each request before its deliveries.
- **Message pills.** Messages on the same link at nearly the same progress (within 0.05) are stacked so each label stays readable. Up to 3 stack, and the rest become one `+N more` pill. This is a pure, tested helper `stackMessages` in `servicesLayout.ts`.
- **Renderer.** `TYPE_NAME.broker` is "message broker". As before, it's checked by hand in light and dark mode and at 375 px.

## 3. Lessons

Every lesson follows the phase 1 shape:

- the usual text sections and pseudocode;
- a `form` visualization with `codeLabel: 'Pseudocode'`;
- no complexity section;
- a quiz of 4–5 questions using at least 3 question types, with at least one `predict-next` question that shows a step's view;
- plain, short sentences that use the run's actual values.

The shared numbers are the same as phase 1, unless a row says otherwise:

- 5 ms links;
- 10 ms instances;
- gateway 2 ms;
- db 3 ms;
- broker 2 ms.

The random seed is 7.

| # | Lesson | Topology | Fields (range, sample) | Presets → what the learner should see |
|---|---|---|---|---|
| 8 | Timeouts | client → api → inventory | `inventory` time (10–1000, 600), `apiTimeout` (0–2000, 0; 0 = none), `clientTimeout` (0–2000, 0), `requests` (1–4, 2; one every 100 ms) | *No timeouts*: each request waits about 630 ms, then succeeds. *API timeout 200 ms*: api gives up at 215 ms and the request fails after 220 ms; inventory's answer comes back later and is wasted. *Timeout too short* (inventory 20, api 25): a healthy service fails every call. *Client gives up first* (client 150, api 400): the client fails at 150 while api and inventory keep working for nothing. |
| 9 | Retries with Backoff & Jitter | client → api; api refuses connections from 0 until `outage` | `retries` (0–4, 3), `backoff` (none/fixed/exponential, none), `jitter` (off/on), `outage` (0–500, 200), `requests` (1–8, 6, all sent at 0); base 50 ms | *No retries*: all 6 fail. *Immediate retries*: 24 calls hit api during the outage, and all fail. *Fixed backoff*: retries at 60, 120 and 180 ms still land inside the outage. *Exponential*: the 4th try (380 ms) succeeds, but all 6 arrive in the same millisecond. *Exponential + jitter*: all succeed, and the busiest 10 ms falls below 6 calls. Step variables: `calls to api` and `busiest 10 ms`. |
| 10 | Circuit Breaker | client → api → payments; payments hangs from 40 ms until `recovers`; api → payments times out after 100 ms | `breaker` (off/on, off), `threshold` (1–5, 3), `openMs` (50–500, 150), `recovers` (100–2000, 300), `requests` (4–16, 12; one every 40 ms) | *No breaker*: every call during the outage waits the full 100 ms. *Breaker*: it opens after 3 timeouts, so later requests fail in about 20 ms and payments gets no calls. A half-open trial after recovery succeeds and closes it. *Payments stays down* (recovers 2000): the trial times out and the breaker opens again. |
| 11 | Bulkhead | client → api → recommendations / checkout; `Call.when` routes by path | `pools` (shared/separate, shared), `recs` (normal/slow, slow; slow = 400 ms), `requests` (2–12, 10; alternating `GET /recs` and `POST /checkout` every 10 ms) | *Shared pool of 4*: slow recommendation calls fill it, so checkout calls fail with "bulkhead full". *Separate pools of 2 and 2*: only recommendations fail, and every checkout succeeds. *Normal speed*: nothing fails either way. |
| 12 | Rate Limiting | client → gateway (limit, window 100 ms) → api | `algorithm` (fixed-window/token-bucket), `limit` (1–10, 5), `per` (all/caller), `traffic`: steady (10, one every 25 ms), edge (5 at 90 ms, 5 at 110 ms), noisy (bob: 8 from 0 ms, every 5 ms; alice at 12 and 42 ms) | *Steady*: all pass. *Fixed window, edge*: all 10 pass within 20 ms, double the limit. *Token bucket, edge*: 6 pass and 4 get 429. *Noisy, shared limit*: bob uses it up and alice gets a 429. *Per caller*: alice is never refused, and bob gets 3 refusals. |
| 13 | Message Queues | sync: client → worker. queue: client → broker (queue mode, redeliver 50 ms) → worker; worker 60 ms | `style` (sync/queue, sync), `workers` (1–3, 1), `jobs` (1–10, 6; one every 20 ms), `outage` (off/on; worker refuses from 30 to 230 ms) | *Direct call, worker down*: every job fails. *Queue, worker down*: every job is stored in about 12 ms, waits out the outage, and is processed. *Queue, one worker*: the queue grows to 3 or more. *Three workers*: the last job finishes sooner. |
| 14 | Publish/Subscribe & Events | client → orders → events broker → email, stock, analytics; orders publishes `OrderPlaced`, then replies; subscribers 30 ms | `subscribers` (1–3, 3), `mode` (topic/queue, topic), `emailDown` (off/on; email refuses from 20 to 300 ms), `orders` (1–5, 3; one every 40 ms) | *Every subscriber gets a copy*: 3 orders make 9 deliveries. *Email is down*: orders replies just as fast, stock and analytics carry on, and email catches up after it recovers. *Only email subscribes*: the publisher's code and timing don't change. *Queue instead of topic*: each order reaches only one subscriber. |
| 15 | Idempotency & Delivery Guarantees | client → payments → ledger (db); timeout 60 ms | `delivery` (at-most-once = no retry / at-least-once = 2 retries, fixed 20 ms), `lost` (off/on; payments' first reply for #2 is lost), `keys` (off/on; payments dedupes), `payments` (1–5, 3; one every 100 ms) | *At most once, reply lost*: #2 fails, yet the customer is charged. *At least once, reply lost*: #2 succeeds on retry, and the customer is charged twice. *At least once + idempotency key*: #2 succeeds and is charged once, because the retry gets the saved result. Step variable: `charges`. |

Pseudocode examples:

- `callWithTimeout`;
- `retry` with `backoff(n)`;
- the breaker's `call`, including `onSuccess` and `onFailure`;
- `withPool`;
- `allow(request)` for both algorithms;
- `publish` and `onMessage`, which acks;
- `handlePayment`, which checks the idempotency key.

## 4. App wiring

- **Metadata:** 8 entries are appended to `src/lessons/meta/microservices.ts`, and the content goes in `src/lessons/microservices/<id>.ts`. `lessons.test.ts` expects 15 microservices lessons.
- **No route or category work:** the category, routes and Coming soon cards already exist.
- **Bundle:** the engine stays out of first-load JavaScript, within the 600 kB budget.

## 5. Testing

- **Call policies** (`resilience.test.ts`):
  - a timeout fails the attempt at `sent + timeoutMs`;
  - an answer exactly at the deadline is late;
  - a late answer is traced and ignored;
  - the retry delays are right for `none`, `fixed` and `exponential`;
  - with equal jitter, every delay is in `[d/2, d]`, and the same seed gives the same delays;
  - breaker fast failures are not retried;
  - the breaker goes through all its states in order: `closed`, `open`, `half-open`, then `closed` or `open` again;
  - a full bulkhead fails at once, and a pool frees its slot when the attempt ends, including by timeout;
  - a call without a policy gives the same trace as phase 1.
- **Engine** (`sim.test.ts`, `behaviours.test.ts`, `broker.test.ts`):
  - a `refuse` outage stops work in progress and recovers at `until`;
  - a `hang` outage never answers;
  - `lose-reply` drops only the first reply;
  - `dedupe` replays a finished request and refuses one still in progress;
  - `Call.when` skips calls whose path doesn't match;
  - both rate-limit algorithms count, refill and key per caller correctly;
  - in `queue` mode each message goes to exactly one instance, and in `topic` mode one copy goes to each subscriber;
  - refused deliveries are requeued and redelivered;
  - a run waits for the broker to drain.
- **Steps and layout:**
  - new events are narrated;
  - badges are at most 24 characters;
  - attempts and delivery rows appear in the view;
  - `stackMessages` stacks up to 3 pills and folds the rest into `+N more`.
- **Contract:** `contract.test.ts` gains a `RANGES` entry for each new lesson. Random and edge settings must still satisfy the phase 1 contract, and delivery rows count as requests: none may be `pending` in the last step.
- **Teaching moments:** one test per preset in `scenarios/<id>.test.ts`, asserting the outcome in the table above.

## 6. Docs

- **README:** the lesson list and the "How to add a microservices lesson" section mention call policies and the broker.
- **CLAUDE.md:** the `microservices/` bullet gains `resilience.ts` and `broker.ts`, and the test count is updated.

## Out of scope

- **Phase 3 topics:** saga, outbox, CQRS, event sourcing, tracing, deployments, strangler fig and service mesh.
- **Broker features:** dead-letter queues, message ordering guarantees, consumer groups across services, and prefetch above 1.
- **Policy features:** fallbacks (cached answers), adaptive concurrency, and deadline propagation, which is mentioned in the Timeouts text only.
- **The other minors deferred in PR #18**, besides message pills.
