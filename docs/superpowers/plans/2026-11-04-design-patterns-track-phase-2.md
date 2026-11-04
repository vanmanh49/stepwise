# Design Patterns Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 7 more Design Patterns lessons live (Bridge, Composite, Proxy, Flyweight, Strategy, Observer, Command), taking the track from 8 to 15 live lessons.

**Architecture:** Content only, on the phase 1 engine. Each lesson is a folder `src/patterns/<id>/` with four plain design modules and a `scenario.ts` exporting a `PatternLesson`, plus `src/lessons/design-patterns/<id>.ts` and a meta entry. `trace.ts`, `diff.ts`, `steps.ts` and `contract.test.ts` are not changed (the contract test finds new scenarios through its `import.meta.glob`).

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8 (`?raw` imports), Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-11-04-design-patterns-track-phase-2-design.md`

## Global Constraints

- Branch `design-patterns-phase-2` (the spec is committed as `a153389`). No worktrees.
- No change to `src/patterns/trace.ts`, `diff.ts` or `steps.ts`. If a lesson truly needs one, make the smallest change with its own test in `steps.test.ts` / `trace.test.ts`, and say why in the commit message.
- **Design modules** (`naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`) import nothing, export only classes, contain no tracing code and no noise comments, and stay under 80 lines each. Observers and commands are classes, never bare functions.
- Deterministic: nothing reads the clock or `Math.random`. Money is integer cents.
- `scenario.ts` follows `src/patterns/decorator/scenario.ts`: each module imported twice (`import * as naive from './naive'` and `import naiveSource from './naive.ts?raw'`), `designs` built with `design(source, module)`, `run(choice, scenario, t)` picks the typed module itself and returns an `Outcome`, and `notes` gives a `why` for each `'Class.method'`.
- The lesson file follows `src/lessons/design-patterns/decorator.ts`: visualization `{ kind: 'form', fields: patternFields(lesson), presets: patternPresets(lesson), generate: (v) => patternSteps(lesson, v) }`, `code: patternCode(lesson)`.
- Copy: plain, short sentences with the actual values; quote only numbers pinned by a test. The last `concept` paragraph starts with "In real code,". Quiz: at least 4 questions and at least 3 types (`multiple-choice`, `predict-next` with its `view` from a real step of `patternSteps`, `code`). prosCons includes when not to use the pattern (spec section 1).
- Lessons land in curriculum order (Bridge, Composite, Proxy, Flyweight, Strategy, Observer, Command), because `lessons.test.ts` requires the live lessons to be the first topics.
- Commit messages carry no AI attribution. Prefix: `Design Patterns:`.

## Plan-level rulings (refine the spec)

- An option that exists only after the change is an extra scenario option marked `afterChangeOnly`, as Push was in phase 1: Composite `With a zip`, Strategy `Bulk (10+ items)`, Command `Replay the macro`. Command `Undo the last action` is `patternOnly`.
- Bridge's run draws the chosen shape with every renderer the module has (2 before the change, 3 after), so the change visibly adds output.
- Strategy's run prices the cart with Regular first, then swaps to the chosen rule and prices it again: that is the "swap mid-checkout" from the spec, in both designs (the naive one sets a string field).
- Flyweight's texture count is the number of distinct texture arrays reachable from the trees, counted with a `Set` of array references after the run.
- The spec's change-cost numbers are targets. Each lesson test pins the measured values, and the lesson text quotes those.

## Review Focus

1. The largest run (Flyweight, 24 trees, after the change, both designs) stays within `MAX_STEPS + 1` steps and is not cut by `MAX_CALLS`, so the result step still shows the texture count. Test in Task 4.
2. Observer pattern: unsubscribing a display that already left, and notifying with no subscribers, neither throws nor notifies anyone. Test in Task 6.
3. Command: undoing a delete restores exactly the deleted text, including a delete of more characters than the text holds (the editor clamps, and undo restores only what was removed). Test in Task 7.
4. Proxy after the change logs every request, cached ones included, in both designs (3 log lines for 3 lookups), while the real API call count stays 1 for the same city. Test in Task 3.
5. Strategy totals are exact integer cents for every rule after percentage discounts (`Math.round` once per total), and naive and pattern give equal totals for every rule. Test in Task 5.

---

### Tasks 1–7: the seven lessons

Every lesson task has the same file set and step shape; only the designs and the pinned facts differ.

**Files (per lesson `<id>`):**
- Create: `src/patterns/<id>/naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`, `scenario.ts` (exports `<camelId>Lesson: PatternLesson`, e.g. `proxyPatternLesson`), `src/patterns/<id>/scenario.test.ts`, `src/lessons/design-patterns/<id>.ts`
- Modify: `src/lessons/meta/design-patterns.ts` (append in order; `group` Structural with `difficulty: 'intermediate'`, or Behavioral with `'advanced'`; no `complexity`), `scripts/static-pages.test.ts:42` (the first number + 1; it reaches `216 + 9 + 1` after Task 7)

**Interfaces:** Consumes `design`, `PatternLesson`, `Outcome`, `patternCode`, `patternFields`, `patternPresets`, `patternSteps` from `src/patterns/steps.ts`; `traceRun`, `TraceApi` from `trace.ts`; `changeCost` from `diff.ts`. Produces nothing later tasks use.

**Steps (per lesson):**
- [ ] **1. Write `scenario.test.ts`** in the shape of `src/patterns/decorator/scenario.test.ts` (`run` and `fact` helpers over `traceRun` + `lesson.run`): the behaviour assertions listed for the lesson, `changeCost` assertions on the four raw sources (classes added and edited by name, lines + and −, which get pinned once measured), and one engine-to-view assertion per thing the lesson text tells the learner to look at (a ladder row title, a `discarded` fact, a change-cost cell), found in `patternSteps(lesson, values)`.
- [ ] **2. Run** `npx vitest run src/patterns/<id>`. Expected: FAIL (no scenario module).
- [ ] **3. Write the four design modules and `scenario.ts`.**
- [ ] **4. Run** `npx vitest run src/patterns/<id>`. Expected: PASS. Replace any target numbers in the test with the measured ones.
- [ ] **5. Write the lesson content and the meta entry**, per Global Constraints.
- [ ] **6. Run** `npx vitest run src/lessons src/patterns scripts src/components/visualization/renderers && npm run typecheck && npm run lint`. Expected: PASS. (If a lesson reports "No content module", delete `node_modules/.vitest-cache` and run again.)
- [ ] **7. Commit** `Design Patterns: add the <Title> lesson`.

### Task 1: Bridge (`bridge`)

- Meta: Structural, no prerequisites. Keywords include `bridge`, `abstraction`, `implementation`, `renderer`, `class explosion`, `structural pattern`, `gang of four`, `gof`.
- Design: shapes Circle and Square, renderers Canvas and Text. Outputs are real strings: Canvas `arc(0, 0, 5)` / `rect(0, 0, 10, 10)`, Text `( )` / `[ ]`, SVG `<circle r="5"/>` / `<rect width="10" height="10"/>`. Naive: `CanvasCircle`, `CanvasSquare`, `TextCircle`, `TextSquare`, each with `draw()`; changed adds `SvgCircle`, `SvgSquare`. Pattern: `CanvasRenderer`, `TextRenderer` with `circle(r)` and `square(side)`; `Circle(renderer)`, `Square(renderer)` with `draw()` calling the renderer; changed adds `SvgRenderer`. Change `Add an SVG renderer`. Scenario `shape`: `Circle` / `Square`.
- Assertions: both designs give the same outputs for each shape (2 before, 3 after); facts include the class count (naive 4 → 6, pattern 4 → 5, pinned); naive `classesAdded` is `['SvgCircle', 'SvgSquare']` and edits none; pattern adds `['SvgRenderer']` and edits none; the pattern ladder has a row of `Circle#1` calling a renderer's `circle(5)`.

