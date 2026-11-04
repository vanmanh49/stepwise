# Design Patterns Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Design Patterns category (23 topics) and make 8 lessons live (Singleton, Factory Method, Abstract Factory, Builder, Prototype, Adapter, Decorator, Facade), each running a naive and a patterned design against one change request.

**Architecture:** New engine folder `src/patterns/` (no React). `trace.ts` runs real classes with their methods wrapped for one run; `diff.ts` measures a change between two raw sources; `steps.ts` turns a trace into `panels` steps (`ladder` + `services`, then `grid`s) and builds a lesson's form fields, presets and code. Each lesson has `src/patterns/<id>/` with four plain design modules and a `scenario.ts`. No new view kind.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8 (`?raw` imports, typed by `vite/client`), Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-11-04-design-patterns-track-phase-1-design.md`

## Global Constraints

- Branch `design-patterns-phase-1` (the spec is committed). No worktrees.
- `src/patterns/` contains no React; all lesson text lives in `src/lessons/design-patterns/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Unusable input gives one step through `refusal(title, why, EMPTY)` from `algorithms/form.ts`.
- Limits: `MAX_CALLS = 200` per traced run; `MAX_STEPS = 200` plus one summary step.
- **Design modules** (`naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`) import nothing, export only classes, contain no tracing code and no comments that would be noise in the code panel, and stay under 80 lines each.
- Copy: plain, short sentences with the actual values. Every lesson's last `concept` paragraph starts with "In real code," and names where the pattern appears.
- Lessons are added in curriculum order: `lessons.test.ts` requires the live lessons to be the first topics.
- Commit messages carry no AI attribution. Prefix: `Design Patterns:`.

## Plan-level rulings (refine the spec)

- A wrong result uses role `discarded` and a right one `found`: `Role` has no `error`.
- The scenario, not the lesson module, picks which typed modules to run: `PatternLesson.run` receives `{ pattern, changed }` and imports its own four modules, so no `Record<string, unknown>` casts.
- `traceRun` also snapshots and restores each class's non-function static properties, so `Logger.instance` from one run never leaks into the next.
- A `return` of `undefined` gets no step and no ladder row (void returns are noise in a sequence diagram).
- A method that exists only in a changed module has no `codeLine`; the change-cost step shows its lines instead.
- A scenario option can be marked as existing only after the change (Push, High contrast, the two encryption orders). Choosing it with Change request None gives one refusal step that says to pick the change.
- Builder's scenario field is **Page** (Profile / Upload / Search) instead of "Settings used". Decorator's order options run only on the Pattern design; on Naive they are refused, because a naive class fixes its order.
- The spec's change-cost numbers are targets. Each lesson task pins the measured values in its test and the lesson text quotes those.

## Review Focus

1. Switching presets back and forth on one page: every run repeats exactly, with no instance, id counter or static field left from the previous run (Singleton is the trap). Test in Tasks 2 and 5.
2. A design method or the scenario throws partway through: the wrappers and statics are restored, and the steps end with a result step naming the error, not a crash. Test in Task 2.
3. Re-entrant and nested calls, such as two decorators of the same class wrapped around each other: distinct ids, correct depth, returns matched to their calls. Test in Task 2.
4. A method name in both the naive and the pattern section (`log`, `send`, `write`): `codeLine` lands in the section of the design that ran. Test in Task 4.
5. A scenario option that only exists after the change, picked with Change request None: one refusal step. Test in Task 4.

---

### Task 1: Category wiring and header

**Files:**
- Modify: `src/types/lesson.ts`, `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/lessonList.ts`, `src/lessons/registry.ts:87`, `src/lessons/all.testutil.ts:9`, `src/lessons/split.test.ts:7,26`, `src/lessons/lessons.test.ts`, `src/components/navigation/SearchPalette.tsx:8`, `src/pages/LessonPage.tsx`, `src/pages/Home.tsx:102`, `index.html:6`, `scripts/static-pages.test.ts:42`, `src/components/layout/Header.tsx` (only if it overflows)
- Create: `src/lessons/meta/design-patterns.ts`

**Interfaces:**
- Produces: `designPatternsMeta: LessonMeta[]` (empty for now), category `'design-patterns'`.

- [ ] **Step 1: Add a test `lists the Design Patterns course in order` to `lessons.test.ts`**, modelled on the Networking one: the 23 ids from the spec's curriculum table in order, groups `Creational` × 5, `Structural` × 7, `Behavioral` × 11. Add the `lessonsIn` prefix check for `'design-patterns'` beside line 216, and add `'design-patterns'` to the categories exempt from `complexity` at line 248.
- [ ] **Step 2: Run** `npx vitest run src/lessons/lessons.test.ts`. Expected: FAIL.
- [ ] **Step 3: Wire it.** `Category` gains `'design-patterns'` after `'networking'`. `CATEGORY_TITLE`: `Design Patterns`. `CATEGORY_INTRO`: `'Classic ways to shape code so that change stays cheap. Each lesson runs a real design on your change request, naive and patterned, and measures what the change costs.'`. Three `topics('design-patterns', …)` blocks in `curriculum.ts`. The meta file is spread last in `lessonList.ts`. Globs gain `design-patterns`; `split.test.ts` expects `design-patterns.ts`. `CATEGORY_ICON`: `'design-patterns': Puzzle` (lucide). `CODE_COPY['design-patterns']`: `{ title: 'Code', intro: 'The real TypeScript of both designs, the naive one first. In the visualization above, the highlighted line follows the method that is running.' }`. Home and `index.html`: "…AI, security, networking and design patterns run one step at a time…". `static-pages.test.ts`: `201 + 9 + 1`.
- [ ] **Step 4: Run** `npx vitest run src/lessons scripts && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Check in a browser** that `document.documentElement.scrollWidth <= innerWidth` at 1280 and 1536 px with 9 category links. If 1280 overflows, give the links `px-2 2xl:px-3` and the gap `gap-0.5 2xl:gap-1`, then re-check.
- [ ] **Step 6: Commit** `Design Patterns: add the category and its 23 topics`.

