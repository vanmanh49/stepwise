# Design Patterns Track, Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the last 8 Design Patterns lessons live (Chain of Responsibility, Iterator, Mediator, Memento, State, Template Method, Visitor, Interpreter), taking the track from 15 to 23 live lessons and completing it.

**Architecture:** Content only, on the phase 1 engine. Each lesson is a folder `src/patterns/<id>/` with four plain design modules and a `scenario.ts` exporting a `PatternLesson`, plus `src/lessons/design-patterns/<id>.ts` and a meta entry. `trace.ts`, `diff.ts`, `steps.ts` and `contract.test.ts` are not changed (the contract test finds new scenarios through its `import.meta.glob`).

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8 (`?raw` imports), Vitest 5, Oxlint.

**Spec:** `docs/superpowers/specs/2026-11-05-design-patterns-track-phase-3-design.md`

## Global Constraints

- Branch `design-patterns-phase-3`. No worktrees.
- No change to `src/patterns/trace.ts`, `diff.ts` or `steps.ts`. If a lesson truly needs one, make the smallest change with its own test in `steps.test.ts` / `trace.test.ts`, and say why in the commit message.
- **Design modules** (`naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`) import nothing, export only classes, contain no tracing code and no noise comments, and stay under 80 lines each. Every method the lesson shows is string-keyed: no `Symbol.iterator`, no generators, no `#private` fields (TS `private` is fine).
- Deterministic: nothing reads the clock or `Math.random`. Money is integer amounts; areas are rounded once per shape with `Math.round`.
- `scenario.ts` follows `src/patterns/observer/scenario.ts`: each module imported twice (`import * as naive from './naive'` and `import naiveSource from './naive.ts?raw'`), `designs` built with `design(source, module)`, `run(choice, scenario, t)` picks the typed module itself and returns an `Outcome`, and `notes` gives a `why` for each `'Class.method'`.
- The lesson file follows `src/lessons/design-patterns/observer.ts`: visualization `{ kind: 'form', fields: patternFields(lesson), presets: patternPresets(lesson), generate: (v) => patternSteps(lesson, v) }`, `code: patternCode(lesson)`.
- Copy: plain, short sentences with the actual values; quote only numbers pinned by a test. The last `concept` paragraph starts with "In real code,". Quiz: at least 4 questions and at least 3 types (`multiple-choice`, `predict-next` with its `view` from a real step of `patternSteps`, `code`). prosCons includes when not to use the pattern (spec section 1).
- Lessons land in curriculum order (the task order below), because `lessons.test.ts` requires the live lessons to be the first topics.
- Commit messages carry no AI attribution. Prefix: `Design Patterns:`.

## Plan-level rulings (refine the spec)

