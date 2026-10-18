# Stepwise platform: interactive DSA lessons

Date: 2026-10-13
Status: as built. Written on 2026-10-18 from PR #1 (`feat/dsa-platform`, merge `266f6d0`) and the code at that commit; no spec was written at the time.

## Goal

A website for learning data structures and algorithms by watching them run. Every lesson has a visualization the learner controls (play, pause, step, speed, timeline), runs on the learner's own data, explains each step in plain words and highlights the line of code responsible.

The first release ships **17 lessons** on one shared engine:

- **Data structures:** Array, Linked List, Stack, Queue, Binary Search Tree, Heap, Graph.
- **Algorithms:** Linear Search, Binary Search, Bubble Sort, Selection Sort, Insertion Sort, Merge Sort, Quick Sort, BFS, DFS, Dijkstra.

The rest of a planned curriculum (59 topics in all) is listed as "Coming soon".

## Decisions

- **Static single-page app**: React 19, TypeScript strict (`noUncheckedIndexedAccess`), Vite, Tailwind CSS v4, React Router, Motion, Lucide icons, Zustand, Vitest. No backend; progress lives in LocalStorage.
- **Steps are data.** Algorithms and structure operations are pure functions that return a `Step[]`. Each step carries a complete `View` snapshot, so the player only moves an index and any step can be shown on its own.
- **One player, one visualizer.** Every lesson goes through the same controls and the same renderer switch; lessons differ only in their content and visualization config.
- **Lessons are content files** registered in one list; a curriculum list of topics decides what shows as "Coming soon".
- **Accessibility**: states never rely on colour alone, keyboard control, reduced-motion support, touch-sized targets.
- Publish to GitHub Pages under `/stepwise/`.

## 1. Steps and views (`src/types/visualization.ts`)