### Task 2: Composite (`composite`)

- Meta: Structural, no prerequisites.
- Design: `File(name, bytes)`, `Folder(name, items)`. Naive: walkers `SizeReport.total(folder)` and `CountReport.count(folder)` loop over `items` with `instanceof File` / `instanceof Folder`; changed adds `Zip(name, items)` (stores items at half size, `Math.ceil`) and a third branch in both walkers. Pattern: `File` and `Folder` each have `size()` and `count()`, `Folder` sums its children; changed adds `Zip` with the same two methods. Change `Add zip archives`. Scenario `tree`: `Flat` / `Nested` / `Deep` / `With a zip` (`afterChangeOnly`). Fix the trees in `scenario.ts` (Flat: 3 files in one folder; Nested: 2 levels; Deep: 4 levels; With a zip: Nested with one zip holding 2 files).
- Assertions: both designs give equal size and count for every tree; Deep reaches ladder depth 4 in the pattern; With a zip stores the zipped files at half size; naive change adds `Zip` and edits `SizeReport` and `CountReport` (branch count +2, pinned); pattern adds `Zip` and edits none.

### Task 3: Proxy (`proxy-pattern`)

- Meta: Structural, prerequisites `['decorator']`.
- Design: `WeatherApi.forecast(city)` returns a fixed text per city and counts `calls`; three widgets `TodayWidget`, `WeekWidget`, `MapWidget`, each with `show(city)` that calls its weather source. Naive: widgets hold the `WeatherApi` directly; changed adds a `log` line in each widget's `show`. Pattern: `CachedWeather(api)` with the same `forecast(city)`, caching by city in a `Map`; widgets hold it; changed adds the log line inside `CachedWeather.forecast` only. Change `Log every request`. Scenario `lookups`: `Same city 3 times` (Hanoi) / `3 different cities` (Hanoi, Paris, Lima).
- Assertions: naive makes 3 real API calls either way; pattern makes 1 for the same city and 3 for different cities; after the change both designs hold 3 log lines (Review Focus 4); the pattern ladder for the same city has 3 `forecast` calls into `CachedWeather#1` and 1 into `WeatherApi#1`; naive change edits 3 widget classes, pattern edits 1 (`CachedWeather`).
- `concept` explains proxy vs decorator: a proxy controls access to one subject and keeps its interface; a decorator adds behaviour and stacks.

