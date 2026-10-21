# Microservices Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth category, Microservices, with a seeded discrete-event simulator, a `services` view, and the 7 Foundations lessons live (16 more topics as Coming soon).

**Architecture:** `src/microservices/` (no React) holds the model, the simulator (`simulate(scenario) → { trace, requests }`) and `traceSteps`, which replays the trace into `Step[]` with a `ServicesView` per step, the same split as SQL's `execute.ts` → `steps.ts`. Each lesson is a scenario module (`fooCode`, `fooScenario`, `fooSteps`) driven by the existing `form` input. `ServicesRenderer` draws the view from a pure, tested layout.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite, Vitest, Motion, Tailwind, lucide-react, Oxlint.

**Spec:** `docs/superpowers/specs/2026-10-21-microservices-track-phase-1-design.md`

## Global Constraints

- Branch `microservices-track` (already created; the spec and this plan are committed).
- `src/microservices/` contains no React. All lesson text lives in `src/lessons/`.
- Engine entry points never throw on user input; unusable form values return one step through `refusal(title, why, view)` (`src/algorithms/form.ts`).
- `MAX_TIME = 10_000` ms of simulated time; `MAX_STEPS = 200` steps plus at most one summary step.
- Deterministic: events ordered by `(time, sequence)`; the only randomness is `rng(seed)` (mulberry32). The `random` strategy uses seed 7.
- Code lines are looked up with `lineOf(code, snippet)` (`src/data-structures/shared.ts`), never hard-coded.
- Microservices lessons have no `complexity`. Quizzes have 4–5 questions, at least 3 types (`multiple-choice`, `code`, `predict-next`), at least one with a `view`.
- Copy: plain, short sentences for beginners, explaining what happened and why with the run's actual values.
- Colours come only from CSS variables; roles only from `roles.ts`.
- Commit messages, PR titles and PR bodies contain no AI attribution (no `Co-Authored-By` trailer for an AI, no "Generated with" line).
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`.

## Review Focus

- **Garbage in number fields** (blank, `abc`, `-3`, `1e9`): one refusal step, never a throw or an empty run. Pinned in Task 6's contract test (garbage values per field).
- **Two things at the same millisecond** (a kill at exactly the time a request arrives): a fault scheduled for time t applies before any message arriving at t, so the request fails. Pinned in Task 2.
- **The biggest knob values** (most requests, most instances, shortest heartbeat): the run is capped, ends with a summary step, and every request is `ok` or `failed` in the last step. Pinned in Task 4 and the contract test.
- **Phone width**: the widest column (4 fan-out branches in Synchronous Calls, 4 instances in Load Balancing) fits in 343 px (375 − 2 × 16 gutter) in the narrow layout. Pinned in Task 5.
- **Re-running the same values** (including `random` balancing) gives identical steps. Pinned in Task 6's contract test.

---

## File map

| File | Responsibility |
|---|---|
| `src/microservices/model.ts` | Scenario, node, fault, message and trace types; `MAX_TIME`, `MAX_STEPS` |
| `src/microservices/queue.ts` | `(time, sequence)` event queue |
| `src/microservices/sim.ts` | `simulate`: event loop, client/service/db behaviours, faults, outcomes |
| `src/microservices/behaviours.ts` | gateway, registry and balancer behaviours |
| `src/microservices/steps.ts` | `traceSteps`, `emptyServicesView`: trace → `Step[]` |
| `src/microservices/scenarios/<id>.ts` | one module per lesson: `fooCode`, `fooScenario`, `fooSteps` |
| `src/microservices/contract.test.ts` | contract over every microservices lesson |
| `src/types/visualization.ts` | `ServicesView` in the `View` union |
| `src/components/visualization/roles.ts` | `services` case in `rolesInView` |
| `src/components/visualization/renderers/servicesLayout.ts` | pure layout (columns / rows) |
| `src/components/visualization/renderers/ServicesRenderer.tsx` | SVG diagram + request table + log |
| `src/components/visualization/renderers/useNarrow.ts` | `(max-width: 639px)` media query hook |
| `src/lessons/meta/microservices.ts` | lesson metadata in learning order |
| `src/lessons/microservices/<id>.ts` | lesson content |

---

### Task 1: Category wiring, curriculum and `readChoice`

**Files:**
- Modify: `src/types/lesson.ts` (`Category`), `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/registry.ts`, `src/lessons/all.testutil.ts`, `src/lessons/split.test.ts`, `src/lessons/lessons.test.ts`, `src/App.tsx`, `src/pages/Catalog.tsx`, `src/pages/Home.tsx`, `src/pages/Dashboard.tsx`, `src/pages/LessonPage.tsx`, `src/components/navigation/SearchPalette.tsx`, `src/algorithms/form.ts`
- Create: `src/lessons/meta/microservices.ts`, `src/algorithms/form.test.ts` (or extend if present)

**Interfaces:**
- Produces: `Category` includes `'microservices'`; `microservicesMeta: LessonMeta[]` (empty for now); `readChoice(values, name, label, options: readonly string[]): Read<string>`.

- [ ] **Step 1: Write failing tests**

In `lessons.test.ts`, add:

```ts
it('lists the Microservices course in order', () => {
  expect(topicsIn('microservices').map((t) => t.id)).toEqual([
    'monolith-vs-microservices', 'service-boundaries', 'synchronous-calls', 'api-gateway',
    'service-discovery', 'load-balancing', 'database-per-service',
    'timeouts', 'retries-backoff', 'circuit-breaker', 'bulkhead', 'rate-limiting',
    'message-queues', 'pub-sub', 'idempotency',
    'saga', 'transactional-outbox', 'cqrs', 'event-sourcing', 'distributed-tracing',
    'deployment-strategies', 'strangler-fig', 'service-mesh',
  ]);
  expect(topicsIn('microservices').map((t) => t.group)).toEqual([
    ...Array(7).fill('Foundations'), ...Array(8).fill('Communication & Resilience'), ...Array(8).fill('Data & Operations'),
  ]);
});
```

In `split.test.ts`, add `'microservices'` to the category loop and `'microservices.ts'` to the expected meta files. In `form.test.ts`:

```ts
it('reads a choice and refuses anything else', () => {
  expect(readChoice({ s: 'parallel' }, 's', 'Style', ['sequential', 'parallel'])).toEqual({ ok: true, value: 'parallel' });
  expect(readChoice({ s: 'x' }, 's', 'Style', ['sequential', 'parallel'])).toEqual({ ok: false, why: 'Style must be one of: sequential, parallel.' });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/lessons src/algorithms/form.test.ts`
Expected: FAIL (`microservices` is not a category; `readChoice` is not exported).

- [ ] **Step 3: Implement**

- `Category` gains `'microservices'`. `CATEGORY_TITLE.microservices = 'Microservices'`.
- `curriculum.ts`: three `topics('microservices', …)` blocks with the ids above, titles from the spec's Curriculum table, and groups `Foundations` (beginner), `Communication & Resilience` (intermediate), `Data & Operations` (advanced).
- `meta/microservices.ts` exports `microservicesMeta: LessonMeta[] = []`, appended last in `registry.ts`'s `lessons`.
- Add `microservices` to the `import.meta.glob` brace lists in `registry.ts`, `all.testutil.ts` and `split.test.ts`.
- `lessons.test.ts` "has complete content": skip the complexity checks when `lesson.category === 'sql' || lesson.category === 'microservices'`. Add `expect(lessonsIn('microservices')).toHaveLength(0)` (later tasks raise it).
- `App.tsx`: routes `microservices` → `<Catalog category="microservices" />` and `microservices/:lessonId` → `<LessonPage category="microservices" />`.
- `Catalog` `INTRO.microservices`: "How a system made of many small services stays fast and keeps working when parts of it fail. Each lesson runs a simulated system on your settings, one message at a time."
- `Home.tsx`: a fourth `ProgressBar` labelled "Microservices". `Dashboard.tsx`: add `'microservices'` to the track list.
- `SearchPalette.tsx`: icon `Network` for `microservices`.
- `LessonPage.tsx`: the code section's title and the code panel label are "Pseudocode" for `microservices`. Keep the existing "Example query"/"SQL" logic for SQL.
- `readChoice` in `src/algorithms/form.ts`, next to `readInt`.

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "Add the Microservices category and its curriculum"
```

---

### Task 2: Model, event queue and core simulator

**Files:**
- Create: `src/microservices/model.ts`, `src/microservices/queue.ts`, `src/microservices/sim.ts`, `src/microservices/sim.test.ts`

**Interfaces:**
- Produces (`model.ts`):

```ts
export const MAX_TIME = 10_000;
export const MAX_STEPS = 200;

export type Strategy = 'round-robin' | 'least-connections' | 'random';
export interface Instance { id: string; processMs: number }
/** A downstream call. `columns` are what a query to a db reads, e.g. "users.name". */
export interface Call { to: string; columns?: string[] }

interface NodeBase { id: string; label: string; column: number }
export type NodeSpec = NodeBase &
  (
    | { type: 'client'; discovery?: { registry: string; service: string } }
    | { type: 'gateway'; processMs: number; routes: { prefix: string; to: string }[]; requireToken: boolean }
    | { type: 'registry'; processMs: number; heartbeatMs: number; ttlMs: number; serves: string[] }
    | { type: 'balancer'; processMs: number; target: string; strategy: Strategy; healthCheckMs?: number }
    | { type: 'service'; instances: Instance[]; calls: Call[]; parallel: boolean }
    | { type: 'db'; processMs: number; columns: string[] }
  );
export type NodeType = NodeSpec['type'];

export interface Link { from: string; to: string; latencyMs: number }
/** `to` is the first hop's node id; ids are "#1", "#2", … in send order. */
export interface RequestSpec { label: string; path: string; to: string; at: number; token?: boolean }

export type Fault =
  | { kind: 'kill'; instance: string; at: number }
  | { kind: 'slow'; instance: string; processMs: number; from: number }
  | { kind: 'down'; node: string; at: number }
  | { kind: 'crash-on'; node: string; prefix: string }
  | { kind: 'rename-column'; node: string; from: string; to: string; at: number; owner: string };

export interface Scenario { nodes: NodeSpec[]; links: Link[]; requests: RequestSpec[]; faults: Fault[]; seed?: number }

export type MessageKind = 'request' | 'reply' | 'query' | 'lookup' | 'heartbeat' | 'probe';
export interface Message {
  id: string;            // "m1", "m2", … in send order
  request?: string;      // "#3"; absent for heartbeats and probes
  kind: MessageKind;
  from: string;          // node or instance id
  to: string;            // node or instance id
  label: string;         // "GET /orders #3", "reply #3", "heartbeat orders-2"
  departs: number;
  arrives: number;
  ok?: boolean;          // replies only
  reason?: string;       // failed replies only
}

export type TraceEvent = { t: number } & (
  | { kind: 'send'; message: Message }
  | { kind: 'arrive'; message: Message }
  | { kind: 'handle'; node: string; instance?: string; request: string }
  | { kind: 'fail'; at: string; request?: string; reason: string }
  | { kind: 'register' | 'heartbeat' | 'evict'; registry: string; instance: string }
  | { kind: 'lookup'; registry: string; service: string; result: string[] }
  | { kind: 'pick'; balancer: string; instance: string; strategy: Strategy; inFlight: Record<string, number> }
  | { kind: 'route'; gateway: string; request: string; to: string }
  | { kind: 'reject'; gateway: string; request: string; status: 401 | 404 }
  | { kind: 'mark'; balancer: string; instance: string; healthy: boolean }
  | { kind: 'fault'; fault: Fault }
  | { kind: 'done'; request: string; ok: boolean; ms: number; reason?: string }
);

export interface RequestOutcome {
  id: string; label: string; sentAt: number; status: 'ok' | 'failed'; ms: number;
  hops: string[];               // node/instance ids the request reached, in order
  crossServiceCalls: number;    // messages between two different service nodes
  reason?: string;
}
export interface SimResult { trace: TraceEvent[]; requests: RequestOutcome[]; endedAt: number; timedOut: boolean }
```

- Produces (`queue.ts`): `class EventQueue<T> { push(time: number, item: T): void; pop(): { time: number; item: T } | undefined; get size(): number }`, ordered by time, then by push order.
- Produces (`sim.ts`): `simulate(scenario: Scenario): SimResult` and the behaviour hook `type Behaviour = (ctx: SimContext, node: NodeSpec, message: Message) => void` with `SimContext` exposing `now`, `send(from, to, partial message)`, `reply(to: Message, ok: boolean, reason?)`, `at(time, fn)`, `trace(event)`, `isDead(instanceId)` and `rng()`. Task 3 registers gateway/registry/balancer behaviours through this hook.

**Semantics this task implements** (tests pin them):
- A message's `arrives = departs + link latency`. A link is looked up by node id in either direction; a message to or from an instance uses its service's links. A send with no link is a scenario bug and throws (this is a programming error, not user input; scenario modules are tested).
- Faults are scheduled before any message, so a fault at time t applies before a message arriving at t.
- **client**: sends each `RequestSpec` at `at`. Without `discovery` it sends to `to` (a service gets `instances[0]`). It records the reply as the outcome; `ms = reply arrival − sentAt`.
- **service instance**: on arrival, `handle`, wait its `processMs` (or a `slow` fault's value once `t ≥ from`), make its `calls` one after another (each waits for its reply) or all at once when `parallel`, then reply ok. If any call fails, it replies failed with the same `reason`. Instances handle requests concurrently; there is no queue.
- **dead instance**: a message arriving at it produces `fail` (`reason: "<id> refused the connection"`) and a failed reply over the same link. `kill` at t also fails every request that instance is handling (`reason: "<id> stopped"`).
- **crash-on**: the instance that handles a request whose path starts with `prefix` dies at handle time, exactly like `kill`: that request fails with `"<id> crashed"`, others it is handling fail with `"<id> stopped"`, and later arrivals are refused.
- **db**: replies after `processMs`; while `down` it replies failed (`"<id> is down"`); a query whose `columns` aren't all in its columns replies failed (`"no column <col>"`). `rename-column` at t renames the column and rewrites the `owner` service's `Call.columns`.
- The run ends when the queue is empty or at `MAX_TIME`. Every request still open then fails with `"no reply by 10,000 ms"`, and `timedOut` is true.
- Every request ends with one `done` event.

- [ ] **Step 1: Write failing tests** in `sim.test.ts`, with small topologies built in the test file:

```ts
it('orders events by time, then by the order they were scheduled', () => { /* EventQueue: push(5,'b'), push(1,'a'), push(5,'c') → a, b, c */ });
it('adds latency and processing along a sequential chain', () => {
  // client → a → b → c, every link 10 ms, every instance 5 ms, one request at 0
  expect(simulate(chain(3, 'sequential')).requests[0]).toMatchObject({ status: 'ok', ms: 75, hops: ['client', 'a-1', 'b-1', 'c-1'] });
});
it('waits for the slowest branch of a parallel fan-out', () => {
  // client → a; a calls b, c, d in parallel; d-1 takes 200 ms
  expect(simulate(fanOut()).requests[0]!.ms).toBe(10 + 5 + (10 + 200 + 10) + 10);
});
it('fails a request sent to a dead instance after the link latency', () => {
  const r = simulate(withFault(chain(1, 'sequential'), { kind: 'kill', instance: 'a-1', at: 0 }));
  expect(r.requests[0]).toMatchObject({ status: 'failed', ms: 20, reason: 'a-1 refused the connection' });
});
it('applies a fault before a message arriving at the same millisecond', () => { /* kill a-1 at 10; request arrives at 10 → failed, refused */ });
it('fails what an instance is handling when it is killed', () => { /* a-1 processMs 50, kill at 30 → "a-1 stopped" */ });
it('crashes the instance that handles a matching path and refuses the rest', () => { /* crash-on /reviews: #1 /reviews "crashed", #2 /products after it refused */ });
it('slows an instance from the fault time on', () => { /* slow to 100 from 20: a request at 0 takes the base time, one at 30 takes +95 */ });
it('fails a query on a renamed column, but not the owner\'s queries', () => { /* rename users.name → users.full_name at 15 by users-svc */ });
it('counts calls between two service nodes', () => { /* a → b → db: crossServiceCalls 1 */ });
it('gives every request exactly one done event and stops at MAX_TIME', () => { /* a 20,000 ms instance → failed "no reply by 10,000 ms", timedOut */ });
it('gives the same trace for the same scenario', () => { expect(simulate(s)).toEqual(simulate(s)); });
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/microservices/sim.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `model.ts`, `queue.ts` (a binary heap keyed by `[time, seq]`) and `sim.ts` with the semantics above. Behaviours are looked up by node type from a `Record<NodeType, Behaviour | undefined>`; gateway, registry and balancer are left `undefined` until Task 3.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/microservices && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/microservices
git commit -m "Microservices simulator: model, event queue, services, databases and faults"
```

---

### Task 3: Gateway, registry and balancer behaviours

**Files:**
- Create: `src/microservices/behaviours.ts`, `src/microservices/behaviours.test.ts`
- Modify: `src/microservices/sim.ts` (register the three behaviours; client discovery)

**Interfaces:**
- Consumes: `Behaviour`, `SimContext`, model types (Task 2).
- Produces: `gateway`, `registry`, `balancer: Behaviour`, plus `pickInstance(strategy, live: string[], inFlight: Record<string, number>, cursor: number, rng: () => number): string` (exported for tests).

**Semantics:**
- **gateway**: after `processMs`, if `requireToken` and the request has no token, reply failed `401` (`reject` event, `reason: "401: no token"`). Otherwise match the longest `prefix` that the path starts with. With no match, reply failed `404` (`"404: no route for <path>"`). With a match, emit `route` and forward; relay the reply back. A rejected request reaches no backend.
- **registry**: at t = 0 every instance of each `serves` service sends `register`. Each live instance then sends a `heartbeat` every `heartbeatMs`. On ticks at multiples of `heartbeatMs`, evict every instance whose last heartbeat is older than `ttlMs` (`now − last > ttlMs`). A lookup replies after `processMs` with the registered instances of the asked service, in id order (`lookup` event).
- **client with `discovery`**: for each request, look up the service, then send to the next instance in round-robin order over the returned list (a cursor kept across requests). An empty list fails the request: `"no <service> instance registered"`.
- **balancer**: after `processMs`, pick an instance of `target` (`pick` event with the in-flight counts), forward, and relay the reply. In-flight count = requests forwarded to the instance and not yet replied.
  - `round-robin`: the next one by cursor.
  - `least-connections`: the fewest in flight, ties to the lowest index.
  - `random`: `rng()` over the candidates.

  The candidates are all instances, minus those marked unhealthy. With `healthCheckMs`, it sends a `probe` to each instance at every multiple of `healthCheckMs`: a failed probe marks the instance unhealthy, an ok probe healthy (`mark` events, emitted only when the state changes). With no healthy candidate, the request fails: `"no healthy <target> instance"`.

- [ ] **Step 1: Write failing tests** (`behaviours.test.ts`):

```ts
it('routes by the longest matching prefix', …);           // /orders → orders; /orders/42 → orders
it('rejects without a token and with an unknown path, before any backend', …);  // hops never include a service instance
it('evicts an instance once its heartbeats are older than the TTL', () => {
  // 3 instances, heartbeat 20, ttl 60, links 5, kill orders-2 at 50 → its last heartbeat (sent 40) arrives at 45 → evicted at the first tick t with t − 45 > 60, i.e. t = 120
});
it('fails requests sent to a dead instance before eviction, and none after', …);
it('spreads round robin evenly', …);                      // 12 requests over 3 → 4 each
it('steers least connections away from a slow instance', …); // api-1 at 120 ms vs 20 ms → api-1 gets fewer than 4 of 12
it('picks the same instances for the same seed', …);
it('stops sending to an instance after a failed health check', …); // no request picked after the mark event goes to it
it('pickInstance breaks least-connection ties by lowest index', () => {
  expect(pickInstance('least-connections', ['a', 'b', 'c'], { a: 1, b: 0, c: 0 }, 0, () => 0)).toBe('b');
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/microservices/behaviours.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `behaviours.ts` and register the behaviours and discovery in `sim.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/microservices && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/microservices
git commit -m "Simulator behaviours: gateway routing and auth, service registry, load balancer"
```

---

### Task 4: `ServicesView` type and trace → steps

**Files:**
- Modify: `src/types/visualization.ts`, `src/components/visualization/roles.ts`, `src/components/visualization/roles.test.ts`
- Modify: `src/components/visualization/renderers/index.tsx` (temporary `case 'services': return null;` replaced in Task 5)
- Create: `src/microservices/steps.ts`, `src/microservices/steps.test.ts`

**Interfaces:**
- Produces (`visualization.ts`, exactly the spec's interface):

```ts
export interface ServicesView {
  kind: 'services';
  nodes: { id: string; label: string; type: 'client' | 'gateway' | 'registry' | 'balancer' | 'service' | 'db';
           column: number; role: Role; badge?: string; instances?: { id: string; role: Role; badge?: string }[] }[];
  links: { from: string; to: string; role: Role }[];
  messages: { id: string; from: string; to: string; label: string; role: Role; progress: number }[];
  requests: { id: string; label: string; status: 'pending' | 'ok' | 'failed'; hops: string; ms?: number; reason?: string }[];
  log: string[];
}
```

  Message `from`/`to` in the view are **node** ids (an instance id is mapped to its service), so links resolve.
- Produces (`steps.ts`):

```ts
export interface Narration { title: string; why: string; next?: string }
export interface StepOptions {
  code: string;
  /** A snippet of `code` per event kind, for lineOf; kinds left out use line 1. */
  lines: Partial<Record<TraceEvent['kind'], string>>;
  /** Lesson wording for an event; return undefined to keep the default. */
  explain?: (event: TraceEvent, result: SimResult) => Partial<Narration> | undefined;
  variables?: (event: TraceEvent, result: SimResult) => Record<string, string | number>;
}
export function traceSteps(scenario: Scenario, result: SimResult, options: StepOptions): Step[];
export function emptyServicesView(): ServicesView;
```

**Rules:**
- One step per narrated event, with these folds:
  - an `arrive` folds into the next event on the same node at the same time;
  - `send` events of `heartbeat` and `probe` messages make no step of their own;
  - consecutive `heartbeat`/`arrive`-of-heartbeat/`probe` events merge into one step ("3 heartbeats reach the registry").
- **Default titles** use real values, for example: "#3 leaves the client for the gateway"; "orders-2 replies to #3 (45 ms so far)"; "The registry drops orders-2: no heartbeat for 70 ms"; "The balancer picks api-2 (round robin)"; "#4 fails: orders-2 refused the connection". `explain` can override `title`, `why` and `next`.
- **Variables**: `t` = `"<t> ms"`, and `request` when the event has one, merged with `options.variables`.
- **View roles**:
  - instance: dead → `discarded`; handling a request → `active`; has handled one → `visited`; otherwise `default`;
  - non-service node: `active` on its own event, `compare` on `lookup`/`pick`, otherwise `default`;
  - link: `frontier` while a message is on it;
  - message: failed reply → `discarded`, ok reply → `found`, otherwise `frontier`.
- **Message `progress`** = `(t − departs) / (arrives − departs)`, clamped to 0–1. A message is shown from its send step through its arrive step, then dropped.
- **Badges**:
  - instances behind a `least-connections` balancer: `"<n> in flight"`;
  - instances of a registry's `serves` service: `"beat <t − last> ms ago"`, or `"evicted"`.
- **Requests table**: requests sent so far, with `hops` joined by `" → "`, plus `ms`/`reason` once done. **Log**: the last 4 default titles.
- After `MAX_STEPS` steps, one summary step: title `"<n> more events"`, the final view with every request's outcome, `codeLine` = the `done` line or 1.

- [ ] **Step 1: Write failing tests** (`steps.test.ts`, `roles.test.ts`):

```ts
it('makes a step per event with code lines from the snippets', …);  // a chain scenario; every codeLine in range; a 'handle' step points at lineOf(code, snippet)
it('folds an arrival into the handling that follows it', …);
it('merges consecutive heartbeats into one step', …);
it('moves a message from progress 0 to 1 and then drops it', …);
it('marks a dead instance discarded and a failed reply discarded', …);
it('caps a long run at MAX_STEPS plus one summary step with every request finished', () => {
  // 40 requests through a balancer with probes every 10 ms
  const steps = traceSteps(s, simulate(s), opts);
  expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
  const last = steps.at(-1)!.view as ServicesView;
  expect(last.requests.every((r) => r.status !== 'pending')).toBe(true);
});
// roles.test.ts
it('lists the roles in a services view', …);  // nodes, instances, links, messages, plus request status ok → found, failed → discarded
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/microservices/steps.test.ts src/components/visualization/roles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `ServicesView` in the union, the `rolesInView` case (as in the test), `steps.ts` (replay the trace, keeping the view state described above), and the temporary renderer case.

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Services view type and trace-to-steps narration"
```

---

### Task 5: Layout and `ServicesRenderer`

**Files:**
- Create: `src/components/visualization/renderers/servicesLayout.ts`, `servicesLayout.test.ts`, `ServicesRenderer.tsx`, `useNarrow.ts`
- Modify: `src/components/visualization/renderers/index.tsx`

**Interfaces:**
- Consumes: `ServicesView` (Task 4).
- Produces:

```ts
export const NODE_WIDTH = 132; export const HEADER = 30; export const INSTANCE_HEIGHT = 26;
export const INSTANCE_GAP = 6; export const PAD = 8; export const COLUMN_GAP = 64; export const ROW_GAP = 20;
export const NARROW_WIDTH = 343;
export interface PlacedBox { id: string; x: number; y: number; width: number; height: number;
                             instances: { id: string; x: number; y: number; width: number; height: number }[] }
export function layoutServices(view: ServicesView, orientation: 'columns' | 'rows'):
  { boxes: PlacedBox[]; width: number; height: number };
/** Where a link leaves or enters a box: right/left edge centres in columns, bottom/top in rows. */
export function anchor(box: PlacedBox, end: 'from' | 'to', orientation: 'columns' | 'rows'): { x: number; y: number };
export function useNarrow(): boolean; // matchMedia('(max-width: 639px)') through useSyncExternalStore
```

**Layout rules:**
- **Columns**: one column per `column` value, left to right, `COLUMN_GAP` apart. Nodes in a column are stacked `ROW_GAP` apart and centred vertically against the tallest column.
- **Box height**: `HEADER + PAD` for a node without instances; `HEADER + n·INSTANCE_HEIGHT + (n−1)·INSTANCE_GAP + PAD` with n instances.
- **Rows**: each column becomes a row, top to bottom. A row's nodes sit side by side and shrink to `min(NODE_WIDTH, (NARROW_WIDTH − (k−1)·ROW_GAP) / k)`, so the total width ≤ `NARROW_WIDTH`.

**Renderer:**
- An SVG of the layout: boxes with a `roleBoxStyle`-equivalent fill, border and cue (`roleFill`, `roleBorder`, `ROLE_META[role].mark`), and instances as rounded rows inside their service box.
- Links are lines with their role colour (frontier dashed).
- Messages are `motion.g` pills at `anchor(from) + progress·(anchor(to) − anchor(from))`, keyed by message id, using `spring` from `spring.ts`.
- Badges are small text above the box or at an instance's right edge.
- Below the SVG: a request table (id, request, status, path taken, time, reason) styled like `SessionsRenderer`'s table, then the log in muted mono text.
- An `aria-label` on the SVG summarises the step: "<n> requests, <m> messages in flight".

- [ ] **Step 1: Write failing tests** (`servicesLayout.test.ts`):

```ts
it('places columns left to right without overlap', …);   // every pair of boxes is disjoint; x grows with column
it('sizes a service box by its instances', …);            // 3 instances → HEADER + 3·26 + 2·6 + PAD
it('stacks columns as rows in the narrow layout', …);     // y grows with column
it('fits four nodes in one row inside 343 px', () => {
  expect(layoutServices(fourBranches, 'rows').width).toBeLessThanOrEqual(NARROW_WIDTH);
});
it('anchors links on the facing edges', …);
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/components/visualization/renderers/servicesLayout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the layout, the hook and the renderer; replace the temporary `case 'services'` with `<ServicesRenderer view={view} />`.

- [ ] **Step 4: Run the checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. (The browser check happens in Task 6, once a lesson exists.)

- [ ] **Step 5: Commit**

```bash
git add src/components/visualization
git commit -m "Services renderer with column and phone layouts"
```

---

### Tasks 6–12: the seven lessons

Every lesson task has the same shape. Task 6 also adds the contract test.

**Files per lesson** (`<id>`; `<camel>` is its camelCase name):
- Create: `src/microservices/scenarios/<id>.ts`, `src/microservices/scenarios/<id>.test.ts`, `src/lessons/microservices/<id>.ts`
- Modify: `src/lessons/meta/microservices.ts` (append), `src/lessons/lessons.test.ts` (append the id to `EXPECTED_IDS`, raise `lessonsIn('microservices')` by one)

**Interfaces per lesson:**
- Consumes: `simulate`, `traceSteps`, `emptyServicesView`, `refusal`, `readInt`, `readChoice`, `lineOf`.
- Produces: `<camel>Code: string`, `<camel>Scenario(values: Record<string, string>): Read<Scenario>`, `<camel>Steps(values: Record<string, string>): Step[]`. `Steps` returns `refusal(title, why, emptyServicesView())` when `Scenario` fails, otherwise `traceSteps(scenario, simulate(scenario), { code, lines, explain })`.

**Steps per lesson:**

- [ ] **Step 1: Write the teaching-moment tests** in `scenarios/<id>.test.ts`, running each preset through `<camel>Scenario` + `simulate` (assertions listed per task below), plus one `refusal` case.
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/microservices/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write the scenario module**, with the topology, fields and numbers below and pseudocode (10–20 lines) containing the listed snippets for `lines`.
- [ ] **Step 4: Write the lesson content and metadata.**
  - Content: `overview`, ≥2 `concept`, ≥4 `howItWorks`, a `form` visualization (fields and presets below, first preset = the default), `code`, `prosCons`, ≥3 `applications`, ≥3 `commonMistakes`, a quiz of 4–5 questions (≥3 types, one `predict-next` with `view` taken from a preset's steps), and ≥3 `summary` lines.
  - Metadata: id, title from the curriculum, `category: 'microservices'`, difficulty `beginner`, group `Foundations`, description, keywords, `prerequisites` = the previous lesson (none for the first).
- [ ] **Step 5: Run the checks.** Run `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 6: Check it in the browser.**
  - Run `npm run dev` and open `/microservices/<id>`.
  - Play every preset: the steps read correctly, messages move along their links, and the request table matches the run.
  - Repeat at 375 px (no sideways scroll) and in dark mode.
- [ ] **Step 7: Commit:** `git commit -m "Microservices lesson: <Title>"`.

Shared numbers unless a task says otherwise: every link 5 ms, every instance 10 ms, gateway, registry and balancer `processMs` 2, db `processMs` 3.

### Task 6: Monolith vs Microservices (+ contract test)

- **Fields**:
  - `architecture` (choice `monolith`/`microservices`, sample `monolith`);
  - `bug` (choice `off`/`on`, "Reviews bug", sample `off`);
  - `requests` (number 1–8, sample 4).
- **Workload**: requests alternate `GET /products`, `GET /reviews`, …, every 50 ms from t = 0 (so each finishes before the next starts).
- **Monolith**: `client`(0) → `app`(1, instance `app-1`, calls `db`) → `db`(2).
- **Microservices**: `client`(0) → `gateway`(1, routes `/products`→`products`, `/reviews`→`reviews`) → `products`(2) / `reviews`(2), each calling its own db `products-db` / `reviews-db`(3).
- **Bug on**: `crash-on` (`app` or `reviews`) with prefix `/reviews`.
- **Presets**: "Monolith" `{monolith, off, 4}`, "Microservices" `{microservices, off, 4}`, "Monolith with a reviews bug" `{monolith, on, 4}`, "Microservices with a reviews bug" `{microservices, on, 4}`.
- **Tests**:
  - `GET /products` takes longer split than in the monolith (more hops);
  - monolith + bug: #1 succeeds, #2 fails with "app-1 crashed", and #3 and #4 fail with "app-1 refused the connection";
  - split + bug: every `/reviews` fails, every `/products` succeeds;
  - `requests: '0'` is refused.
- **Snippets**: `handle`: `function handle(req)`, `route`: `route(req.path)`, `fail`: `crash`, `done`: `return reply`.

**Contract test** `src/microservices/contract.test.ts`, over `allLessons` with `category === 'microservices'` (written now, it then covers every later lesson automatically). For each lesson, seeds 1–3, 20 runs each. Values: for each field, pick from the sample, its options (choice) or `int(r, -5, 300)`, plus one garbage value from `['', 'abc', '-3', '1e9']`.

```ts
const steps = config.generate(deepFreeze(values));
expect(steps.length).toBeGreaterThanOrEqual(1);
expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
for (const step of steps) { /* codeLine within lesson.code; every message/link endpoint is a node id in the view */ }
const last = steps.at(-1)!.view as ServicesView;
expect(last.requests.every((r) => r.status !== 'pending')).toBe(true);
expect(config.generate(values)).toEqual(steps);   // same values, same steps
```

### Task 7: Service Boundaries

- **Fields**: `split` (choice `by-layer`/`by-capability`, sample `by-layer`); `requests` (number 1–6, sample 3).
- **Workload**: `POST /checkout` every 30 ms.
- **By layer**: `client` → `gateway` → `ui`(2) → `logic`(3, calls `data` three times: read cart, read stock, write order) → `data`(4) → `db`(5). `ui` calls `logic` once.
- **By capability**: `client` → `gateway` → `orders`(2, calls `inventory` once, then `orders-db`) / `inventory`(3, calls `inventory-db`).
- **`variables`**: `cross-service calls` for the current request.
- **Presets**: "Split by layer" `{by-layer, 3}`, "Split by capability" `{by-capability, 3}`.
- **Tests**:
  - `crossServiceCalls` per request: 4 by layer, 1 by capability;
  - every request succeeds in both.
- **Snippets**: `handle`: `function checkout(`, `send`: `call(`, `done`: `return`.

### Task 8: Synchronous Calls

- **Fields**:
  - `depth` (number 1–4, sample 3);
  - `hop` (number 1–50 ms, sample 10);
  - `slow` (choice `none`/`last`, sample `none`);
  - `style` (choice `sequential`/`parallel`, sample `sequential`).
- **Timing**: instances take 5 ms; `slow: last` makes the last service 200 ms; links use `hop`.
- **Sequential**: `client` → `s1` → … → `s<depth>`.
- **Parallel**: `client` → `s1`, and `s1` calls `b1`…`b<depth>` in parallel (columns 0, 1, 2).
- **Workload**: one request at t = 0.
- **Presets**: "Chain of 3" `{3, 10, none, sequential}`, "One slow service" `{3, 10, last, sequential}`, "Parallel fan-out" `{3, 10, last, parallel}`.
- **Tests**:
  - chain of 3: `ms === 2·10·3 + 5·3` (75);
  - one slow service: 60 + 5 + 5 + 200 (270);
  - parallel fan-out: `10 + 5 + (10 + 200 + 10) + 10` (245), less than the 295 ms of the same branches called one after another;
  - `hop: '0'` is refused.
- **Snippets**: `handle`: `function handle(`, `send`: `await call(`, `arrive`: `Promise.all`, `done`: `return`.

### Task 9: API Gateway

- **Fields**:
  - `path` (choice `/orders/42`, `/users/7`, `/payments/1`, sample `/orders/42`);
  - `token` (choice `yes`/`no`, sample `yes`);
  - `auth` (choice `required`/`off`, sample `required`).
- **Topology**: `client` → `gateway`(routes `/orders`→`orders`, `/users`→`users`) → `orders`, `users`(2).
- **Workload**: one request at t = 0.
- **Presets**: "Route by path" `{/orders/42, yes, required}`, "No token" `{/orders/42, no, required}`, "Unknown path" `{/payments/1, yes, required}`.
- **Tests**:
  - route → ok with hops `client → gateway → orders-1`;
  - no token → failed `401: no token`, and no hop is a service instance;
  - unknown path → failed `404: no route for /payments/1`, no backend hop;
  - auth off + no token → ok.
- **Snippets**: `route`: `const target = routes.match(`, `reject`: `return 401`, `fail`: `return 404`, `handle`: `if (!req.token)`.

### Task 10: Service Discovery

- **Fields**:
  - `instances` (number 1–4, sample 3);
  - `heartbeat` (number 10–100 ms, sample 20);
  - `ttl` (number 20–300 ms, sample 60);
  - `dies` (number 0–400 ms, `0` = never, sample 0; it kills `orders-<instances>`, the last instance).
- **Topology**: `client`(0, discovery `{registry, orders}`), `registry`(1), `orders`(2) → `orders-db`(3).
- **Workload**: 10 `GET /orders` every 15 ms from t = 10.
- **Presets**: "Register and look up" `{3, 20, 60, 0}`, "Instance dies" `{3, 20, 60, 50}`, "Short TTL" `{3, 20, 25, 50}`.
- **Tests**:
  - register-and-look-up: all 10 ok, spread over 3 instances;
  - instance dies: ≥1 request fails with `orders-3 refused the connection` sent at or after 50 and before the evict event; no request sent after the evict event fails;
  - short TTL fails fewer requests than the 60 ms TTL;
  - `ttl` < `heartbeat` (e.g. `{3, 50, 20, 0}`) is refused with a reason that names both.
- **Snippets**: `register`: `function register(`, `heartbeat`: `function onHeartbeat(`, `evict`: `function evictExpired(`, `lookup`: `function lookup(`.

### Task 11: Load Balancing

- **Fields**:
  - `strategy` (choice `round-robin`/`least-connections`/`random`, sample `round-robin`);
  - `instances` (number 2–4, sample 3);
  - `slow` (choice `none`/`api-1`, sample `none`; `api-1` takes 120 ms instead of 20 ms);
  - `health` (choice `off`/`on`, sample `off`; on = `healthCheckMs` 25);
  - `dead` (choice `none`/`last`, sample `none`; kills `api-<instances>` at 30).
- **Topology**: `client` → `balancer`(1, target `api`) → `api`(2, instances take 20 ms).
- **Workload**: 12 `GET /items` every 10 ms from t = 0.
- **Presets**: "Round robin" `{round-robin, 3, none, off, none}`, "Slow instance, round robin" `{round-robin, 3, api-1, off, none}`, "Slow instance, least connections" `{least-connections, 3, api-1, off, none}`, "Health checks skip a dead instance" `{round-robin, 3, none, on, last}`.
- **Tests**:
  - round robin: 4 requests per instance;
  - least connections sends fewer requests to `api-1` than round robin, with `slow: api-1`;
  - health on + dead: no request is picked for `api-3` after its `mark` event;
  - health off + dead: every request picked for `api-3` after 30 fails (#6, #9, #12);
  - `random` with the same values gives the same picks twice.
- **Snippets**: `pick`: `function pick(`, `mark`: `function onProbe(`, `handle`: `function handle(`, `done`: `return reply`.

### Task 12: Database per Service

- **Fields**: `model` (choice `shared`/`per-service`, sample `shared`); `rename` (choice `no`/`yes`, sample `yes`; at t = 30 the users team renames `users.name` → `users.full_name`).
- **Workload**: 4 `GET /orders/1` every 20 ms from t = 0.
- **Shared**:
  - `client` → `gateway` → `orders`(2), with `users`(2) present;
  - `shared-db`(3) has columns `orders.id`, `orders.total`, `users.id`, `users.name`;
  - `orders` queries `shared-db` for `orders.id`, `users.name`;
  - fault `rename-column` with owner `users`.
- **Per service**:
  - `orders` queries `orders-db`(3) for `orders.id`, then calls `users`;
  - `users` queries `users-db`(3) for `users.name`;
  - the rename applies to `users-db` with owner `users`.
- **Presets**: "Shared database" `{shared, yes}`, "Database per service" `{per-service, yes}`.
- **Tests**:
  - shared + rename: requests sent after 30 fail with `no column users.name`, and earlier ones succeed;
  - per-service + rename: all ok;
  - with `rename: no`, per-service takes longer than shared (one more hop).
- **Snippets**: `handle`: `function getOrder(`, `send`: `db.query(`, `fail`: `no column`, `fault`: `ALTER TABLE`.

---

### Task 13: Docs and final verification

**Files:**
- Modify: `README.md` (features list; architecture; a new "How to add a microservices lesson" section after "How to add a SQL lesson"), `CLAUDE.md` (intro sentence; `View` union of 16 kinds including `services`; a `microservices/` bullet saying what this plan built; `microservices/` in the no-React list; the contract test in "Tests that guard the whole codebase"; test count)

- [ ] **Step 1: Write the docs.** The README section walks through: write the scenario module (`fooCode`, `fooScenario`, `fooSteps`) with its preset tests, add content, add metadata, run the contract test.
- [ ] **Step 2: Run everything CI runs**

Run: `npm run lint && npm test && npm run build:pages && npm run check:bundle`
Expected: all pass. First-load JS stays under 600 kB, and no microservices code is in the first-load chunks.
- [ ] **Step 3: Browser pass.** In `npm run dev`:
  - home, catalog, dashboard and search show Microservices (7 live, 16 Coming soon);
  - each lesson's default preset plays;
  - check at 375 px and in dark mode.
- [ ] **Step 4: Commit and open the PR**

```bash
git add README.md CLAUDE.md
git commit -m "Docs: the Microservices track"
git push -u origin microservices-track
gh pr create --title "Microservices track, phase 1: foundations" --body "<summary of the 7 lessons, the engine and the services view; deferred minors; test plan>"
```

  The PR body has no AI attribution. Merge after review; the merge deploys.