- `Step { title; why; next?; codeLine?; variables?; view }`: what happened, why, what comes next, the 1-based line in the lesson's code, and the variables to show.
- `View` is one of `array`, `linked-list`, `stack`, `queue`, `tree`, `heap`, `graph`.
  - `ArrayView` has cells, named pointers (`{ i: 0, j: 1 }`) and an optional auxiliary row (merge sort's buffer).
  - `TreeView` is nodes with `left`/`right` ids; `HeapView` is the array, with the tree derived from indexes.
  - `GraphView` has positioned nodes, edges with optional weights, an optional frontier list (queue or stack) and an optional per-node table (Dijkstra's distances).
- `Cell.id` is stable across steps so renderers can animate a value as it moves.
- `Role`: `default`, `active`, `compare`, `swap`, `sorted`, `found`, `visited`, `frontier`, `discarded`, `pivot`. `roles.ts` is the single source of role styling: each role has a colour token, a border cue (solid, dashed, double, ring) and usually a mark (▸ ? ⇄ ✓ ★ • … × P), plus a legend label.

## 2. Player (`src/engine/`)

- `playerReducer(state, action)`, pure. State: `index`, `playing`, `speed`, `total`. Actions: `play`, `pause`, `next`, `prev`, `restart`, `tick`, `seek`, `speed`, `load`.
  - Indexes clamp to `[0, total - 1]`. Manual navigation pauses. A tick that reaches the last step stops playback. Play on the last step restarts from 0. `load` resets to step 0 paused and keeps the speed. Nothing plays with 0 steps.
- Speeds: 0.5×, 1×, 1.5×, 2×.
- `usePlayer(steps, { autoPlay, loop })` runs the timer and reloads when the steps change.

## 3. Visualizer (`src/components/visualization/`)

- `Visualizer` shows the current step's view, the explanation (`title`, `why`, `next`), variables, legend, controls and the code panel with `codeLine` highlighted.
- Controls: restart, previous, play/pause, next, speed group, timeline slider. Keyboard: ← and → step, Space plays or pauses.
- Renderers: array (with pointers and aux row), linked list, stack, queue, tree, heap (tree and array drawn in sync), graph (SVG, weights, frontier and table). `treeLayout.ts` holds `layoutTree` and `heapToTree`.
- `ErrorBoundary` keeps a renderer crash inside the visualization.
- `MiniPlayer` plays a looping preview on the home page; with reduced motion it starts paused.

## 4. Inputs (`src/components/visualization/inputs/`)

`LessonVisualization` picks the input for the lesson's `VisualizationConfig`:

| Kind | Input |
|---|---|
| `sort` | A list of 2–12 whole numbers, or random data |
| `search` | A list of 1–12 numbers and a target; when `needsSorted`, the list is sorted first with a notice |
| `structure` | Operation buttons with numeric fields; state carries over between operations; reset |
| `graph` | A choice of sample graphs and, when `needsStart`, a start node |

- `parseNumberList(text, {min, max})` accepts commas or spaces and whole numbers between −999 and 999. Errors: "Enter some numbers separated by commas, like 5, 2, 8.", `"x" is not a whole number…`, "Use values between -999 and 999.", "Enter at least N numbers.", "Enter at most N numbers so every step stays readable."
- Structures: `StructureDef { initial, view, ops, code }`; `StructureOp.run(state, args)` never mutates and returns `{ steps, state }`. An operation that cannot run returns **one explanatory step and the same state** (`refuse`).
- Limits: linear structures hold at most 10 items, the BST 12 nodes, the heap 15 items.
- Sample graphs: Connected graph, Weighted graph, Two separate islands, Directed graph.

## 5. Lessons (`src/lessons/`)

- `Lesson` fields: id, title, category, difficulty, description, keywords, prerequisites, overview, concept, howItWorks, visualization, code, complexity (rows, space, note, Big O curves), compareWith, prosCons (pros, cons, useWhen, avoidWhen), applications, commonMistakes, quiz, summary.
- Quiz question types: `multiple-choice`, `complexity`, `code` (shows a snippet), `predict-next` (shows a view). Each has an explanation; the learner can retry.
- `registry.ts`: the lesson list in learning order, `getLesson`, `lessonsIn`, `adjacentLessons` (previous and next within a category) and `lessonPath` (`/<category>/<id>`).
- `curriculum.ts`: every planned topic, by category and difficulty, with optional groups. A topic is live when a lesson with its id is registered.

## 6. Pages and navigation

- Routes: `/`, `/data-structures`, `/algorithms`, `/<category>/:lessonId`, `/dashboard`, `/big-o`, and a not-found page. All but the home page load on demand.
- **Home**: introduction, live mini-player preview, roadmap.
- **Catalog**: lessons and "Coming soon" topics per category, grouped by difficulty.
- **Lesson page**: sections "See it run", "The idea", "How it works", "Code", "Complexity" (table, comparison rows, compact Big O chart), "Strengths and trade-offs", "Where it is used", "Common mistakes", "Practice" (the quiz), "Summary"; course sidebar (a drawer on phones), prerequisite notice, previous and next links.
- **Dashboard**: completion per category, quiz totals, streak, resume link, reset with confirmation.
- **Big O explorer**: six curves (O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ)) with plain-language meanings; toggle curves, change n, read operation counts. `curveForNotation` maps lesson complexity strings to curves.
- **Search** (Ctrl+K / Cmd+K): title prefix beats title substring beats keyword; live lessons win ties; at most 8 results; planned topics show without a link.

## 7. Progress and theme (`src/store/`)

- `useProgress` (Zustand `persist`, key `dsa-progress`): `completed`, `quizScores` (best score kept; a perfect score completes the lesson), `currentLesson`, `activeDays`. Actions: `markComplete`, `unmarkComplete`, `recordQuiz`, `visit`, `reset`.
- `sanitizeProgress` rebuilds state from untrusted storage and drops anything malformed, including quiz scores with a zero total.
- `computeStreak`: consecutive active local days ending today, or yesterday if today has no activity yet.
- `useTheme`: light or dark, saved as `dsa-theme`. `index.html` applies it before first paint.

## 8. Publishing

- `npm run build:pages` builds with base `/stepwise/` and copies `index.html` to `404.html` so deep links work on GitHub Pages. `BrowserRouter` takes its basename from `import.meta.env.BASE_URL`.
- First release: `dist/` is pushed to a `gh-pages` branch by hand. PR #4 later replaced this with GitHub Actions (see `2026-10-15-pages-deploy-design.md`).

## 9. Testing

- Vitest in Node, no browser. Unit tests cover:
  - every algorithm on empty, single, normal, duplicate, negative, sorted, reversed and large inputs;
  - step generation: input not mutated, cell identity kept, every step explained with a valid code line, at most 400 steps for 12 reversed items;
  - structure operations, including invalid ones;
  - the player reducer, input parsing, tree layout, search ranking, Big O maths and the progress store;
  - every registered lesson's content and quiz, and that its default visualization runs with valid code lines.
- UI behaviour is checked by hand in the browser at desktop and 390px widths, in light and dark mode.
- Result at merge: 315 tests passing; `typecheck` and `build` clean.

## Out of scope

- Component and end-to-end tests.
- Accounts or server-side progress.
- The "Coming soon" topics.