### Task 4: Flyweight (`flyweight`)

- Meta: Structural, no prerequisites.
- Design: species alternate `oak`, `pine`; positions are `(i * 3, i % 4)`. Naive: `Tree(x, y, species)` builds its own `texture` array of 64 numbers in its constructor; `Forest.plant(x, y, species)` and `Forest.draw()` (returns a short text such as `24 trees drawn`); changed adds a `bark` array of 64 built the same way. Pattern: `TreeType(species, texture)`, `TreeFactory.get(species)` caching in a `Map`, `Tree(x, y, type)`, `Forest` the same; changed adds `bark` to `TreeType` only. Change `Add a bark texture`. Scenario `trees`: `6 trees` / `12 trees` / `24 trees`.
- Assertions: naive texture arrays equal the tree count (24 for 24 trees, 48 after the change); pattern holds 2 (4 after) for any count; `TreeType#1` is made by `TreeFactory#1.get`; the 24-tree changed runs on both designs end with a result step, have no cut notice and stay within `MAX_STEPS + 1` (Review Focus 1); pin both change costs.
- The text says the count is of arrays the code creates, not bytes measured from the JS engine.

### Task 5: Strategy (`strategy`)

- Meta: Behavioral, no prerequisites.
- Design: a cart of 10 items with fixed prices in cents. Rules: Regular (no discount), Member (10% off), Sale (20% off items priced 2000 or more), and after the change Bulk (15% off when there are 10 or more items). Naive: `Cart` with `rule: string` and an `if` chain in `total()`; changed adds the Bulk branch. Pattern: `RegularPrice`, `MemberPrice`, `SalePrice` each with `apply(prices)`; `Cart(rule)` with `setRule(rule)` and `total()` calling `rule.apply`; changed adds `BulkPrice`. Change `Add a bulk discount`. Scenario `rule`: `Regular` / `Member` / `Sale` / `Bulk (10+ items)` (`afterChangeOnly`). The run prices with Regular, swaps to the chosen rule, and prices again.
- Assertions: naive and pattern totals are equal integers for every rule (Review Focus 5), with the values pinned; naive change edits `Cart` and its branch count goes up by 1; pattern adds `BulkPrice` and leaves `Cart` untouched; the pattern ladder shows `setRule` between the two `total` calls.