### Task 2: Tracer

**Files:**
- Create: `src/patterns/trace.ts`
- Test: `src/patterns/trace.test.ts` (test classes defined inside the test file)

**Interfaces:**
- Produces:

```ts
export const MAX_CALLS = 200;
export type Origin = { kind: 'harness' } | { kind: 'made'; by: number } | { kind: 'seen' };
export interface TracedObject { id: string; className: string; origin: Origin; /** Index into `events` where it first appears. */ firstEvent: number }
export interface TracedCall {
  index: number;
  /** An object id, or 'client' at the top. */
  caller: string;
  /** An object id, or the class name for a static method. */
  callee: string;
  className: string;
  method: string;
  args: string;
  depth: number;
  returned?: string;
  threw?: string;
}
export type TraceEvent = { kind: 'call'; call: number } | { kind: 'return'; call: number };
export interface Trace<R> {
  objects: TracedObject[];
  calls: TracedCall[];
  events: TraceEvent[];
  /** Public object-valued fields (and arrays of them) of traced objects, read after the run. */
  references: { from: string; field: string; to: string }[];
  capped: boolean;
  error?: string;
  result?: R;
}
export interface TraceApi { register(obj: object): string; idOf(obj: unknown): string | undefined }
export function traceRun<R>(classes: readonly unknown[], drive: (t: TraceApi) => R): Trace<R>;
export function show(value: unknown, idOf: (v: unknown) => string | undefined): string;
/** Marks every wrapper, so tests can prove none is left behind. */
export const TRACED: unique symbol;
```

- [ ] **Step 1: Write the tests.**

