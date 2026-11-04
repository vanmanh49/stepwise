# Design Patterns track, phase 1: creational patterns and first structural ones

Date: 2026-11-04
Status: approved design, awaiting spec review

## Goal

Add a ninth category, **Design Patterns**, that teaches the 23 Gang of Four patterns by showing the problem each one solves. Phase 1 builds a small engine that runs real TypeScript designs and traces them. It makes 8 topics live: the 5 Creational patterns plus Adapter, Decorator and Facade. The other 15 topics show as Coming soon.

A learner who finishes phase 1 can look at a design, name the change that would hurt it, and say which pattern makes that change cheap, how much cheaper, and what the pattern costs in return.

## Decisions

- **The 23 GoF patterns** (the user's choice), grouped in the sidebar as Creational, Structural and Behavioral.
- **Three phases of 8 / 7 / 8** (the user's choice), keeping the GoF groups. Phase 1: Creational (5) + Adapter, Decorator, Facade. Phase 2: Bridge, Composite, Proxy, Flyweight + Strategy, Observer, Command. Phase 3: the other 8 Behavioral patterns. Each phase has its own spec, plan and PR.
- **Before vs after** (the user's choice). Each lesson starts from a concrete problem and a change request. The learner runs the change on a naive design and on the patterned design and sees the difference, measured, not claimed.
- **Real TypeScript plus a call tracer** (approach A, the user's choice). The designs are real classes that really run; the tracer records what they do; the code panel shows their real source through Vite `?raw` imports.
- **No new view kind.** Steps use `ladder`, `services` and `grid` through `panels`.
- **The existing `form` input** drives every lesson, as in the other tracks.
- **Ids `facade`, `proxy` and `state` are taken** by other tracks, so those topics are `facade-pattern`, `proxy-pattern` and `state-pattern`. Every other id is the plain pattern name (checked against `curriculum.ts` and `meta/`).
- One spec, one plan, one PR on branch `design-patterns-phase-1`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

All 23 topics go into `curriculum.ts` under category `design-patterns` (title "Design Patterns"), one group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | Creational | `singleton`: Singleton · `factory-method`: Factory Method · `abstract-factory`: Abstract Factory · `builder`: Builder · `prototype`: Prototype |
| intermediate | Structural | `adapter`: Adapter · `decorator`: Decorator · `facade-pattern`: Facade · `bridge`: Bridge · `composite`: Composite · `proxy-pattern`: Proxy · `flyweight`: Flyweight |
| advanced | Behavioral | `strategy`: Strategy · `observer`: Observer · `command`: Command · `chain-of-responsibility`: Chain of Responsibility · `iterator`: Iterator · `mediator`: Mediator · `memento`: Memento · `state-pattern`: State · `template-method`: Template Method · `visitor`: Visitor · `interpreter`: Interpreter |

Structural lists the three phase 1 topics first, so the live lessons sit before the Coming soon ones, as the existing order test (`lessonsIn` is a prefix of `topicsIn`) requires. Behavioral lists Strategy, Observer and Command first for the same reason in phase 2.

## 1. Engine (`src/patterns/`)

No React, the same layering as the other tracks. Entry points never throw. Nothing reads the clock or `Math.random`, so runs repeat exactly.

### Tracer (`trace.ts`)

`traceRun(classes, run)` takes the classes a scenario uses and a function that drives them. For the length of that one call it wraps every prototype method and static method of those classes, then restores the originals in a `finally`, even when the run throws.

It records:

- **Objects**: an id per object (`logger#1`, `CardPayment#2`), its class, and how it appeared: `harness` when the scenario registers it, or `made by <call id>` when it is first seen as the return value of a traced call. That covers factories, `getInstance` and builders without any hook in a constructor.
- **Calls**: caller, callee, method, short argument text, return text, and depth. The caller is the object whose traced method is running, or `client` at the top.
- **References**: object-valued fields of traced objects, read after the run, for the object diagram.

**There is no tracing code in the lesson source.** The modules a learner reads are plain classes.

Static methods and getters are wrapped too; private `#fields` are not read (references use public fields only). The run has a call cap of 200; past it, the trace stops and the steps say so.

### Change cost (`diff.ts`)

`changeCost(before, after)` takes two raw sources and returns:

- classes added, removed and edited, found by splitting each source into top-level `class` blocks;
- lines added and removed, from an LCS line diff, ignoring blank lines and comments;
- branch count before and after: lines containing `if (`, `case ` or ` ? `;
- the changed lines themselves, marked `+` or `−`, for the diff panel.

Sources are short (under about 80 lines), so a plain O(n·m) LCS is enough.

### Steps (`steps.ts`)

`patternSteps(lesson, values)` runs the chosen design and returns `Step[]`:

1. One step per traced call and return. Each shows `panels` with the **sequence diagram** (`ladder`: one column per object, one row per call or return, the current row active) and the **object diagram** (`services`: objects as nodes in columns by depth, references as links, the object acting now active). `codeLine` points at the method's declaration in the lesson's combined `code` (below), found with `lineOf` (`data-structures/shared.ts`) inside the section of the design that ran, so a method with the same name in both designs resolves to the right one.
2. A **result** step: what the run produced, with a wrong result in role `error` (two loggers, a mixed theme, a lost field).
3. When a change request is chosen, a **change cost** step: a `grid` with Naive and Pattern columns (classes added, classes edited, lines + and −, branches), and a second `grid` with the changed lines of the chosen design.

Step titles and `why` text say what happened and why, as in other tracks. The ladder renderer shows the newest 12 rows; older ones fold into `earlier`. Runs stay within `MAX_STEPS = 200` plus one summary step, like the other tracks.

### Lesson modules (`src/patterns/<lesson>/`)

Each lesson has four small real modules: `naive.ts`, `naive-changed.ts`, `pattern.ts` and `pattern-changed.ts`, plus `scenario.ts`, which lists their classes, drives them, and checks the result. The lesson imports each module twice: once to run, and once as `?raw` to show and to diff.

The lesson `code` is the naive and patterned "before" sources together, under `// Naive` and `// With the pattern` headings, so `codeLine` works for both designs. Its code panel label is TypeScript, and `CODE_COPY` gets a `design-patterns` entry saying the highlighted line follows the method that is running.

## 2. Lessons

Every lesson has the same three `form` fields: **Design** (Naive / Pattern), **Change request** (None / the lesson's change) and one lesson-specific scenario field. Presets: Naive, Pattern, Naive + change, Pattern + change; the first loads when the lesson opens.

| Lesson | Problem | Change request | Scenario field | What the learner sees |
|---|---|---|---|---|
| Singleton | An app's `Logger` holds the log level and the lines written so far | Set level to debug at runtime | Modules logging: 2 / 3 | Naive: each module runs `new Logger()`, so the level changes in one place only and the lines are split across instances (wrong result). Pattern: one instance, every module sees the change. |
| Factory Method | A `Notifier` sends Email or SMS | Add Push | Channel | Naive: `if (type === …)` copied in 3 client places, so all 3 are edited. Pattern: a creator subclass per channel, so the change is 1 class added and 0 edited. |
| Abstract Factory | UI widgets (Button and Dialog) in Light and Dark | Add High contrast | Theme | Naive: a client can pair a Dark Button with a Light Dialog (wrong result). Pattern: one factory per theme, so mixing is impossible. Change: 1 factory and 2 widgets added, clients untouched. |
| Builder | An HTTP request with many optional settings | Add retries | Settings used | Naive: a telescoping constructor, `new Request(url, 'GET', null, null, true, 3000)`, so every call site is edited. Pattern: a fluent builder, so 1 method is added and call sites are untouched. |
| Prototype | Spawning configured game enemies | Add a `shield` field | Copy: shallow / deep | Naive: copying field by field misses `shield` (wrong result). Pattern: `clone()` lives beside the fields. Shallow copy shows two enemies sharing one `loot` array. |
| Adapter | A checkout calls `pay(amount)`; the new provider offers `charge(cents, currency)` | Switch to the new provider | Amount | Naive: the checkout is rewritten for the new API. Pattern: 1 adapter added, checkout untouched; the ladder shows the conversion to cents inside the adapter. |
| Decorator | A data sink with optional Logging and Compression | Add Encryption | Layers on | Naive: one subclass per combination, 4 classes, then 8 after the change. Pattern: 1 decorator added; calls nest through each layer. Compress-then-encrypt and encrypt-then-compress give different sizes, both computed for real (run-length compression, XOR "encryption" labelled as not secure). |
| Facade | Placing an order touches Inventory, Payment and Shipping | Payment API renamed | Clients: 2 / 3 | Naive: every client calls the 3 subsystems in order, so every client is edited. Pattern: `OrderFacade.place()`, so 1 class is edited; the ladder shows the same calls behind one front door. |

The numbers in this table are targets; the build pins the real ones in tests, and the lesson text quotes the pinned values.

**Content per lesson**, as in the other tracks: overview, concept, howItWorks, prosCons (with **when not to use it**: Singleton's hidden global state, Builder for two fields, Facade becoming a god object), applications, commonMistakes, a quiz of at least 3 questions (at least one `predict-next` built from a real step), and a summary. The last concept paragraph names where the pattern appears in real code, such as `java.util.Calendar.getInstance`, `document.createElement`, Java I/O streams, or a payment SDK adapter.

**Prerequisites**, only where a lesson builds on another: Abstract Factory needs Factory Method, and Decorator needs Adapter. The rest have none.

## 3. Site wiring

- `Category` gains `'design-patterns'`; `labels.ts` gets its title and intro ("Each lesson runs a real design on your change request, naive and patterned, and measures what the change costs.").
- `curriculum.ts` gets the 23 topics; `meta/design-patterns.ts` the 8 lessons; `lessonList.ts` includes them.
- The `import.meta.glob` patterns in `registry.ts` and `all.testutil.ts` add `design-patterns`.
- `LessonPage.tsx` `CODE_COPY` gets a `design-patterns` entry.
- `Home.tsx` and `index.html` name design patterns in the track list.
- `CLAUDE.md` gets a **Design Patterns** architecture entry and a contract-test line, and the README's track list names it.
- The header gets a 9th category link at `xl`. Check for overflow at 1280 px; if it overflows, tighten padding as the Security and Networking tracks did.

## 4. Testing

- **Tracer**: records calls, returns, depth and "made by"; restores every patched method after a normal run and after a throw; a second run sees no leftover wrappers; the call cap stops a runaway loop.
- **Diff**: hand-worked cases (class added, class edited, nothing changed, comments only); branch counts; same result every run.
- **Each scenario**: the real behaviour on the real modules, such as naive Singleton gives 2 instances and the pattern 1, naive Prototype loses `shield`, naive Abstract Factory mixes themes, Decorator sizes differ by order. Every change-cost number quoted in lesson text is pinned by a test.
- **Engine to view, one test per thing a lesson tells the learner to look at**: the ladder row, the error-role result, the change-cost grid cells actually appear in a step's view.
- **Source shown is source run**: each `?raw` source contains every class its scenario traces, and every `codeLine` points at a line that exists and contains the method name.
- **`src/patterns/contract.test.ts`**, like the other tracks: every lesson with every preset, random choices and garbage values; runs stay within `MAX_STEPS + 1`, a bad choice gives one refusal step, code lines are valid, runs repeat exactly, no patched method is left behind, and each lesson's last `concept` paragraph names real code that uses the pattern.
- **Standard suites**: the lesson content suite in `all.testutil.ts`, the curriculum order and group tests in `lessons.test.ts`, and the page count in `scripts/static-pages.test.ts` (201 + 8 + 1 becomes 209 + 9 + 1).
- **Budget**: `npm run check:bundle` stays under 600 kB first load (about 432 kB now; lessons and their sources are split out).
- **Screens**: screenshots of two lessons at phone width and at 1280 px, checking the three panels and the header.

## Out of scope

- UML class diagrams as their own view. The object diagram and the code cover it.
- Editing or writing code in the lesson.
- Patterns beyond GoF (dependency injection, repository and so on), though concept text may mention them.
- Phases 2 and 3, which get their own specs.
