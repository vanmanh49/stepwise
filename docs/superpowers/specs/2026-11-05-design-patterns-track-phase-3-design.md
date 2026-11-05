# Design Patterns track, phase 3: the other behavioral patterns

Date: 2026-11-05
Status: draft, awaiting spec review

## Goal

Make the last 8 Design Patterns topics live: Chain of Responsibility, Iterator, Mediator, Memento, State, Template Method, Visitor and Interpreter. The site goes from 15 to 23 live pattern lessons, which completes the track.

## Decisions

- **Everything from phases 1 and 2 carries over** (`2026-11-04-design-patterns-track-phase-1-design.md`, `…-phase-2-design.md`): before vs after under one change request, real TypeScript run through the tracer, change cost from a real line diff, the same three `form` fields and four presets, and the views `ladder`, `services` and `grid` through `panels`.
- **No engine change.** `trace.ts`, `diff.ts` and `steps.ts` already cover these lessons. Two engine facts shape the designs:
  - The tracer patches string-keyed methods only, so Iterator uses an explicit iterator class with `hasNext()` and `next()`, not `Symbol.iterator` or a generator. The lesson says that `for…of` is the built-in version of the same idea.
  - An inherited method is traced under the class that defines it (`Export.run` called on `CsvExport#1`), which is what Template Method needs to show. `diff.ts` already reads `abstract class`.
- **No curriculum change.** `curriculum.ts` lists the 8 topics in this order after Command.
- One spec, one plan, one PR on branch `design-patterns-phase-3`, inside the `stepwise` folder (no worktree). Ask before merging.

## 1. Lessons

Each lesson is a folder `src/patterns/<id>/` with `naive.ts`, `naive-changed.ts`, `pattern.ts`, `pattern-changed.ts`, `scenario.ts` and `scenario.test.ts`, built like the phase 2 lessons (`observer/scenario.ts` is the model).

| Lesson (id) | Problem | Change request | Scenario field | What the learner sees |
|---|---|---|---|---|
| Chain of Responsibility (`chain-of-responsibility`) | An expense goes to the first level allowed to approve it: Team lead ≤ 500, Manager ≤ 5,000, Director ≤ 50,000, else rejected | Add a CFO level up to 200,000 | Amount: 500 / 3,000 / 30,000 / 150,000 | Naive: one `if` chain in `ExpenseDesk`, which the change grows. Pattern: each approver handles the expense or passes it to the next one; the change adds 1 class and edits 1 wiring line. The ladder shows the expense going further along the chain as the amount grows. Both designs edit 1 class, and the lesson says so: the gain is that approvers can be reordered and reused, not fewer edited classes. |
| Iterator (`iterator`) | A playlist; three clients (total time, find a song, print) loop over its songs | Store songs in pages of 3 | Playlist: Empty / 4 songs / 7 songs | Naive: every client indexes `playlist.songs[i]`, so the change edits all three clients and the playlist. Pattern: clients walk a `PlaylistIterator`; the change edits the playlist and its iterator only. The ladder shows the search stopping at the song it finds. |
| Mediator (`mediator`) | A sign-up form: a "Company account" box shows a company name field; Submit is enabled only when the required fields are filled | Add a VAT number field, shown and required for company accounts | Account: Personal / Company, all filled / Company, name left empty / Company, no VAT number (after the change only) | Naive: widgets hold each other and update each other, so the change edits the checkbox and the submit button. Pattern: widgets only tell `SignupDialog` they changed; the change edits the dialog only. The result counts links between widgets (many in naive, 0 in the pattern). |
| Memento (`memento`) | A game hero (hp, gold, position) is saved before a boss fight and loaded after losing | Add an inventory | Then: Win the fight / Lose and load the save / Lose twice, loading the same save each time | Naive: a `SaveSlot` reads and writes the hero's fields from outside, so the change edits the hero and the save slot. Pattern: the hero makes and reads its own `HeroMemento`; the change edits the hero only. The inventory is copied, so loading after the hero picked up an item really drops it. |
| State (`state-pattern`) | A document moves Draft → In review → Published; `reject` sends it back to Draft | Add a legal review between editor approval and publishing | Actions: Submit, approve / Submit, reject, submit, approve / Approve a draft | Naive: `Doc` keeps a status string and a `switch` in each action, which the change grows. Pattern: each state is a class that answers each action; the change adds `LegalReview` and edits 1 line in `InReview`. Both refuse an action the state does not allow, with the same message. |
| Template Method (`template-method`) | Export a user list as CSV, JSON or a Markdown table, sorted by name | Skip users with no email | Format: CSV / JSON / Markdown | Naive: three export classes each repeat load, sort and format, so the change edits all three. Pattern: an abstract `Export.run` fixes the steps and subclasses fill in `header`, `row` and `footer`; the change edits `Export` only. |
| Visitor (`visitor`) | A drawing of circles, rectangles and triangles; the app computes total area and renders SVG | Add a JSON export | Drawing: One circle / 3 shapes / 6 shapes | Naive: each shape has `area()` and `svg()`, so a new operation edits every shape class. Pattern: shapes `accept` a visitor; the change adds `JsonVisitor` and edits none. The ladder shows the double dispatch (`accept` then `visitCircle`). The lesson says plainly that adding a new shape would edit every visitor. |
| Interpreter (`interpreter`) | A small expression language with numbers, variables, `+` and `*`, evaluated with x = 4, y = 5, and printed back as text | Add `max(a, b)` | Expression: `2 + 3` / `x * (y + 1)` / `max(x, y) + 1` (after the change only) | Naive: node classes hold data, and an `Evaluator` and a `Printer` each check `instanceof`, so the change adds `Max` and edits both. Pattern: each node class has `interpret(ctx)` and `print()`; the change adds `Max` and edits none. The ladder nests with the tree. The lesson points out this is the opposite trade-off to Visitor. |