```ts
// class Box { item?: Item; put(i: Item) { this.item = i; return this.item.label() } }
// class Item { label() { return 'cup' } }  class Maker { static make() { return new Item() } }
const trace = traceRun([Box, Item, Maker], (t) => { const box = new Box(); t.register(box); return box.put(Maker.make()); });
expect(trace.result).toBe('cup');
expect(trace.calls.map((c) => [c.caller, c.callee, c.method, c.depth])).toEqual([
  ['client', 'Maker', 'make', 0], ['client', 'Box#1', 'put', 0], ['Box#1', 'Item#1', 'label', 1]]);
expect(trace.objects.find((o) => o.id === 'Item#1')!.origin).toEqual({ kind: 'made', by: 0 });
expect(trace.calls[1]!.args).toBe('Item#1');
expect(trace.calls[2]!.returned).toBe('"cup"');
expect(trace.references).toEqual([{ from: 'Box#1', field: 'item', to: 'Item#1' }]);
expect(Box.prototype.put).toBe(originalPut);           // restored
// throwing run: { error: 'boom', calls up to the throw }, wrappers restored
// static field `static count = 0` incremented inside the run is 0 again afterwards
// a loop of 500 calls: capped true, calls.length === MAX_CALLS, wrappers restored
// nested: Wrap(Wrap(Item)) → ids Wrap#1, Wrap#2, depths 0,1,2, each return matched to its call
// two runs in a row give deep-equal traces (ids restart at #1)
expect(show('a'.repeat(40), () => undefined)).toHaveLength(24);   // ends with '…'
expect(show([1, 2, 3], () => undefined)).toBe('[3 items]');
```

- [ ] **Step 2: Run** `npx vitest run src/patterns/trace.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `traceRun` in `src/patterns/trace.ts`.** For each class, save the own property descriptors of its prototype and of the class itself; replace each own function (not `constructor`) and each getter with a wrapper that pushes the callee on a stack, records the call event, calls the original, records the return or throw, and pops. Ids are `ClassName#n` with per-class counters local to the run, held in a `WeakMap`. An unseen object returned by a call gets `{ kind: 'made', by }`; an unseen `this` gets `{ kind: 'seen' }`. Passing `MAX_CALLS` throws a private sentinel that `traceRun` catches as `capped: true`. A `finally` restores every descriptor and every non-function static value. `show`: strings JSON-quoted, numbers and booleans as text, traced objects by id, arrays `[n items]`, other objects `{…}`, functions `fn`, `undefined` as `''`; cut to 24 characters with `…`.
- [ ] **Step 4: Run** `npx vitest run src/patterns/trace.test.ts && npm run lint`. Expected: PASS. (A deliberate lint exception needs `// oxlint-disable-next-line <rule> -- <reason>`.)
- [ ] **Step 5: Commit** `Design Patterns: add the call tracer`.

### Task 3: Change cost

**Files:**
- Create: `src/patterns/diff.ts`
- Test: `src/patterns/diff.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ChangedLine { sign: '+' | '-'; text: string; className: string /* '(module)' outside classes */ }
export interface ChangeCost {
  classesAdded: string[]; classesRemoved: string[]; classesEdited: string[];
  linesAdded: number; linesRemoved: number;
  branchesBefore: number; branchesAfter: number;
  lines: ChangedLine[];
}
export function changeCost(before: string, after: string): ChangeCost;
export function countBranches(source: string): number;
```