- After-change-only options use `afterChangeOnly`: Mediator `Company, no VAT number`, Interpreter `max(x, y) + 1`. Chain of Responsibility `150,000` runs on every design (rejected before the change, CFO after), so it is a plain option.
- Chain of Responsibility wiring lives in the design module (`ExpenseDesk`'s constructor builds the chain), so the wiring edit is in the diff and is counted.
- Iterator's three clients run in one go on the chosen playlist; the search looks for the 3rd song's title (`Blue`), so Empty gives "not found" and the others stop early.
- Mediator's "links between widgets" is the number of `references` from the trace whose `from` and `to` are both widget classes (not `SignupDialog`), counted after the run.
- Memento's hero picks up a `potion` during the lost fight (after the change), so loading the save must drop it; the memento holds a copied array.
- Template Method users: `Cy <cy@ex.com>`, `Al <al@ex.com>`, `Bo` (no email), `Di <di@ex.com>`; sorted by name.
- Visitor drawings: One circle = circle r 2; 3 shapes = circle r 2, rect 3×4, triangle base 6 height 2; 6 shapes = those three twice with sizes +1.
- Interpreter context is `{ x: 4, y: 5 }`; trees are built by the scenario from the running module's classes.
- The spec's change-cost numbers are targets. Each lesson test pins the measured values, and the lesson text quotes those.

## Review Focus

1. Iterator on an empty playlist, and on 7 songs in pages of 3 (a last page of 1): `hasNext()` is right at every page edge, total is 0 / the sum, search says "not found" / finds `Blue`, the printer prints nothing / all 7, on all four designs. Test in Task 2.
2. Memento: loading the same save twice gives the same hero both times, including after the change, where the potion picked up between loads is dropped each time (the restore copies the memento's array, so the hero never shares it). Test in Task 4.
3. State: an action the state does not allow (approve a draft, reject a published doc) leaves the status unchanged and gives the same message on naive and pattern, before and after the change. Test in Task 5.
4. Chain of Responsibility: an amount exactly at a limit (500) is handled by that level (limits are inclusive), and an amount above every limit is `Rejected` at the end of the chain without throwing. Test in Task 1.
5. The largest runs (Visitor 6 shapes after the change, pattern; Iterator 7 songs after the change, pattern) end with a result step, have no cut notice and stay within `MAX_STEPS + 1`. Tests in Tasks 2 and 7.

---

### Tasks 1–8: the eight lessons

Every lesson task has the same file set and step shape; only the designs and the pinned facts differ.

**Files (per lesson `<id>`):**
- Create: `src/patterns/<id>/naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`, `scenario.ts` (exports `<camelId>Lesson: PatternLesson`, e.g. `chainOfResponsibilityLesson`, `statePatternLesson`), `src/patterns/<id>/scenario.test.ts`, `src/lessons/design-patterns/<id>.ts`
- Modify: `src/lessons/meta/design-patterns.ts` (append in order; `group: 'Behavioral'`, `difficulty: 'advanced'`, no `complexity`; keywords end with `'behavioral pattern', 'gang of four', 'gof'`), `src/lessons/lessons.test.ts` (`EXPECTED_IDS`, append the id), `scripts/static-pages.test.ts:42` (the first number + 1; it reaches `224 + 9 + 1` after Task 8)

**Interfaces:** Consumes `design`, `PatternLesson`, `Outcome`, `patternCode`, `patternFields`, `patternPresets`, `patternSteps` from `src/patterns/steps.ts`; `traceRun`, `TraceApi` from `trace.ts`; `changeCost` from `diff.ts`. Produces nothing later tasks use.

**Steps (per lesson):**
- [ ] **1. Write `scenario.test.ts`** in the shape of `src/patterns/observer/scenario.test.ts` (`run` and `fact` helpers over `traceRun` + `lesson.run`): the behaviour assertions listed for the lesson, `changeCost` assertions on the four raw sources (classes added and edited by name, lines + and −, which get pinned once measured), and one engine-to-view assertion per thing the lesson text tells the learner to look at (a ladder row title, a `discarded` fact, a change-cost cell), found in `patternSteps(lesson, values)`.
- [ ] **2. Run** `npx vitest run src/patterns/<id>`. Expected: FAIL (no scenario module).
- [ ] **3. Write the four design modules and `scenario.ts`.**
- [ ] **4. Run** `npx vitest run src/patterns/<id>`. Expected: PASS. Replace any target numbers in the test with the measured ones.
- [ ] **5. Write the lesson content and the meta entry**, per Global Constraints.
- [ ] **6. Run** `npx vitest run src/lessons src/patterns scripts src/components/visualization/renderers && npm run typecheck && npm run lint`. Expected: PASS. (If a lesson reports "No content module", delete `node_modules/.vitest-cache` and run again.)
- [ ] **7. Commit** `Design Patterns: add the <Title> lesson`.

### Task 1: Chain of Responsibility (`chain-of-responsibility`)

- Meta: no prerequisites. Keywords include `chain of responsibility`, `handler`, `pass along`, `middleware`, `approval`, `event bubbling`.
- Design: limits are inclusive: Team lead 500, Manager 5000, Director 50000, after the change CFO 200000. Naive: `ExpenseDesk.approve(amount)` returns the approver's name or `Rejected` from an `if` chain; changed adds the CFO branch. Pattern: abstract `Approver` with `next`, `setNext(a)` (returns `a`) and `handle(amount)` (its own name if `amount <= this.limit`, else the next one's answer, else `Rejected`); `TeamLead`, `Manager`, `Director` set `name` and `limit`; `ExpenseDesk` builds the chain in its constructor and `approve(amount)` calls the first handler; changed adds `Cfo` and one `setNext` in the wiring. Change `Add a CFO level up to 200,000`. Scenario `amount`: `500` / `3,000` / `30,000` / `150,000`.
- Assertions: results per amount on all designs (`Team lead`, `Manager`, `Director`, then `Rejected` before and `CFO` after for 150,000); 500 is the Team lead and a non-option amount above 200,000 is `Rejected` without throwing (Review Focus 4, called on the module directly); the pattern ladder for 30,000 has 3 `handle` calls at increasing depth; naive change edits `ExpenseDesk` (branches +1); pattern adds `Cfo` and edits `ExpenseDesk` only (pin lines).

### Task 2: Iterator (`iterator`)

- Meta: no prerequisites. Keywords include `iterator`, `cursor`, `traversal`, `hasNext`, `for of`, `symbol.iterator`, `collection`.
- Design: `Song(title, seconds)`; the songs in order are `Red` 200, `Gold` 180, `Blue` 240, `Jade` 210, `Rose` 190, `Gray` 230, `Teal` 170; a playlist takes the first 0, 4 or 7. Naive: `Playlist` with `songs: Song[]` and `add(song)`; clients `Duration.total(list)`, `Search.find(list, title)` (returns the title or `not found`), `Printer.lines(list)` (returns `1. Red` style lines), each with an index loop over `list.songs`; changed stores `pages: Song[][]` of 3 and every client becomes a nested loop. Pattern: `Playlist.iterator()` returns `PlaylistIterator(list)` with `hasNext()` and `next()`; clients loop `while (it.hasNext())`; changed edits `Playlist` (pages) and `PlaylistIterator` (page and index) only. Change `Store songs in pages of 3`. Scenario `playlist`: `Empty` / `4 songs` / `7 songs`.
- Assertions: every design gives the same total, search answer and printed lines per playlist (Review Focus 1, including Empty and the 7-song changed runs); the pattern search ladder has no `next` call after the one returning `Song` `Blue`; the 7-song changed pattern run ends with a result step, no cut notice, within `MAX_STEPS + 1` (Review Focus 5); naive change edits `Playlist`, `Duration`, `Search`, `Printer`; pattern edits `Playlist`, `PlaylistIterator` and leaves the three clients untouched.
- `concept` says JavaScript's `for…of` is this pattern built in (`Symbol.iterator` returns an object with `next()`), and that the lesson spells out `hasNext()` so each step is visible.

### Task 3: Mediator (`mediator`)

- Meta: no prerequisites. Keywords include `mediator`, `hub`, `coordinator`, `form`, `widgets`, `decoupling`, `many to many`.
- Design: widgets `Checkbox` (`checked`, `toggle()`), `TextField` (`value`, `visible`, `type(text)`), `SubmitButton` (`enabled`). Submit is enabled when the name is filled and, for a company account, the company field is filled (after the change, the VAT field too). Naive: `Checkbox` holds the company field and the button and updates both on toggle; `TextField` holds the button and calls `refresh()` on type; `SubmitButton` holds the name field, the checkbox and the company field and reads them in `refresh()`; changed adds the VAT field to `Checkbox` and to `SubmitButton.refresh()`. Pattern: each widget holds `dialog` and calls `dialog.changed(this)`; `SignupDialog` holds every widget and in `changed` sets visibility and `submit.enabled`; changed adds the VAT field inside `SignupDialog` only. Change `Add a VAT number field`. Scenario `account`: `Personal` / `Company, all filled` / `Company, name left empty` / `Company, no VAT number` (`afterChangeOnly`).
- Assertions: Submit enabled per option is the same on naive and pattern (yes / yes / no / no); turning Company on then off hides the company field and Submit no longer waits for it (call the module directly); links between widgets (plan ruling) are 0 in the pattern and pinned for naive; naive change edits `Checkbox` and `SubmitButton`; pattern edits `SignupDialog` only and adds no class.

### Task 4: Memento (`memento`)

- Meta: prerequisites `['command']`. Keywords include `memento`, `snapshot`, `save`, `restore`, `checkpoint`, `undo`, `encapsulation`.
- Design: the hero starts at hp 100, gold 50, x 3. Losing the fight sets hp 0, gold 20, x 9 (and after the change adds `potion` to the inventory); winning sets gold 80, x 9. Naive: `Hero` with public `hp`, `gold`, `x`; `SaveSlot.save(hero)` copies the fields out and `load(hero)` writes them back; changed adds `inventory: string[]` to `Hero` and copies it (with a new array) in both `SaveSlot` methods. Pattern: `Hero` keeps its fields `private`, with `save()` returning `HeroMemento(state)` and `restore(m)`; `SaveSlots` (the caretaker) holds mementos without reading them; changed adds the inventory inside `Hero` only. Change `Add an inventory`. Scenario `then`: `Win the fight` / `Lose and load the save` / `Lose twice, loading the same save each time`.
- Assertions: the hero after each option on every design (Win keeps gold 80; Lose and load gives back hp 100, gold 50, x 3, and an empty inventory after the change); Lose twice gives the same hero after both loads (Review Focus 2); `HeroMemento#1` is made by `Hero#1.save`; naive change edits `Hero` and `SaveSlot`; pattern edits `Hero` only.
- `concept` explains memento vs command: a command knows how to reverse its own action; a memento stores the whole state, so it can restore anything without knowing what changed.

### Task 5: State (`state-pattern`)

- Meta: prerequisites `['strategy']`. Keywords include `state`, `state machine`, `transition`, `status`, `workflow`, `finite state`.
- Design: actions `submit()`, `approve()`, `reject()` each return the new status name or a refusal text `Can't <action> a <status> document`. Draft —submit→ In review —approve→ Published; In review —reject→ Draft; after the change In review —approve→ Legal review —approve→ Published, and Legal review —reject→ Draft. Naive: `Doc` with `status: string` and a `switch` in each action; changed adds the `Legal review` cases. Pattern: `Doc` holds `state` and delegates each action; `Draft`, `InReview`, `Published` each answer all three actions and return the next state or refuse; changed adds `LegalReview` and edits `InReview.approve`. Change `Add a legal review`. Scenario `actions`: `Submit, approve` / `Submit, reject, submit, approve` / `Approve a draft`.
- Assertions: the status history per option on every design (after the change `Submit, approve` ends at `Legal review`, not `Published`); Approve a draft gives `Can't approve a draft document` and stays `Draft` on all designs, and `reject` on a published doc refuses too (Review Focus 3, called directly); the pattern ladder shows `Doc#1.approve` calling `InReview#1.approve`; naive change edits `Doc` (branches pinned); pattern adds `LegalReview` and edits `InReview` only.
- `concept` explains state vs strategy: the code is the same shape, but a strategy is chosen from outside and a state replaces itself.

### Task 6: Template Method (`template-method`)

- Meta: no prerequisites. Keywords include `template method`, `hook`, `abstract class`, `inheritance`, `skeleton`, `steps`.
- Design: users from the plan ruling. Outputs: CSV `name,email` then one line per user; JSON `[` … `]` with one `{"name":"Al","email":"al@ex.com"}` per line; Markdown `| name | email |`, `|---|---|`, then rows. Naive: `CsvExport`, `JsonExport`, `MarkdownExport`, each with `run(users)` that copies, sorts by name and formats; changed adds the no-email filter in all three. Pattern: `abstract class Export` with `run(users)` (sort, map `row`, wrap in `header` and `footer`) and abstract `header()`, `row(u)`, `footer()`; three subclasses fill them in; changed adds the filter in `Export.run` only. Change `Skip users with no email`. Scenario `format`: `CSV` / `JSON` / `Markdown`.
- Assertions: naive and pattern give the same text per format, before (4 rows, `Bo` with an empty email) and after (3 rows); the pattern ladder shows `run` with class `Export` called on `CsvExport#1`, then `header` on the same object; naive change edits all three export classes; pattern edits `Export` only.

### Task 7: Visitor (`visitor`)

- Meta: no prerequisites. Keywords include `visitor`, `double dispatch`, `accept`, `operation`, `ast`, `compiler pass`.
- Design: shapes from the plan ruling. Areas: circle `Math.round(Math.PI * r * r)`, rect `w * h`, triangle `Math.round(base * height / 2)`. SVG: `<circle r="2"/>`, `<rect width="3" height="4"/>`, `<polygon base="6" height="2"/>`. JSON: `{"circle":2}`, `{"rect":[3,4]}`, `{"triangle":[6,2]}`. Naive: `Circle`, `Rect`, `Triangle`, each with `area()` and `svg()`; `Drawing` with `shapes`, `totalArea()` and `svg()`; changed adds `json()` to every shape and to `Drawing`. Pattern: shapes `accept(v)` calling `v.visitCircle(this)` etc.; `AreaVisitor` and `SvgVisitor`; `Drawing.run(v)` returns each shape's answer; changed adds `JsonVisitor`. Change `Add a JSON export`. Scenario `drawing`: `One circle` / `3 shapes` / `6 shapes`.
- Assertions: naive and pattern give the same total area, SVG and (after the change) JSON per drawing; the pattern ladder has `Circle#1.accept` calling `SvgVisitor#1.visitCircle`; the 6-shape changed pattern run ends with a result step, no cut notice, within `MAX_STEPS + 1` (Review Focus 5); naive change edits `Circle`, `Rect`, `Triangle` and `Drawing`; pattern adds `JsonVisitor` and edits none.
- prosCons says plainly that adding a new shape edits every visitor, the opposite of the change shown.

### Task 8: Interpreter (`interpreter`)

- Meta: prerequisites `['composite']`. Keywords include `interpreter`, `grammar`, `expression`, `syntax tree`, `ast`, `evaluate`, `dsl`.
- Design: nodes `Num(n)`, `Var(name)`, `Add(left, right)`, `Mul(left, right)`, after the change `Max(left, right)`. Print form: `2 + 3`, `x * (y + 1)` (an `Add` inside a `Mul` gets parentheses), `max(x, y) + 1`. Naive: the nodes hold data only; `Evaluator.eval(node, ctx)` and `Printer.print(node)` check `instanceof` per node class; changed adds `Max` and a branch in both. Pattern: each node class has `interpret(ctx)` and `print()`; changed adds `Max`. Change `Add max(a, b)`. Scenario `expression`: `2 + 3` / `x * (y + 1)` / `max(x, y) + 1` (`afterChangeOnly`).
- Assertions: values 5, 24, 6 and the printed text equal the option label, on every design that may run each option; a `Var` missing from the context throws `Unknown variable z` on both designs (called directly); the pattern ladder for `x * (y + 1)` reaches depth 2 (`Mul` → `Add` → `Var`/`Num`); naive change adds `Max` and edits `Evaluator` and `Printer` (branches +2, pinned); pattern adds `Max` and edits none.
- `concept` points out this is the opposite trade-off to Visitor: a new node is cheap here, a new operation (say, simplify) would edit every node class.

### Task 9: Docs and final checks

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `src/pages/Home.tsx` and `index.html` only where they name live pattern counts or lists (grep `Command`, `15 lessons`, `phase 2`); otherwise leave them.

- [ ] **Step 1: Update the docs** if the grep finds anything that is now out of date.
- [ ] **Step 2: Run** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass; first load under 600 kB (442.0 kB before; note the new number).
- [ ] **Step 3: Check in a browser** Visitor (6 shapes, Pattern + change) and Mediator (Company, all filled, Naive) at 375 px and 1280 px, in light and dark: the Sequence and Objects panels and the change-cost grid fit without page-level horizontal scroll, and the code panel highlights the right section. Take screenshots.
- [ ] **Step 4: Commit** `Design Patterns: document phase 3` (skip if Step 1 changed nothing), then push the branch and open the PR. Ask before merging.
