# Microservices track, phase 1: foundations

Date: 2026-10-21
Status: approved design, awaiting spec review

## Goal

Add a fourth category, **Microservices**, that teaches learners to reason about microservice patterns by watching simulated services handle requests, fail and recover. Phase 1 builds the simulator engine and a new `services` view, and makes the 7 **Foundations** topics live. The other 16 topics show as Coming soon.

## Decisions

- **Reason about patterns, not tooling.** No Docker, Kubernetes or framework code. Lesson code is short pseudocode for the decision being made (routing, picking an instance, evicting an instance).
- **Own category**, next to Data Structures, Algorithms and SQL. A System Design track can come later and link to it.
- **Phase by phase.** Phase 1 = engine + Foundations (this spec). Phase 2 = Communication & Resilience. Phase 3 = Data & Operations. Each phase has its own spec, plan and PR.
- **A shared, seeded discrete-event simulator** (`src/microservices/`), not a hand-written generator per lesson and not a scripting language. Phases 2 and 3 add node behaviours; the event loop does not change.
- **The existing `form` input** drives every lesson (knobs = fields, scenarios = presets). There is no new input kind.
- **One new view kind, `services`**, carries the whole picture; phase 1 uses no `panels`.
- One spec, one plan, one PR on branch `microservices-track`; when built: commit, PR, merge, then plan phase 2.

## Curriculum

All 23 topics go into `curriculum.ts` under category `microservices`, with a group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | Foundations | `monolith-vs-microservices`: Monolith vs Microservices · `service-boundaries`: Service Boundaries · `synchronous-calls`: Synchronous Calls · `api-gateway`: API Gateway · `service-discovery`: Service Discovery · `load-balancing`: Load Balancing · `database-per-service`: Database per Service |
| intermediate | Communication & Resilience | `timeouts`: Timeouts · `retries-backoff`: Retries with Backoff & Jitter · `circuit-breaker`: Circuit Breaker · `bulkhead`: Bulkhead · `rate-limiting`: Rate Limiting · `message-queues`: Message Queues · `pub-sub`: Publish/Subscribe & Events · `idempotency`: Idempotency & Delivery Guarantees |
| advanced | Data & Operations | `saga`: Saga · `transactional-outbox`: Transactional Outbox · `cqrs`: CQRS · `event-sourcing`: Event Sourcing · `distributed-tracing`: Distributed Tracing · `deployment-strategies`: Deployment Strategies · `strangler-fig`: Strangler Fig Migration · `service-mesh`: Sidecar & Service Mesh |

Only the 7 Foundations topics are registered in phase 1.

## 1. Engine (`src/microservices/`)

No React, the same layering as `sql/`. Entry points never throw.

### Model (`model.ts`)

A **scenario** has:

- **Topology.** Nodes with `id`, `label`, `type` (`client`, `gateway`, `service`, `registry`, `balancer`, `db`) and a layout `column`. A service has one or more **instances** (`orders-1`, `orders-2`), each with a processing time in ms. **Links** join nodes and carry a network latency in ms.
- **Workload.** The requests the client sends: path (`GET /orders`), optional token, send time. Request ids are `#1`, `#2`, … in send order.
- **Faults.** `kill <instance> at t`, `slow <instance> to <ms> from t`, `down <db> at t`, `crash-on <service> <path prefix>` (the instance that handles a matching request crashes, as a bug would make it), and `rename-column <db> <from> → <to> at t, by <owner service>` (the owner's own queries are updated; everyone else's are not).
- **Behaviour config** for each node, read by its behaviour function: gateway routes and auth rule, registry heartbeat interval and TTL, balancer strategy, a service's dependencies (sequential or parallel), a database's schema (for lesson 7).

### Simulator (`sim.ts`)

- Simulated milliseconds; no real timers.
- An event queue ordered by `(time, sequence)`, so runs are fully deterministic.
- A seeded random number generator (`mulberry32`-style) is the only source of randomness. In phase 1 only the `random` balancer strategy uses it, with a fixed seed shown to the learner.
- Each node type has a **behaviour** function `(node, message, ctx) → actions`, where an action is: send a message, reply, fail, schedule a timer, or update node state. Phase 1 behaviours:
  - **client**: sends the workload; records each reply or failure against its request.
  - **gateway**: checks auth, matches the longest route prefix, forwards the request or rejects it (401 without a token, 404 for an unknown path) without calling a backend.
  - **registry**: records heartbeats; on each heartbeat-interval tick, evicts instances whose last heartbeat is older than the TTL; answers lookups with the healthy instance list.
  - **balancer**: picks an instance by `round-robin`, `least-connections` (fewest in-flight requests; ties go to the lowest index) or `random` (seeded); with health checks on, it skips instances marked dead.
  - **service**: waits its processing time (plus any `slow` fault), calls its dependencies one after another or in parallel, then replies. A dead instance accepts nothing, and a message sent to it fails after the link latency ("connection refused").
  - **db**: answers reads and writes after its processing time; while `down` it fails them; a query naming a column that is not in its schema fails ("no column `user_name`").