### Task 6: Observer (`observer`)

- Meta: Behavioral, no prerequisites.
- Design: readings 28 then 31. `PhoneDisplay` and `WebDisplay` each record what they `show(temp)`. Naive: `Station(phone, web)` calls both by name in `setReading(temp)`; changed adds `HeatAlert` and a third call in `Station`. Pattern: `Station` with `subscribe(o)`, `unsubscribe(o)` and `setReading(temp)` calling `update(temp)` on each subscriber; displays have `update`; changed adds a `HeatAlert` subscriber that records an alert when temp > 30. Change `Add a heat alert over 30°`. Scenario `phone`: `Stays subscribed` / `Leaves after the first reading`.
- Assertions: naive with Leaves → the phone shows `[28, 31]` and the outcome is wrong (`ok: false`, the fact in role `discarded`); pattern with Leaves → the phone shows `[28]`, right; after the change the alert fires once (for 31) on both designs; unsubscribing twice and a `setReading` with no subscribers do not throw (Review Focus 2); naive change edits `Station`; pattern adds `HeatAlert` and edits none.

### Task 7: Command (`command`)

- Meta: Behavioral, no prerequisites.
- Design: `Editor` holds `text`, with `insert(s)` and `remove(n)` (removes from the end, clamped to the length, returns what it removed). The actions are: toolbar types `Hi`, toolbar types ` there`, the shortcut deletes 1, giving `Hi ther`. Naive: `Toolbar.type(s)` and `Shortcuts.backspace()` call the editor directly; changed adds `Macro` holding `{ kind, value }` records with `replay()` switching on `kind`, and edits both triggers to record. Pattern: `TypeCommand(editor, s)` and `DeleteCommand(editor, n)` with `execute()` and `undo()`, `History` with `run(cmd)` and `undo()`, triggers build commands and pass them to `History`; changed adds `MacroCommand(commands)` with `execute()` and `undo()`. Change `Add a macro`. Scenario `then`: `Nothing` / `Undo the last action` (`patternOnly`) / `Replay the macro` (`afterChangeOnly`).
- Assertions: every design ends with `Hi ther` after the actions; Undo gives `Hi there`; Replay gives `Hi therHi ther` on both changed designs; a `DeleteCommand` of 5 on `Hi` leaves `` and its undo restores `Hi` (Review Focus 3); Undo on Naive is one refusal step; naive change adds `Macro` and edits `Toolbar` and `Shortcuts` (branch count up, pinned); pattern adds `MacroCommand` and edits none.

### Task 8: Docs and final checks

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `src/pages/Home.tsx` and `index.html` only where they name phase 1's lessons or live counts (grep `Decorator`, `Facade`, `8 lessons`); otherwise leave them.

- [ ] **Step 1: Update the docs** if the grep finds anything that is now out of date.
- [ ] **Step 2: Run** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass; first load under 600 kB (438.3 kB before; note the new number).
- [ ] **Step 3: Check in a browser** Composite (Deep) and Command (Pattern + change) at 375 px and 1280 px, in light and dark: the Sequence and Objects panels and the change-cost grid fit without page-level horizontal scroll, and the code panel highlights the right section. Take screenshots.
- [ ] **Step 4: Commit** `Design Patterns: document phase 2` (skip if Step 1 changed nothing), then push the branch and open the PR. Ask before merging.