- [ ] **Step 1: Write the tests.** Hand-worked: identical sources → all zero and empty; a new class appended → `classesAdded: ['B']`, `classesEdited: []`, `linesAdded` = its non-blank lines; one line changed inside `A` → `classesEdited: ['A']`, `linesAdded: 1`, `linesRemoved: 1`, `lines` = `[{ sign: '-', … }, { sign: '+', … }]` with `className: 'A'`; a class deleted → `classesRemoved`; a change only in blank lines or `//` comments → all zero; `countBranches('if (a) {\n} \ncase 1:\nx = a ? b : c\ny?: string')` → 3; the same inputs twice give deep-equal results.
- [ ] **Step 2: Run** `npx vitest run src/patterns/diff.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Normalise: trim line ends, drop blank lines and lines whose trimmed text starts with `//`. A class block starts at `^(export )?(abstract )?class (\w+)` and ends at the next line that is exactly `}`. O(n·m) LCS over the normalised lines; a `+` line belongs to its class in `after`, a `-` line to its class in `before`. Edited = in both and has a changed line. Branch lines contain `if (`, `case ` or ` ? `.
- [ ] **Step 4: Run** `npx vitest run src/patterns/diff.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `Design Patterns: measure what a change costs`.

### Task 4: Steps and the lesson helpers

**Files:**
- Create: `src/patterns/steps.ts`
- Test: `src/patterns/steps.test.ts` (with a tiny `PatternLesson` built from test modules in `src/patterns/__fixtures__/`, four design files + raw imports)

**Interfaces:**
- Consumes: `traceRun`, `show`, `TraceApi` (Task 2); `changeCost` (Task 3); `refusal` from `algorithms/form.ts`.
- Produces:

```ts
export const MAX_STEPS = 200;
export const EMPTY: ArrayView;
export const DESIGNS = ['Naive', 'Pattern'] as const;
export interface Design { source: string; classes: readonly unknown[] }
export interface Outcome { ok: boolean; title: string; why: string; facts: [label: string, value: string][] }
export interface PatternLesson {
  designs: { naive: Design; pattern: Design; naiveChanged: Design; patternChanged: Design };
  /** The change request's option text, e.g. 'Add Push'. */
  change: string;
  scenario: { name: string; label: string; options: string[]; help?: string; afterChangeOnly?: string[]; patternOnly?: string[] };
  run(choice: { pattern: boolean; changed: boolean }, scenario: string, t: TraceApi): Outcome;
  /** 'Class.method' → the step's why text. */
  notes?: Record<string, string>;
}
export function patternCode(lesson: PatternLesson): string;      // '// Naive\n' + naive + '\n// With the pattern\n' + pattern
export function patternFields(lesson: PatternLesson): FormField[]; // design, change, then scenario.name
export function patternPresets(lesson: PatternLesson): { label: string; values: Record<string, string> }[]; // Naive, Pattern, Naive + change, Pattern + change
export function patternSteps(lesson: PatternLesson, values: Record<string, string>): Step[];
```

- [ ] **Step 1: Write the tests** against the fixture lesson:
  - Pattern + None: one step per call and per non-`undefined` return, then one result step; each call step's view is `panels` with labels `Sequence` (a `ladder` whose columns start with `client`, newest row `active`) and `Objects` (a `services` view, `client` node type `client`, objects type `service`, acting node `active`, links from `references` of objects seen so far).
  - The result step has `variables.result` `'right'` or `'wrong'` and its fact cells use role `found` or `discarded`.
  - With the change: two more steps. First a `grid` with `colLabels: ['Naive', 'Pattern']` and rows `Classes added`, `Classes edited`, `Lines +`, `Lines −`, `Branches`, where the cheaper cell in each row is `found`. Then a `grid` of the chosen design's changed lines (row label `+` or `−`, one cell `ClassName: text`), at most 12 rows plus `… n more`.
  - A method named `send` in both sections: a Naive run's `codeLine` is inside the naive section, a Pattern run's inside the pattern section, and the line contains `send(`.
  - A method only in the changed module: `codeLine` undefined.
  - Garbage design, change or scenario value, or an `afterChangeOnly` option with None, or a `patternOnly` option on Naive: exactly one step.
  - A run that throws: the last step is a result step with `ok: false` naming the error. A capped run ends with a step saying the run was cut at 200 calls.
  - Same values twice → deep-equal steps.
- [ ] **Step 2: Run** `npx vitest run src/patterns/steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Section lookup: find the line index of `// With the pattern`; within the chosen section, find `class <ClassName>` and then the first later line matching `\b<method>\(` before that class's closing `}`. Call step title `` `${caller} calls ${callee}.${method}(${args})` ``; return step `` `${callee} returns ${returned}` ``; why from `notes['Class.method']`, else `` `${caller} needs ${callee} to ${method}.` ``. Service columns: client 0, a harness object 1, any other object 1 + the column of whoever made or first called it, capped at 5. Cut steps at `MAX_STEPS`, then add one summary step.
- [ ] **Step 4: Run** `npx vitest run src/patterns && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Design Patterns: turn traces into steps`.

### Tasks 5–12: the eight lessons

Each lesson task has the same file set and the same step shape; only the designs and the pinned facts differ.

**Files (per lesson `<id>`):**
- Create: `src/patterns/<id>/naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`, `scenario.ts` (exports `<camelId>Lesson: PatternLesson`), `src/patterns/<id>/scenario.test.ts`, `src/lessons/design-patterns/<id>.ts`
- Modify: `src/lessons/meta/design-patterns.ts` (append, no `complexity`), `scripts/static-pages.test.ts:42` (lesson count + 1)

**Interfaces:** Consumes `PatternLesson`, `patternCode`, `patternFields`, `patternPresets`, `patternSteps` (Task 4). The lesson file's visualization is `{ kind: 'form', fields: patternFields(lesson), presets: patternPresets(lesson), generate: (v) => patternSteps(lesson, v) }`, and its `code` is `patternCode(lesson)`.

**Steps (per lesson):**
- [ ] **1. Write `scenario.test.ts`** with the behaviour assertions listed for the lesson, run through `traceRun` and `lesson.run`, plus `changeCost` assertions on the four raw sources, then pin the measured line counts. Add one engine-to-view assertion per thing the lesson text tells the learner to look at (a ladder row, a `discarded` fact cell, a change-cost cell), found in the views `patternSteps` returns.
- [ ] **2. Run** `npx vitest run src/patterns/<id>`. Expected: FAIL.
- [ ] **3. Write the four design modules and `scenario.ts`.** `scenario.ts` imports each module twice, `import * as naive from './naive'` and `import naiveSource from './naive.ts?raw'`, and builds `Design`s as `{ source, classes: Object.values(module) }`.
- [ ] **4. Run** `npx vitest run src/patterns/<id>`. Expected: PASS.
- [ ] **5. Write the lesson content and metadata.** Overview, concept (the last paragraph starts "In real code,"), howItWorks, prosCons (with avoidWhen), applications, commonMistakes, at least 3 quiz questions with at least one `predict-next` whose `view` comes from a real step of `patternSteps`, and summary. Quote only pinned numbers.
- [ ] **6. Run** `npx vitest run src/lessons src/patterns scripts src/components/visualization/renderers && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **7. Commit** `Design Patterns: add the <Title> lesson`.

### Task 5: Singleton (`singleton`) + contract test

- Design: `Logger` (`level`, `lines`, `setLevel`, `log(level, text)`) and modules `BillingModule`, `CartModule`, `SearchModule`, each logging twice. Naive: each module does `new Logger()`. Pattern: `static getInstance()`. Change "Set level to debug at runtime" adds `DebugSwitch`; naive must reach every module's logger, pattern calls `Logger.getInstance().setLevel('debug')`. Scenario `modules`: `2 modules` / `3 modules`.
- Assertions: naive with 3 modules → 3 `Logger` objects and outcome wrong ("lines split 2 + 2 + 2"); pattern → 1 `Logger`, its `origin.kind === 'made'` by `getInstance`, 6 lines; with the change, naive debug reaches only the loggers it was wired to, so pin which; `changeCost` naive edits the modules (pin count), pattern adds 1 class and edits 0. Running pattern twice in a row gives deep-equal steps (Review Focus 1).
- Also create **`src/patterns/contract.test.ts`**: every `design-patterns` lesson from `allLessons`, every preset, 30 seeded random field picks per lesson (`rng`, `pick` from `random.testutil`) and the garbage values `['', 'abc', '-3']`. Check: 1 ≤ steps ≤ `MAX_STEPS + 1`; every `codeLine` is within the code; runs repeat exactly; every grid's cell ids are unique; a garbage value in any field gives one step; each lesson's last `concept` paragraph starts with "In real code,". Through `import.meta.glob('./*/scenario.ts', { eager: true })`, check that each `Design.source` contains `class <Name>` for every class in its `classes` (the source shown is the source run), and check that no class in any `Design` still has a wrapped method after all runs (the tracer marks wrappers with a symbol it exports as `TRACED`).

### Task 6: Factory Method (`factory-method`)

- Design: `EmailMessage`, `SmsMessage` with `send(to, text)`; client flows `SignupFlow`, `ResetFlow`, `ReceiptFlow`. Naive: each flow has `if (channel === 'email') … else …`. Pattern: `Notifier` with `createMessage()` overridden by `EmailNotifier` and `SmsNotifier`; flows take a `Notifier`. Change "Add Push": `PushMessage` (+ `PushNotifier` in the pattern). Scenario `channel`: `Email` / `SMS` / `Push` (`afterChangeOnly: ['Push']`).
- Assertions: every run sends 3 messages of the chosen channel; pattern `EmailMessage#1` is made by `createMessage`; naive change edits 3 flows and adds 1 class; pattern change adds 2 and edits 0; naive branch count goes up by 3 (pin), pattern's stays the same.

### Task 7: Abstract Factory (`abstract-factory`)

- Prerequisite: `factory-method`.
- Design: `LightButton`, `DarkButton`, `LightDialog`, `DarkDialog` with `render()` returning their theme; screens `SettingsScreen`, `AboutScreen`. Naive: each screen picks each widget with its own check, and `AboutScreen` checks only for its button, always making a `LightDialog`. Pattern: `LightFactory`, `DarkFactory` with `createButton()`, `createDialog()`; screens take a factory. Change "Add High contrast": 2 widgets (+ `HighContrastFactory`). Scenario `theme`: `Light` / `Dark` / `High contrast` (`afterChangeOnly`).
- Assertions: naive Dark → outcome wrong, About shows Dark button + Light dialog; naive Light → right; pattern every theme → right; naive change adds 2 and edits 2; pattern change adds 3 and edits 0.

### Task 8: Builder (`builder`)

- Design: `Request` (url, method, headers, body, timeoutMs, then `retries` after the change) with `send()` describing itself; pages `ProfilePage`, `UploadPage`, `SearchPage`. Naive: positional constructor calls with `null`s. Pattern: `RequestBuilder` (`method`, `header`, `body`, `timeout`, `build`). Change "Add retries": `retries` added; Upload asks for 3 retries, Search for 2. In `naive-changed`, `SearchPage` passes `(…, 2, 5000)` in swapped order (timeout and retries are both numbers, so TypeScript can't catch it). Scenario `page`: `Profile` / `Upload` / `Search`.
- Assertions: naive changed Search → outcome wrong, timeout 2 ms and 5000 retries; pattern changed Search → timeout 5000, retries 2, right. Pin both designs' change costs honestly (both edit about 2 classes); the lesson says Builder buys readability and argument safety here, not fewer edits.

### Task 9: Prototype (`prototype`)

- Design: `Enemy` (name, hp, speed, `loot: string[]`, and `shield` after the change); `Spawner.spawnLike(template, deep)`; a spawned enemy then picks up `'gem'`. Naive: the spawner copies field by field. Pattern: `Enemy.clone(deep)`, spawner calls it. Scenario `copy`: `Shallow` / `Deep`.
- Assertions: naive changed → copy has no shield (outcome wrong), and the diff shows only `Enemy` edited, which is the lesson's point; pattern changed → shield copied, right, `Enemy` edited; Shallow on either design → the template's loot also holds `'gem'` (wrong); Deep → it doesn't.

### Task 10: Adapter (`adapter`)

- Design: `OldGateway.pay(amount)`, vendor `NewProvider.charge(cents, currency)` (present unchanged in all four modules), `Checkout`, composition root `App`. Naive: `Checkout` creates and calls its gateway itself; changed rewrites it for `NewProvider`. Pattern: `Checkout` takes a gateway with `pay(amount)`; changed adds `ProviderAdapter` and edits one line of `App`. Scenario `amount`: `19.99` / `0.10` / `5`.
- Assertions: changed runs charge `1999`, `10`, `500` cents in `USD` (`Math.round`); the ladder has a `ProviderAdapter#1 calls NewProvider#1.charge(1999, "USD")` row; naive change edits `Checkout` (pin lines); pattern adds 1 class and edits `App` by 1 line.

### Task 11: Decorator (`decorator`)

- Prerequisite: `adapter`.
- Design: data `'aaaaaaaabbbbbbbbcccccccc'`; `FileSink.write(data)` stores and returns the byte size; run-length compression (`a8b8c8`); XOR "encryption" with key `k3y`, as hex. Naive: `LoggingSink`, `CompressingSink`, `LoggingCompressingSink` subclasses (4 classes); changed adds the 4 encrypting combinations (8). Pattern: `LoggingSink(inner)`, `CompressingSink(inner)`; changed adds `EncryptingSink(inner)`. Scenario `layers`: `Logging` / `Compression` / `Logging + Compression` / `Compress, then encrypt` / `Encrypt, then compress` (the last two `afterChangeOnly` and `patternOnly`).
- Assertions: compress then encrypt and encrypt then compress give different stored sizes, both pinned from real runs; naive class count 4 → 8 (`classesAdded` length 4); pattern adds 1, edits 0; with two layers the ladder depth reaches 2.
- `concept` and `commonMistakes` say plainly that the XOR step is not real encryption.

### Task 12: Facade (`facade-pattern`)

- Design: `Inventory.reserve(sku)`, `Payment.charge(amount)` (renamed `capture(amount, currency)` after the change), `Shipping.book(address)`; clients `WebShop`, `MobileApp`, `PhoneOrders`. Naive: each client calls all three in order. Pattern: `OrderFacade.place(order)`; clients call it. Scenario `clients`: `2 clients` / `3 clients`.
- Assertions: every run places one order per client with all 3 subsystem calls in order; naive change edits `Payment` + 3 clients (4); pattern edits `Payment` + `OrderFacade` (2); with 3 clients the pattern ladder shows 3 `place` calls from clients and 9 subsystem calls from `OrderFacade#1`.

### Task 13: Docs and final checks

**Files:**
- Modify: `CLAUDE.md` (intro track list, a **Design Patterns** architecture entry, a `src/patterns/contract.test.ts` line under the guarding tests), `README.md` (line 3 track list, the folder list near line 92, a "How to add a Design Patterns lesson" section next to the Networking one)

- [ ] **Step 1: Write the docs.** The CLAUDE.md entry covers `traceRun` (wraps prototypes and statics for one run, restores them, `MAX_CALLS = 200`, made-by rule), `changeCost`, `patternSteps` and the helpers, and the design-module rules from Global Constraints.
- [ ] **Step 2: Run** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass; first load under 600 kB (note the number).
- [ ] **Step 3: Check in a browser** Decorator and Facade at 375 px and at 1280 px, in light and dark: the Sequence and Objects panels and the change-cost grid fit without page-level horizontal scroll, the header does not overflow, and the code panel highlights the right section. Take screenshots.
- [ ] **Step 4: Commit** `Design Patterns: document the track`.