- **Trace events:** `send`, `arrive`, `handle`, `reply`, `fail`, `register`, `heartbeat`, `evict`, `lookup`, `pick`, `route`, `reject`, `fault`. Each carries the time, node ids and request id.
- **Limits.** The run stops at a simulated-time limit (`MAX_TIME` = 10,000 ms) and once every request has finished. Steps are capped at `MAX_STEPS` (200). Beyond the cap, a final summary step reports the outcome of each remaining request.

### Steps (`steps.ts`)

- Turns trace events into `Step[]`: `title` says what happened, with real values ("`orders-2` replies to #3 after 40 ms"), `why` says why, and `next` says what comes next.
- `codeLine` points into the lesson's pseudocode through `lineOf`.
- `variables` include `t` (ms) and the current request id.
- Consecutive events that teach nothing new (for example a heartbeat that changes nothing) are merged into one step.

### Invalid input

Out-of-range knobs (0 instances, a negative latency, a fault time after `MAX_TIME`, an empty route table) return one explanatory step through `refuse`, and no simulation runs.

### Scenario modules (`src/microservices/scenarios/<id>.ts`)

Each exports `fooCode` (pseudocode), `fooScenario(values)` (form values → a scenario, or the reason they are unusable) and `fooSteps(values)`, which builds the scenario and runs it. Tests call `fooScenario` + `simulate` to check outcomes directly. The algorithms pattern of code string + step generator carries over. Lesson content (text, fields, presets, quiz) stays in `src/lessons/microservices/<id>.ts`.

## 2. The `services` view

```ts
interface ServicesView {
  kind: 'services';
  nodes: {
    id: string; label: string;
    type: 'client' | 'gateway' | 'registry' | 'balancer' | 'service' | 'db';
    column: number; role: Role; badge?: string;
    instances?: { id: string; role: Role; badge?: string }[];
  }[];
  links: { from: string; to: string; role: Role }[];
  /** Messages in flight at this step. */
  messages: { id: string; from: string; to: string; label: string; role: Role; progress: number }[];
  /** label: "GET /orders"; hops: the path taken so far, e.g. "gw → orders-2 → db". */
  requests: { id: string; label: string; status: 'pending' | 'ok' | 'failed'; hops: string; ms?: number; reason?: string }[];
  /** The last few events, newest last. */
  log: string[];
}
```

- **Layout** (`servicesLayout.ts`, pure and tested, like `btreeLayout`). Nodes sit in left-to-right columns: client → gateway → services → databases. A service is one box with its instances stacked inside. Below 640px the columns become rows, top to bottom, so the page never scrolls sideways at 375px.
- **Messages** are labelled pills (`GET /orders #3`) drawn along their link at `progress` (0–1). Ids are stable across steps, so the renderer animates them.
- **Roles reuse the palette:**
  - `active`: the instance doing work;
  - `frontier`: a message in flight;
  - `found`: a request that succeeded;
  - `discarded`: a dead instance, a failed message or a failed request;
  - `compare`: a registry or balancer making its choice;
  - `visited`: idle;
  - `default`: everything else.

  `rolesInView` gains a `services` case.
- **Badges** show small state: the age of a registry entry's last heartbeat, an instance's in-flight count (least connections). Lesson 2's cross-service call count is a step variable.
- **Below the diagram:** a compact request table (id, status, path taken such as `gw → orders-2 → db`, total time, reason for a failure) and the event log (3–4 lines).
- Renderer `ServicesRenderer.tsx`, plus a case in `renderers/index.tsx`. Colours come from the CSS variables, and it is checked by hand in light and dark mode and at 375px.

## 3. Lessons

Every lesson has the usual text sections, pseudocode, a `form` visualization and a quiz of 4–5 questions using at least 3 question types, at least one of them showing a step's view (the existing `lessons.test.ts` rules). There is no `complexity` section: Big O does not describe these patterns, as with SQL. The copy is plain, short sentences that use the run's actual values.

