# Design Patterns track, phase 2: the other structural patterns and the first behavioral ones

Date: 2026-11-04
Status: approved design, awaiting spec review

## Goal

Make 7 more Design Patterns topics live: Bridge, Composite, Proxy and Flyweight (finishing Structural), and Strategy, Observer and Command (starting Behavioral). The site goes from 8 to 15 live pattern lessons; the other 8 Behavioral topics stay Coming soon until phase 3.

## Decisions

- **Everything from phase 1 carries over** (`2026-11-04-design-patterns-track-phase-1-design.md`): before vs after under one change request, real TypeScript run through the tracer, change cost from a real line diff, the same three `form` fields (Design, Change request, one scenario field) and four presets, and the views `ladder`, `services` and `grid` through `panels`.
- **No engine change.** `src/patterns/trace.ts`, `diff.ts` and `steps.ts` already do what these lessons need: the tracer follows array-valued fields, which Composite children, Observer subscribers and Command history use. If a lesson turns out to need an engine change, it is the smallest one, with its own test, and the plan says why.
- **No curriculum change.** `curriculum.ts` already lists all 23 topics, with these 7 in the order the prefix test needs (Bridge, Composite, Proxy, Flyweight after the phase 1 Structural topics; Strategy, Observer, Command first in Behavioral).
- **Observers and commands are classes**, not bare functions, so the tracer sees them.
- One spec, one plan, one PR on branch `design-patterns-phase-2`, inside the `stepwise` folder (no worktree). Ask before merging.

## 1. Lessons

Each lesson is a folder `src/patterns/<id>/` with `naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`, `scenario.ts` and `scenario.test.ts`, built like the phase 1 lessons (`decorator/scenario.ts` is the model).

| Lesson (id) | Problem | Change request | Scenario field | What the learner sees |
|---|---|---|---|---|
| Bridge (`bridge`) | Shapes (Circle, Square) drawn by renderers (Canvas, Text) | Add an SVG renderer | Shape: Circle / Square | Naive: one class per shape and renderer pair, so 4 classes become 6. Pattern: a shape holds a renderer; the change adds 1 class and edits none. Each renderer really produces its output text. |
| Composite (`composite`) | A folder holds files and folders; the app shows total size and file count | Add zip archives: an item that holds items and stores them smaller | Tree: Flat / Nested / Deep | Naive: two walkers (size and count) each check `instanceof File` / `instanceof Folder`, so both are edited. Pattern: every item has `size()` and `count()`; the change adds 1 class. The ladder shows the calls nesting with the tree. |
| Proxy (`proxy-pattern`) | Dashboard widgets ask a slow `WeatherApi` for a city's forecast | Log every request | Lookups: Same city 3 times / 3 different cities | Naive: every lookup reaches the API, and the change edits every call site. Pattern: a caching proxy with the same interface; repeat lookups stop at the proxy (visible in the ladder), and the change edits 1 class. The result counts real API calls. |
| Flyweight (`flyweight`) | A forest where every tree has a species, a position and a pixel texture | Add a bark texture | Trees: 6 / 12 / 24 | Naive: each tree builds its own texture array, so the result counts one array per tree (twice that after the change). Pattern: a `TreeFactory` hands out a shared `TreeType` per species; trees keep only their position. The count is of arrays the code really creates, and the text says it is a count of objects, not bytes measured from the JS engine. |
| Strategy (`strategy`) | A cart prices its items with a discount rule | Add a bulk discount (10+ items) | Rule: Regular / Member / Sale | Naive: an `if` chain inside `Cart.total()`, which the change grows and edits. Pattern: `Cart` holds a `PricingRule`; the change adds 1 rule class and leaves `Cart` untouched. The run swaps the rule once mid-checkout to show it can change at run time. |
| Observer (`observer`) | A weather station updates a phone display and a web display | Add a heat alert over 30° | Phone: Stays subscribed / Leaves after the first reading | Naive: the station calls each display by name, so the change edits the station, and a phone that left still gets the second reading (wrong result). Pattern: displays subscribe and unsubscribe; the change adds 1 subscriber class and leaves the station untouched. |
| Command (`command`) | An editor's toolbar and keyboard shortcuts type and delete text | Add a macro: record actions, then replay them | Then: Nothing / Undo the last action / Replay the macro | Naive: triggers call the editor directly, so there is no undo, and a macro needs a type switch plus edits to both triggers. Pattern: each action is a command object kept in a history, so undo already works and the macro is 1 new class. Undo is `patternOnly`; replay is `afterChangeOnly`. |

The numbers in this table are targets; the build pins the real ones in tests, and the lesson text quotes the pinned values. If a pinned number shows the pattern costing about the same as the naive design, the lesson says so plainly, as Builder does in phase 1.

**Content per lesson**, as in phase 1: overview, concept, howItWorks, prosCons (with **when not to use it**: Bridge for one dimension only, Composite forcing a common interface on unlike things, Proxy hiding slow calls behind fast-looking ones, Flyweight for a few objects, Strategy for two fixed branches, Observer's hard-to-follow update chains and leaked subscriptions, Command's extra class per action), applications, commonMistakes, a quiz of at least 4 questions and at least 3 question types (at least one `predict-next` built from a real step), and a summary. The last concept paragraph starts with "In real code," (the contract test checks this) and names real code that uses the pattern, such as JDBC drivers (Bridge), the DOM tree (Composite), JavaScript `Proxy` or HTTP caches (Proxy), Java's `Integer.valueOf` cache or glyph sharing in text editors (Flyweight), `Array.prototype.sort` with a comparator (Strategy), `addEventListener` (Observer), and undo stacks in editors (Command).

**Prerequisites**: Proxy needs Decorator (they look alike, and the Proxy lesson explains the difference: a proxy controls access to one subject, a decorator adds behaviour and stacks). The other six have none.

## 2. Site wiring

- `meta/design-patterns.ts` gets the 7 lessons; the lesson registry picks them up through the existing `design-patterns` glob.
- `scripts/static-pages.test.ts`: `209 + 9 + 1` becomes `216 + 9 + 1`.
- `CLAUDE.md`, the README and `Home.tsx` / `index.html`: update any live lesson count or pattern list that names phase 1 only; otherwise no change.
- No header, category or labels change.

## 3. Testing

- **Each scenario** (`scenario.test.ts`): the real behaviour on the real modules, such as the naive Observer phone getting a reading after leaving, the Proxy making 1 API call for the same city and 3 for different cities, the naive Flyweight making one texture array per tree, Composite sizes adding up across nesting, and Command undo restoring the text. Every change-cost number quoted in lesson text is pinned by a test.
- **Source shown is source run**: as in phase 1, each `?raw` source contains every class its scenario traces, and every `codeLine` points at a line that exists.
- **`src/patterns/contract.test.ts`** covers the new lessons with its existing checks: every preset, random choices and garbage values, runs within `MAX_STEPS + 1`, one refusal step for a bad choice, runs repeat exactly, no patched method left behind, the last `concept` paragraph starts with "In real code,", and every class a design runs appears in its shown source.
- **Standard suites**: the lesson content suite in `all.testutil.ts`, the curriculum order and live-prefix tests in `lessons.test.ts`, and the page count in `scripts/static-pages.test.ts`.
- **Budget**: `npm run check:bundle` stays under 600 kB first load (438.3 kB after phase 1; lessons and their sources are split out).
- **Screens**: screenshots of two of the new lessons (one Structural, one Behavioral) at phone width and at 1280 px.

## Out of scope

- The other 8 Behavioral patterns (phase 3).
- Engine features beyond what these 7 lessons need.
- Running callbacks given as bare functions through the tracer.