The numbers in this table are targets; the build pins the real ones in tests, and the lesson text quotes the pinned values. If a pinned number shows the pattern costing about the same as the naive design, the lesson says so plainly (Chain of Responsibility and State are the likely ones).

**Content per lesson**, as in phases 1 and 2: overview, concept, howItWorks, prosCons (with **when not to use it**: Chain of Responsibility when a request might fall off the end unhandled without anyone noticing; Iterator for a plain array that already has `for…of`; Mediator turning into one god object; Memento for large state where snapshots cost memory; State for two states and one flag; Template Method when subclasses need to change the order of the steps; Visitor when new element types come often; Interpreter for a real language, where a parser generator fits better), applications, commonMistakes, a quiz of at least 4 questions and at least 3 question types (at least one `predict-next` built from a real step), and a summary. The last concept paragraph starts with "In real code," and names real code that uses the pattern, such as Express middleware or DOM event bubbling (Chain of Responsibility), `for…of` with `Symbol.iterator` (Iterator), a chat room server or air-traffic control (Mediator), editor snapshots and `structuredClone` saves (Memento), TCP connection states or a checkout flow (State), test frameworks' `setUp`/`tearDown` hooks (Template Method), compiler passes over an AST such as Babel plugins (Visitor), and regular expressions or SQL `WHERE` evaluators (Interpreter).

**Prerequisites**: Memento needs Command (both give undo; the lesson explains the difference: a command knows how to reverse itself, a memento stores the whole state). State needs Strategy (same shape; a strategy is picked from outside, a state replaces itself). Interpreter needs Composite (an expression tree is a composite). The other five have none.

## 2. Site wiring

- `meta/design-patterns.ts` gets the 8 lessons; the lesson registry picks them up through the existing `design-patterns` glob. Each new id also goes in `EXPECTED_IDS` in `lessons.test.ts`.
- `scripts/static-pages.test.ts`: `216 + 9 + 1` becomes `224 + 9 + 1`.
- `CLAUDE.md`, the README and `Home.tsx` / `index.html`: update any live lesson count or pattern list; the track is now complete, so any "Coming soon" wording for Design Patterns goes.
- No header, category or labels change.

## 3. Testing

- **Each scenario** (`scenario.test.ts`): the real behaviour on the real modules, such as 500 going to the Team lead and 150,000 being rejected before the change and approved by the CFO after it, the empty playlist giving 0 seconds and "not found", loading the same save twice giving the same hero, an illegal State action leaving the document where it was, and `max(x, y) + 1` giving 6. Every change-cost number quoted in lesson text is pinned by a test.
- **Source shown is source run**, the **contract test**, the **standard suites** and the **page count**, all as in phase 2.
- **Budget**: `npm run check:bundle` stays under 600 kB first load (442.0 kB after phase 2).
- **Screens**: screenshots of two of the new lessons (Visitor and Mediator) at phone width and at 1280 px.

## Out of scope

- Engine changes, including tracing symbol-keyed methods or generators.
- A parser for the Interpreter lesson: the expression trees are built by the scenario.
- Any patterns beyond the GoF 23.