| # | Lesson | Fields | Presets → what the learner should see |
|---|---|---|---|
| 1 | Monolith vs Microservices | architecture (monolith / split), requests, `reviews` bug on/off | *Same request both ways*: one process versus three network hops (more latency). *Reviews crashes*: the crash takes down the monolith's only process, so every request from then on fails; the split version fails only `/reviews`. |
| 2 | Service Boundaries | split (by layer / by business capability), requests | *By layer*: each checkout goes through ui → logic → data services (counted cross-service calls per request: high). *By capability*: an order stays inside `orders` (count: low). |
| 3 | Synchronous Calls | chain depth (1–4), per-hop latency, slow service (none / one), call style (sequential / parallel) | *Chain of 3*: total time = the sum of the hops. *One slow service*: the delay spreads to every caller upstream. *Parallel fan-out*: total time = the slowest branch. |
| 4 | API Gateway | request path, token present, auth required | *Route by path*: `/orders` → orders, `/users` → users. *No token*: 401 at the gateway, no backend call. *Unknown path*: 404 from the gateway. |
| 5 | Service Discovery | instances (1–4), heartbeat interval, TTL, dies at (never / t) | *Register and look up*: instances register; the client looks up, then calls. *Instance dies*: its heartbeats stop; requests sent between the death and the eviction fail; after eviction no request goes to it. |
| 6 | Load Balancing | strategy, instances (2–4), slow instance (none / one), health checks on/off | *Round robin*: even spread. *Slow instance*: round robin keeps sending to it; least connections steers around it. *Health check*: a dead instance is skipped. |
| 7 | Database per Service | data model (shared / per service), users team renames `name` → `full_name` | *Shared DB*: orders' query on `users.name` fails after the rename. *Per service*: orders calls the users API (one more hop), so the rename stays private and nothing breaks. |

Pseudocode examples: the gateway's `route(req)`, the balancer's `pick(instances)`, the registry's `onHeartbeat` and `evictExpired`, a service's `handle(req)` calling its dependencies.

## 4. App wiring

- `Category` gains `'microservices'`. `CATEGORY_TITLE` gains "Microservices". `Catalog`'s `INTRO` gains an entry.
- Routes `microservices` and `microservices/:lessonId` in `App.tsx`.
- Places that list categories by hand: `Home.tsx` (progress bars), `Dashboard.tsx` (the category list), `SearchPalette.tsx` (icon: `Network`). Every `Record<Category, …>` is completed (TypeScript reports any that are missing).
- `LessonPage` labels the code section "Pseudocode" for this category.
- Metadata goes in `src/lessons/meta/microservices.ts`, in learning order, with prerequisites chaining lesson to lesson. Content goes in `src/lessons/microservices/<id>.ts`.
- The engine is imported only by microservices lesson chunks, so first-load JavaScript stays under the 600 kB `check:bundle` budget.

## 5. Testing

- **Engine** (`sim.test.ts`):
  - events are ordered by `(time, sequence)`;
  - the same seed gives the same trace;
  - a dead instance never replies;
  - the registry evicts an instance after its TTL;
  - each balancer strategy picks the expected instances;
  - latency adds up along a sequential chain, and a parallel fan-out waits for its slowest branch;
  - a run stops at `MAX_TIME`.
- **Scenario contract** (`contract.test.ts`, modelled on the data-structures one). Every lesson runs each preset plus seeded random field values, and the test checks that:
  - the run produces at least 1 and at most `MAX_STEPS` + 1 steps;
  - every `codeLine` is valid;
  - every message and link endpoint names a node in the view;
  - every request ends `ok` or `failed` in the last step;
  - the form values are not mutated.
- **Teaching moments** (one test per preset in `lessons/*.test.ts` under `src/microservices/`), for example:
  - *Instance dies* fails at least one request inside the eviction window and none after it;
  - least connections sends fewer requests to the slow instance than round robin does;
  - the monolith *Reviews crashes* preset fails every request from the crash on, and the split version fails only `/reviews`;
  - the shared-DB rename fails orders' query, and the per-service rename does not.
- **Layout** (`servicesLayout.test.ts`): nodes don't overlap, and the narrow layout stacks columns as rows.
- The existing `lessons.test.ts` (references, quizzes, default visualization, code lines) and the `rolesInView` coverage pick up the new category and view kind.

## 6. Docs

- README: a "How to add a microservices lesson" section, and Microservices added to the features and architecture sections.
- CLAUDE.md: the `microservices/` layer, the `services` view kind (16 kinds), and the new category.

## Out of scope

- Phase 2 and 3 topics: timeouts, retries, breakers, bulkheads, rate limiting, queues, pub/sub, idempotency, sagas, outbox, CQRS, event sourcing, tracing, deployments, strangler fig, service mesh.
- Real networking or any backend; a new input kind; a scripting language for scenarios.
