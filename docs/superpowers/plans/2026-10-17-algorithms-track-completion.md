# Algorithms Track Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 20 "Coming soon" Algorithms topics into live, step-through lessons (19 → 39 live algorithms lessons).

**Architecture:** Four new general view kinds (`grid`, `calls`, `buckets`, `panels`), two graph extensions and one generic `form` input kind are built first. Each lesson is then an algorithm module (pure result function + `Step[]` generator + code string) under `src/algorithms/`, a lesson file under `src/lessons/algorithms/`, and a registry entry, added in one commit with its tests.

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Tailwind 4, motion, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-algorithms-track-completion-design.md`

## Global Constraints

- Work on branch `algorithms-track`. Run commands from the repo root.
- No new dependencies.
- Every step generator follows the existing module pattern: export `<name>Code: string`, a pure `<name>(...)` result function, and `<name>Steps(...): Step[]`. Every step has a non-empty `title` and `why`, and a `codeLine` between 1 and the number of lines in the code string.
- Cell, frame and row `id`s are stable across the steps of one run so renderers can animate.
- Invalid or oversized input never throws: the generator returns exactly one explanatory step (title says what is wrong, `why` says the allowed range).
- Step counts stay readable: every generator test asserts `steps.length < 400` for its largest allowed input.
- Lesson content minimums (enforced by `src/lessons/lessons.test.ts`): overview > 40 chars, ≥ 2 concept paragraphs, ≥ 4 howItWorks, complexity with ≥ 1 row and ≥ 1 curve id from `'1' | 'log' | 'n' | 'nlogn' | 'n2' | '2n'`, every prosCons list non-empty, ≥ 3 applications, ≥ 3 commonMistakes, ≥ 3 summary, quiz ≥ 4 questions with unique ids, ≥ 3 distinct types, ≥ 1 with a `view`, each with ≥ 3 unique options and explanation > 20 chars.
- Commit messages and the PR description contain no AI attribution (user instruction overrides any default trailer).
- Copy style: plain English, short sentences, matching the existing lessons (see `src/lessons/algorithms/kruskal.ts`).

## Review Focus

1. **Sort-input "Random" button on Counting Sort** generates values 1–99, outside the lesson's 0–9 range, so every random run would be a refusal. Expected: random data fits the lesson. Pinned in Task 4 (`randomMax`) and Task 6.
2. **Garbage in a form field** (blank, `abc`, `3.5`, negative, over the cap). Expected: one explanatory step, never a crash or an empty stage. Pinned in Task 5 (`form.test.ts`) and in every form lesson's tests.
3. **Unreachable answers**: A* with an unreachable goal, Floyd-Warshall unreachable pairs, Network Flow with no augmenting path, Coin Change with an impossible amount, LCS with no common characters, Grid DP with a blocked start. Expected: a final step that says so plainly, with `∞`/"impossible" shown, never `Infinity`/`NaN`/`-1` in a cell. Pinned in Tasks 8, 11, 12, 19, 20, 22.
4. **Pattern edge cases in KMP / Rabin-Karp**: pattern longer than the text, no match, overlapping matches (`AA` in `AAAA`), and Rabin-Karp hash collisions. Expected: all matches found exactly like `indexOf` scanning; a collision is shown as "hash matched, characters differ". Pinned in Tasks 23 and 24.
5. **A* with start equal to goal, or the lesson test calling `generate(g, start)` without a goal**. Expected: goal defaults to the graph's last node; start = goal gives a one-node path of cost 0. Pinned in Task 11.

---

## File map

| Area | Create | Modify |
|---|---|---|
| Views | `renderers/GridRenderer.tsx`, `renderers/CallsRenderer.tsx`, `renderers/callsLayout.ts` (+ test), `renderers/BucketsRenderer.tsx`, `renderers/PanelsRenderer.tsx` | `src/types/visualization.ts`, `renderers/index.tsx`, `visualization/roles.ts` (+ test), `renderers/GraphRenderer.tsx` |
| Inputs | `inputs/FormInput.tsx`, `src/algorithms/form.ts` (+ `form.test.ts`) | `src/types/lesson.ts`, `inputs/LessonVisualization.tsx`, `inputs/GraphInput.tsx`, `inputs/SortInput.tsx`, `src/algorithms/graph/view.ts` |
| Algorithms | `src/algorithms/sorting/{counting,radix}.ts`, `src/algorithms/tree/lca.ts`, `src/algorithms/graph/{floydWarshall,unionFind,aStar,networkFlow,scc}.ts`, `src/algorithms/greedy/coins.ts`, `src/algorithms/recursion/{basics,nQueens,maxSubarray}.ts`, `src/algorithms/dp/{fibonacci,knapsack,coinChange,lcs,lis,gridPaths}.ts`, `src/algorithms/strings/{kmp,rabinKarp}.ts`, one `*.test.ts` per folder or module | `src/algorithms/graph/graphs.ts`, `src/data-structures/bst.ts` (exports only) |
| Lessons | 20 files in `src/lessons/algorithms/` named by lesson id | `src/lessons/registry.ts`, `src/lessons/lessons.test.ts` |

`renderers/` and `inputs/` are under `src/components/visualization/`.

## Lesson task recipe (Tasks 6–24)

Every lesson task follows these steps; the task itself gives the module interface, the tests specific to it, and lesson metadata.

- [ ] **R1: Write the module test** in the listed test file: the task's listed assertions, plus for every generator `expectExplained(steps, code)` (every step titled, explained, `codeLine` in range, `steps.length < 400`) and one-step refusal for invalid input. Copy `expectExplained` from `src/algorithms/graph/graph2.test.ts`, adjusting the expected view kind.
- [ ] **R2: Run** `npx vitest run <test file>`. Expected: FAIL, module not found.
- [ ] **R3: Implement the module** with the listed signatures.
- [ ] **R4: Run** `npx vitest run <test file>`. Expected: PASS.
- [ ] **R5: Write the lesson file** `src/lessons/algorithms/<id>.ts` exporting `const <camelId>: Lesson`, with the listed id, title (exactly the curriculum title), category `'algorithms'`, difficulty, group, prerequisites, compareWith, visualization and complexity, and content meeting the Global Constraints minimums. At least one quiz question uses a `view` built with the module's view helpers.
- [ ] **R6: Register** it in `src/lessons/registry.ts` at its position in the final algorithms order below, and update `src/lessons/lessons.test.ts`: insert the id into `EXPECTED_IDS` at the same position, increase the algorithms count by one, and if the lesson now follows `prim`, change the `adjacentLessons('prim').next` assertion to it.
- [ ] **R7: Run** `npm test && npm run typecheck`. Expected: all pass.
- [ ] **R8: Commit** the module, its test, the lesson, registry and lesson-test changes with the task's commit message.

A `compareWith` or `prerequisites` link to a lesson that a later task registers is added by that later task (the lesson test rejects links to unregistered lessons).

**Final algorithms order** (equals the curriculum order): `linear-search, binary-search, bubble-sort, selection-sort, insertion-sort, two-pointers, sliding-window, prefix-sum, merge-sort, quick-sort, heap-sort, counting-sort, radix-sort, recursion-fundamentals, backtracking, divide-and-conquer, bfs, dfs, topological-sort, tree-traversal, lowest-common-ancestor, dijkstra, bellman-ford, floyd-warshall, kruskal, prim, fibonacci-dp, knapsack, coin-change, lcs, lis, grid-dp, greedy, union-find, kmp, rabin-karp, a-star, network-flow, advanced-graph-algorithms`.

---

## Phase 1: Infrastructure

### Task 1: `grid` view

**Files:**
- Modify: `src/types/visualization.ts`, `src/components/visualization/roles.ts`, `src/components/visualization/renderers/index.tsx`
- Create: `src/components/visualization/renderers/GridRenderer.tsx`
- Test: `src/components/visualization/roles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GridView {
    kind: 'grid';
    colLabels?: string[];
    rows: { label?: string; cells: (Cell | null)[] }[];
    arrows?: { from: [number, number]; to: [number, number] }[];
  }
  ```
  added to the `View` union.

- [ ] **Step 1: Write the failing test** in `roles.test.ts`:
  ```ts
  it('collects roles from grid cells and skips gaps', () => {
    const view: GridView = { kind: 'grid', rows: [{ cells: [{ id: 'a', value: 1, role: 'active' }, null, { id: 'b', value: 2, role: 'sorted' }] }] };
    expect(rolesInView(view)).toEqual(['active', 'sorted']);
  });
  ```
- [ ] **Step 2: Run** `npx vitest run src/components/visualization/roles.test.ts`. Expected: FAIL (type error / wrong result).
- [ ] **Step 3: Implement.** Add `GridView`; add a `'grid'` case to `rolesInView` (non-null cells of all rows); add `GridRenderer` and its `StepView` case. Renderer: an HTML table-like CSS grid of `ValueBox` cells (`CELL_WIDTH` columns), `colLabels` as a mono header row, row `label` as a left header column, `null` as an empty slot of the same size. `arrows` are drawn in an absolutely positioned SVG overlay from cell centre to cell centre (cell size is fixed, so centres are computed from row/col index), with a small arrowhead marker, `stroke="var(--text)"` at reduced opacity. Wrap cells in `motion.div` with `layoutId={cell.id}` inside a `LayoutGroup`, like `ArrayRenderer`.
- [ ] **Step 4: Run** the test, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add grid view for tables, boards and aligned text"`

### Task 2: `calls` view

**Files:**
- Modify: `src/types/visualization.ts`, `roles.ts`, `renderers/index.tsx`
- Create: `renderers/callsLayout.ts`, `renderers/callsLayout.test.ts`, `renderers/CallsRenderer.tsx`
- Test: `callsLayout.test.ts`, `roles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CallFrame { id: string; parent?: string; label: string; result?: string; role: Role }
  export interface CallsView { kind: 'calls'; frames: CallFrame[] }
  // callsLayout.ts
  export function layoutCalls(frames: CallFrame[]): { id: string; x: number; y: number }[];
  ```
  `x` is a column index (leaves get consecutive integers in frame order; a parent's x is the mean of its first and last child's x), `y` is depth (root 0). Frames whose parent is missing are treated as roots, laid out left to right.

- [ ] **Step 1: Write failing tests** in `callsLayout.test.ts`:
  - `fib(3)` tree (frames `f3`, `f2`(parent f3), `f1a`(f2), `f0`(f2), `f1b`(f3)): `y` of f3 = 0, f2 = 1, f1a = 2; x of leaves `f1a, f0, f1b` = 0, 1, 2; x of f2 = 0.5; x of f3 = 1.25.
  - A frame with three children sits over the middle child.
  - No two frames share the same `(x, y)` for a 15-frame random tree built from a seeded generator.
  - In `roles.test.ts`: `rolesInView({ kind: 'calls', frames: [...] })` returns frame roles in order.
- [ ] **Step 2: Run** `npx vitest run src/components/visualization`. Expected: FAIL.
- [ ] **Step 3: Implement** `layoutCalls` (post-order walk over children grouped by `parent`, in frame-array order), the `'calls'` case in `rolesInView`, and `CallsRenderer`: an SVG sized from the layout (column width 84px, row height 64px), lines from each frame to its parent, each frame a rounded box drawn with `roleBoxStyle` colours showing `label`, and `result` as `→ value` under the box when present. Reuse `SvgNode.tsx` styling conventions.
- [ ] **Step 4: Run** tests and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add calls view: a recursion tree with any number of children"`

### Task 3: `buckets` and `panels` views

**Files:**
- Modify: `src/types/visualization.ts`, `roles.ts`, `renderers/index.tsx`
- Create: `renderers/BucketsRenderer.tsx`, `renderers/PanelsRenderer.tsx`
- Test: `roles.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BucketsView { kind: 'buckets'; input?: { label: string; cells: Cell[] }; buckets: { label: string; cells: Cell[] }[] }
  export interface PanelsView { kind: 'panels'; panels: { label?: string; view: Exclude<View, PanelsView> }[] }
  ```

- [ ] **Step 1: Write failing tests** in `roles.test.ts`: buckets roles = input cells then bucket cells in order; panels roles = concatenation of each panel's roles; `rolesInRun` over a panels view containing a grid and a calls view returns the union in `ROLE_META` order without `default`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `rolesInView` cases (`'panels'` calls `rolesInView` on each panel). `BucketsRenderer`: optional input row (like `ArrayRenderer`'s main row, with label) above a wrapping row of buckets; each bucket is a labelled dashed box stacking its cells vertically; cells use `layoutId` inside one `LayoutGroup` so values glide between input and buckets. `PanelsRenderer`: vertical stack (`gap-8`) of `eyebrow` label + `<StepView view={panel.view} />`. Import `StepView` from `./index` (circular import is fine for function components; if Vite warns, move the switch into `renderers/StepView.tsx` and re-export from `index.tsx`).
- [ ] **Step 4: Run** tests and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add buckets and panels views"`

### Task 4: Graph edge labels, A* goal select, sort `randomMax`

**Files:**
- Modify: `src/types/visualization.ts`, `src/types/lesson.ts`, `src/algorithms/graph/view.ts`, `renderers/GraphRenderer.tsx:62-71`, `inputs/GraphInput.tsx`, `inputs/SortInput.tsx`
- Test: `src/algorithms/graph/graph.test.ts`

**Interfaces:**
- Produces:
  - `GraphEdgeView.label?: string` — the renderer shows `label` when set, else `weight`.
  - `graphView(g, nodeRoles?, edgeRoles?, extra?)` where `extra` also accepts `edgeLabels?: Record<string, string>` keyed by `edgeKey(from, to)`.
  - `graph` config: `needsGoal?: boolean; generate(g: Graph, start: string, goal?: string): Step[]`.
  - `sort` config: `randomMax?: number` — SortInput's Random button calls `randomArray(8, config.randomMax ?? 99)`.

- [ ] **Step 1: Write the failing test** in `graph.test.ts`: `graphView(weightedGraph, {}, {}, { edgeLabels: { [edgeKey('A', 'B')]: '3/4' } })` gives the A→B edge `label: '3/4'` and no `label` on other edges.
- [ ] **Step 2: Run** `npx vitest run src/algorithms/graph/graph.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the type changes, `graphView` (strip `edgeLabels` from `extra` like `badges`), the renderer label, `GraphInput` goal select (shown when `config.needsGoal`; state `goal` defaults to the last node and resets with the graph; passed as the third `generate` argument; label "Goal node"), and `SortInput`'s `randomMax`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add graph edge labels, goal node selection and sort random range"`

### Task 5: `form` input kind and shared field parsing

**Files:**
- Modify: `src/types/lesson.ts`, `inputs/LessonVisualization.tsx`, `src/lessons/lessons.test.ts`
- Create: `inputs/FormInput.tsx`, `src/algorithms/form.ts`, `src/algorithms/form.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lesson.ts
  export interface FormField { name: string; label: string; type: 'number' | 'numbers' | 'text' | 'choice'; sample: string; options?: string[]; help?: string }
  | { kind: 'form'; fields: FormField[]; presets: { label: string; values: Record<string, string> }[]; generate(values: Record<string, string>): Step[] }

  // src/algorithms/form.ts
  export type Read<T> = { ok: true; value: T } | { ok: false; why: string };
  export function readInt(values: Record<string, string>, name: string, label: string, range: { min: number; max: number }): Read<number>;
  export function readInts(values: Record<string, string>, name: string, label: string, count: { min: number; max: number }, range: { min: number; max: number }): Read<number[]>;
  export function readText(values: Record<string, string>, name: string, label: string, length: { min: number; max: number }): Read<string>;
  /** The single step a generator returns for unusable input. */
  export function refusal(title: string, why: string, view: View): Step[];
  ```
  `refusal` sets `codeLine: 1`. `why` strings name the field label and the allowed range, e.g. `"Capacity must be a whole number from 0 to 10."`.

- [ ] **Step 1: Write failing tests** in `form.test.ts`:
  - `readInt({ n: '6' }, 'n', 'n', { min: 0, max: 12 })` → `{ ok: true, value: 6 }`; `' 7 '` trims → 7.
  - `''`, `'abc'`, `'3.5'`, `'-1'`, `'13'` each → `ok: false` with `why` containing `"n"` and `"0 to 12"`.
  - `readInts({ w: '1, 3,4' }, ...)` → `[1, 3, 4]`; too many / too few items and an out-of-range item → `ok: false`.
  - `readText` rejects empty, over-length and emoji (reuse the surrogate check from `parseText`), accepts spaces inside.
  - `refusal('Bad', 'because', view)` → one step with `codeLine: 1`.
  - In `lessons.test.ts`: add a `case 'form': return config.generate(config.presets[0]!.values);` to `defaultSteps`, and a test inside the per-lesson `describe.each`: `if (lesson.visualization.kind === 'form') for (const p of lesson.visualization.presets) expect(lesson.visualization.generate(p.values).length, p.label).toBeGreaterThanOrEqual(3);`
- [ ] **Step 2: Run** `npx vitest run src/algorithms/form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `form.ts`, the config type, the `'form'` dispatch, and `FormInput`: state `values` initialised from `presets[0].values`; one control per field (`number` → `<input inputMode="numeric">`, `numbers`/`text` → text input, `choice` → `<select>` over `options`); a submit button "Run"; preset chips (`btn` buttons) that load their values and run; a field's `help` under it. Steps come from `useMemo(() => config.generate(values), ...)` where `values` updates only on Run or a preset. Same toolbar markup and `Visualizer` props as `SortInput`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add form input kind for lessons with named inputs"`

---

## Phase 2: Lessons on existing views

### Task 6: Counting Sort and Radix Sort

**Module:** `src/algorithms/sorting/counting.ts`, `src/algorithms/sorting/radix.ts`; test `src/algorithms/sorting/counting.test.ts`
```ts
export const countingSortCode: string;
export function countingSort(values: number[]): number[];
export function countingSortSteps(values: number[]): Step[];   // 0–9 only, else refusal
export const radixSortCode: string;
export function radixSort(values: number[]): number[];
export function radixSortSteps(values: number[]): Step[];      // 0–999 only, else refusal
```
Counting sort views: `array` with `aux` labelled `"count"` holding ten cells (ids `k0`..`k9`, values = counts, then prefix sums), placing items from the right into an output row shown as the main array. Radix views: `buckets` with ten buckets labelled `0`..`9` and `input` labelled `"pass for the ones / tens / hundreds digit"`; number of passes = digits of the max value.

**Tests:** both sort functions equal `[...v].sort((a, b) => a - b)` on `[4,2,2,8,3,3,1]`, `[0]`, `[9,9,0]`, `[170,45,75,90,802,24,2,66]`, and 20 seeded random arrays in range; the last step's values equal the sorted array; stability: for `[3,1,3]` the two `3` cells keep their relative id order in the final step; `countingSortSteps([4, 12])` and `radixSortSteps([-1, 5])` return one step.

**Lessons:** `counting-sort` (intermediate, group Sorting, `sort` kind, initial `[4,2,2,8,3,3,1]`, `randomMax: 9`, prerequisites `['array']`, compareWith `['quick-sort']`, complexity row O(n + k) all three, space O(n + k), curves `['n']`). `radix-sort` (intermediate, Sorting, initial `[170,45,75,90,802,24,2,66]`, `randomMax: 999`, prerequisites `['counting-sort']`, compareWith `['counting-sort', 'quick-sort']`, row O(d × (n + 10)), space O(n), curves `['n']`). Add `'radix-sort'` to counting-sort's compareWith in the same task.

**Commit:** `Add Counting Sort and Radix Sort lessons`

### Task 7: Lowest Common Ancestor

**Module:** `src/algorithms/tree/lca.ts`; test `src/algorithms/tree/lca.test.ts`. Modify `src/data-structures/bst.ts` to export `build`, `view` (as `bstView`), and `MAX_NODES` (no behaviour change).
```ts
export const lcaCode: string;   // lines 1–6 are bst.ts's insert function verbatim, so the reused insert op's codeLines stay correct; the LCA function follows
export function lowestCommonAncestor(values: number[], a: number, b: number): number | null;
export const lcaStructure: StructureDef; // initial [8,3,1,6,10,14]; ops: [LCA (args a: sample 1, b: sample 6), bstStructure's insert op]
```
LCA op steps: highlight `a` and `b` as `found` targets, walk from root with `compare` on the current node and `visited` on the path, stop where the values split (or equal one of them) and mark it `found`. Either value missing → one refusal step naming the missing value.

**Tests:** `lowestCommonAncestor([8,3,1,6,10,14], 1, 6) === 3`, `(1, 14) === 8`, `(10, 14) === 10`, `(6, 6) === 6`, missing value → `null`; the LCA op's last step has exactly one `found`-role node whose value equals the result; `lcaCode.split('\n').slice(0, 6)` equals the first six lines of `bstStructure.code`.

**Lesson:** `lowest-common-ancestor` (intermediate, Tree Algorithms, `structure` kind with `lcaStructure`, code `lcaCode`, prerequisites `['binary-search-tree']`, compareWith `['tree-traversal']`, row O(h) best O(log n)/avg O(log n)/worst O(n), space O(1), curves `['log', 'n']`).

**Commit:** `Add Lowest Common Ancestor lesson`

### Task 8: Floyd-Warshall

**Module:** `src/algorithms/graph/floydWarshall.ts`; test in `src/algorithms/graph/allPairs.test.ts`. Add to `graphs.ts`: `allPairsGraph` (directed, nodes A–D, edges A→B 3, A→D 7, B→A 8, B→C 2, C→A 5, C→D 1, D→A 2) and `allPairsNegativeGraph` (directed, A→B 4, A→C 3, B→C −2, C→D 2, D→B 1 — no negative cycle).
```ts
export const floydWarshallCode: string;
export function floydWarshall(g: Graph): Record<string, Record<string, number>>; // Infinity when unreachable
export function floydWarshallSteps(g: Graph, _start?: string): Step[];
```
Views: `graph` with the current `k` node `pivot`, the `i`/`j` pair `compare`, and `table` columns = node labels, rows keyed by node label, values shown as numbers or `∞`. One step per improvement and one summary step per `k` (not one per unimproved pair).

**Tests:** matches running `dijkstra` from every node on `allPairsGraph`; on `allPairsNegativeGraph` equals a brute-force Bellman-Ford-per-node result; unreachable pair in a two-component graph is `Infinity` in the result and `'∞'` in the last step's table; no table cell is ever `'Infinity'` or `'NaN'`.

**Lesson:** `floyd-warshall` (advanced, Shortest Path, `graph` kind, `graphs: [allPairsGraph, allPairsNegativeGraph]`, `needsStart: false`, prerequisites `['dijkstra']`, compareWith `['dijkstra', 'bellman-ford']`, row O(V³) ×3, space O(V²), curves `['n2']`; the note says V³ grows faster than the n² curve shown).

**Commit:** `Add Floyd-Warshall lesson`

### Task 9: Greedy Algorithms

> Deviation from the spec table: the spec lists the `search` kind, but `search` has no presets, and the lesson needs a "greedy fails" preset. It uses the `form` kind instead; the default and the failure example are unchanged.

**Module:** `src/algorithms/greedy/coins.ts`; test `src/algorithms/greedy/coins.test.ts`
```ts
export const greedyCoinsCode: string;
export function greedyCoins(coins: number[], amount: number): number[] | null; // coins taken, largest first; null if it gets stuck
export function greedyCoinsSteps(values: Record<string, string>): Step[];     // fields: coins (1–6 items, 1–100), amount (1–200)
```
View: `array` of the coins sorted descending; the coin being tried `active`, a coin too big `discarded`; `aux` labelled `"taken"` collects taken coins; `variables` show `remaining`.

**Tests:** `greedyCoins([25,10,5,1], 63)` → `[25,25,10,1,1,1]`; `greedyCoins([1,3,4], 6)` → `[4,1,1]` (3 coins, while the optimum is 2); `greedyCoins([5], 3)` → `null` and the last step says it is stuck; unsorted input coins are handled; `amount: '0'` and `coins: 'x'` → one step.

**Lesson:** `greedy` (advanced, Advanced Algorithms, `form` kind: fields `coins` (`numbers`, sample `25, 10, 5, 1`), `amount` (`number`, sample `63`); presets `US coins` {25,10,5,1 / 63} and `Greedy fails` {1,3,4 / 6}; prerequisites `['array']`, row `{ label: 'Greedy coin change', best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' }` where n is the number of coins (sorting dominates), space O(n), curves `['nlogn']`). Its overview and summary point forward to Coin Change (link added by Task 19).

**Commit:** `Add Greedy Algorithms lesson`

### Task 10: Union Find

**Module:** `src/algorithms/graph/unionFind.ts`; test in `src/algorithms/graph/connectivity.test.ts`. Add `cycleGraph` to `graphs.ts` (undirected, A–B, B–C, C–A, C–D, E–F; positions in the 0–100 box).
```ts
export const unionFindCode: string;
export function unionFindComponents(g: Graph): { components: number; cycleEdges: [string, string][] };
export function unionFindSteps(g: Graph, _start?: string): Step[];
```
Union by rank, path compression. Views: `graph` with the edge being processed `active`, merged edges `sorted`, a cycle-closing edge `discarded`; `table` columns `['parent', 'rank']`; node `badge` = root label.

**Tests:** `islandGraph` component count equals the count from running `bfs` from unvisited nodes; `cycleGraph` → 2 components and `cycleEdges` = `[['C','A']]` (the edge that closes A–B–C, in edge order); path compression: after the run, every node's parent in the last table is its root.

**Lesson:** `union-find` (advanced, Advanced Algorithms, `graph` kind, graphs `[cycleGraph, islandGraph]`, `needsStart: false`, prerequisites `['graph', 'kruskal']`, compareWith `['kruskal']`, rows `{ label: 'Find or union', best: 'O(1)', average: 'O(α(n))', worst: 'O(log n)' }` and `{ label: 'Whole graph', best: 'O(V + E)', average: 'O(V + E α(V))', worst: 'O(V + E log V)' }`, space O(V), note explaining α(n) is at most 4 for any realistic n, curves `['1', 'n']`).

**Commit:** `Add Union Find lesson`

### Task 11: A* Search

**Module:** `src/algorithms/graph/aStar.ts`; test in `src/algorithms/graph/aStar.test.ts`. Add `wallGraph` to `graphs.ts`: an undirected grid-like graph of about 12 nodes with a wall in the middle, edge weights = rounded Euclidean distances between positions so the heuristic is admissible; the first node is top-left, the last is bottom-right.
```ts
export const aStarCode: string;
export function aStar(g: Graph, start: string, goal: string): { path: string[]; cost: number } | null;
export function aStarSteps(g: Graph, start: string, goal?: string): Step[]; // goal defaults to the last node
```
h = Euclidean distance between node positions, rounded to one decimal place for display. Views: `graph` with open set `frontier`, closed `visited`, current `active`, final path edges `found`; `table` columns `['g', 'h', 'f']`; `frontier` panel listing the open set ordered by f.

**Tests:** `aStar(wallGraph, first, last).cost` equals `dijkstra` distance; path is a valid edge sequence; A* closes no more nodes than Dijkstra on `wallGraph`; `aStar(g, 'A', 'A')` → `{ path: ['A'], cost: 0 }`; unreachable goal (two-component graph) → `null` and last step title contains "No path"; `aStarSteps(g, start)` with no goal uses the last node.

**Lesson:** `a-star` (advanced, Advanced Algorithms, `graph` kind, graphs `[wallGraph, weightedGraph]`, `needsStart: true`, `needsGoal: true`, prerequisites `['dijkstra']`, compareWith `['dijkstra', 'bfs']`, row O(E log V) worst with a note that a good heuristic explores far fewer nodes, space O(V), curves `['nlogn']`).

**Commit:** `Add A* Search lesson`

### Task 12: Network Flow

**Module:** `src/algorithms/graph/networkFlow.ts`; test in `src/algorithms/graph/flow.test.ts`. Add `flowNetwork` to `graphs.ts`: directed, nodes `S, A, B, C, D, T`, edges S→A 10, S→C 10, A→B 4, A→C 2, A→D 8, C→D 9, D→B 6, B→T 10, D→T 10 (max flow 19).
```ts
export const networkFlowCode: string;
export function maxFlow(g: Graph): number;                 // source 'S', sink 'T'
export function networkFlowSteps(g: Graph, _start?: string): Step[];
```
Edmonds-Karp. Views: `graph` with every edge labelled `flow/capacity` via `edgeLabels`; the augmenting path's edges `active`, saturated edges `discarded`; `variables` show `bottleneck` and `total flow`. A graph without `S` or `T` → one refusal step.

**Tests:** `maxFlow(flowNetwork) === 19`; equals a brute-force min cut over all S/T partitions on three small random networks (≤ 5 nodes); a network where T is unreachable → 0 with a final step saying no augmenting path exists; flow conservation holds at every non-S/T node in the last step's labels.

**Lesson:** `network-flow` (advanced, Advanced Algorithms, `graph` kind, graphs `[flowNetwork]`, `needsStart: false`, prerequisites `['bfs']`, row `{ label: 'Edmonds-Karp', best: 'O(V × E²)', average: 'O(V × E²)', worst: 'O(V × E²)' }`, space O(V + E), curves `['n2']`, note explaining the real cost grows faster than the n² curve).

**Commit:** `Add Network Flow lesson`

### Task 13: Advanced Graph Algorithms (strongly connected components)

**Module:** `src/algorithms/graph/scc.ts`; test in `src/algorithms/graph/connectivity.test.ts`. Add `sccGraph` to `graphs.ts`: directed, 8 nodes A–H with SCCs {A,B,C}, {D,E}, {F,G,H} and edges between the groups only one way.
```ts
export const sccCode: string;
export function stronglyConnectedComponents(g: Graph): string[][]; // each sorted; groups sorted by first id
export function sccSteps(g: Graph, _start?: string): Step[];
```
Kosaraju. Pass 1 views: DFS with `active`/`visited`, `frontier` panel labelled "finish order" (stack). Then a step showing the reversed edges (`directed` graph view built from the transpose). Pass 2: each found component's nodes get `badge` `C1`, `C2`, … and role `found`.

**Tests:** `sccGraph` → `[['A','B','C'],['D','E'],['F','G','H']]`; a DAG (`courseGraph`) → every node alone; result equals a brute-force mutual-reachability grouping on `directedGraph`; the last step badges every node.

**Lesson:** `advanced-graph-algorithms` (title "Advanced Graph Algorithms"; overview opens by naming strongly connected components and Kosaraju's algorithm; keywords include `'strongly connected components', 'scc', 'kosaraju'`; advanced, Advanced Algorithms, `graph` kind, graphs `[sccGraph, directedGraph]`, `needsStart: false`, prerequisites `['dfs', 'topological-sort']`, compareWith `['topological-sort']`, row O(V + E), space O(V), curves `['n']`).

**Commit:** `Add strongly connected components lesson`

---

## Phase 3: Recursion

### Task 14: Recursion Fundamentals

**Module:** `src/algorithms/recursion/basics.ts`; test `src/algorithms/recursion/recursion.test.ts`
```ts
export const recursionCode: string;   // factorial then fibonacci, each with its base case on its own line
export function factorial(n: number): number;
export function fibonacciNaive(n: number): { value: number; calls: number };
export function recursionSteps(values: Record<string, string>): Step[]; // fields: fn ('factorial' | 'fibonacci'), n (0–6)
```
View: `calls`. A step when a frame is called (`active`, its ancestors `frontier`), a step when a base case returns, a step when a frame returns (`sorted`, `result` set). For fibonacci, a frame whose label already appeared earlier gets a `why` noting the repeated work.

**Tests:** `factorial(5) === 120`, `fibonacciNaive(5)` → `{ value: 5, calls: 15 }`; `recursionSteps({ fn: 'fibonacci', n: '5' })` final view has 15 frames, root `result: '5'`; `n: '7'` and `fn: 'other'` → one step.

**Lesson:** `recursion-fundamentals` (intermediate, Recursion, `form` kind: `fn` choice `['fibonacci', 'factorial']`, `n` number; presets `fib(5)`, `5!`; prerequisites `['stack']`, rows "factorial" O(n) and "naive fibonacci" O(2ⁿ), space O(n), curves `['n', '2n']`).

**Commit:** `Add Recursion Fundamentals lesson`

### Task 15: Backtracking

**Module:** `src/algorithms/recursion/nQueens.ts`; test in `recursion.test.ts`
```ts
export const nQueensCode: string;
export function solveNQueens(n: number): number[] | null; // column per row, first solution in row-major search order
export function nQueensSteps(values: Record<string, string>): Step[]; // field n, 4–6; stops at the first solution
```
View: `panels` — `grid` board (n×n, a queen cell value `♛`; trying `active`, attacked `discarded`, placed `found`) and `calls` (frame per `place(row)`, pruned frames `discarded`). Steps: try, conflict, place, backtrack.

**Tests:** `solveNQueens(4)` → `[1,3,0,2]`; solutions for 5 and 6 are valid (no shared column or diagonal); last board step has exactly n queens matching the solution; `n: '3'`, `n: '7'` → one step; n = 6 stays under 400 steps.

**Lesson:** `backtracking` (intermediate, Recursion, `form` kind: `n` number, presets `4 queens`, `5 queens`, `6 queens`; prerequisites `['recursion-fundamentals']`, row O(n!) shown with curves `['2n']` and a note, space O(n)).

**Commit:** `Add Backtracking lesson`

### Task 16: Divide and Conquer

**Module:** `src/algorithms/recursion/maxSubarray.ts`; test in `recursion.test.ts`
```ts
export const maxSubarrayCode: string;
export function maxSubarray(values: number[]): { sum: number; start: number; end: number }; // leftmost best on ties
export function maxSubarraySteps(values: number[]): Step[];
```
View: `panels` — `array` (current range `compare`, crossing sum `active`, best range `found`, pointers `lo`, `mid`, `hi`) and `calls` (frame label `best(lo..hi)`, `result` = best sum).

**Tests:** default input → `{ sum: 6, start: 3, end: 6 }`; matches an O(n²) brute force on 30 seeded arrays with negatives; all-negative input returns the single largest value.

**Lesson:** `divide-and-conquer` (intermediate, Recursion, `sort` kind, initial `[-2,1,-3,4,-1,2,1,-5,4]`, prerequisites `['recursion-fundamentals', 'merge-sort']`, compareWith `['merge-sort']`, row O(n log n), space O(log n), curves `['nlogn']`).

**Commit:** `Add Divide and Conquer lesson`

---

## Phase 4: Dynamic programming

All DP generators show `∞` / `—` for unset or impossible cells, never `Infinity`, `NaN` or `-1`.

### Task 17: Fibonacci DP

**Module:** `src/algorithms/dp/fibonacci.ts`; test `src/algorithms/dp/dp.test.ts`
```ts
export const fibonacciDpCode: string;  // memo version then table version
export function fibonacciDp(n: number): number;
export function fibonacciDpSteps(values: Record<string, string>): Step[]; // n 0–12, method 'memo' | 'table'
```
Memo: `panels` of `calls` (memo-hit frames `discarded`, labelled with the cached value) and a one-row `grid` memo (`colLabels` 0..n). Table: one-row `grid` filled left to right with `arrows` from i−1 and i−2.

**Tests:** `fibonacciDp(12) === 144`; memo run for n = 6 has 11 frames (2n − 1) and the memo row ends `8`; table run's last step row equals `[0,1,1,2,3,5,8]`; `n: '13'` → one step.

**Lesson:** `fibonacci-dp` (advanced, Dynamic Programming, `form`: `n`, `method` choice `['memo', 'table']`; presets `n = 6, memo`, `n = 6, table`, `n = 12, table`; prerequisites `['recursion-fundamentals']`, compareWith `['recursion-fundamentals']`, row O(n), space O(n), curves `['n']`).

**Commit:** `Add Fibonacci DP lesson`

### Task 18: 0/1 Knapsack

**Module:** `src/algorithms/dp/knapsack.ts`; test in `dp.test.ts`
```ts
export const knapsackCode: string;
export function knapsack(weights: number[], values: number[], capacity: number): { best: number; items: number[] };
export function knapsackSteps(values: Record<string, string>): Step[]; // 1–5 items, weights/values 1–20, capacity 0–10, lists same length
```
View: `grid`, rows `none`, `item 1 (w, v)`…, cols 0..C; each fill step marks the "skip" and "take" source cells `compare` with `arrows`; trace-back marks chosen cells `found`.

**Tests:** default → `{ best: 9, items: [1, 2] }` (0-based: weights 3 and 4); matches brute force over all subsets on 20 seeded cases; capacity 0 → best 0; mismatched list lengths → one step whose `why` mentions both lists.

**Lesson:** `knapsack` (advanced, Dynamic Programming, `form`: `weights`, `values` (`numbers`), `capacity`; presets default and `Nothing fits` {w 5,6 / v 3,4 / C 4}; prerequisites `['fibonacci-dp']`, row O(n × C), space O(n × C), curves `['n2']`).

**Commit:** `Add 0/1 Knapsack lesson`

### Task 19: Coin Change

**Module:** `src/algorithms/dp/coinChange.ts`; test in `dp.test.ts`
```ts
export const coinChangeCode: string;
export function coinChange(coins: number[], amount: number): number | null; // fewest coins, null if impossible
export function coinChangeSteps(values: Record<string, string>): Step[];   // 1–5 coins (1–20), amount 0–20
```
View: `grid` one row, cols 0..amount, `∞` until reached; for each amount, each coin option `compare` with an arrow from `amount − coin`; final trace-back of the coins used.

**Tests:** `coinChange([1,3,4], 6) === 2` (fewer than `greedyCoins([1,3,4], 6).length`); `coinChange([5], 3) === null` and last step says it is impossible, with `∞` in the cell; matches brute force on seeded cases.

**Lesson:** `coin-change` (advanced, Dynamic Programming, `form`: `coins`, `amount`; presets `Greedy fails` {1,3,4 / 6}, `US coins` {1,5,10,25 / 20}, `Impossible` {5 / 3}; prerequisites `['fibonacci-dp', 'greedy']`, compareWith `['greedy']`, row O(n × amount), space O(amount), curves `['n2']`). Add `'coin-change'` to the greedy lesson's compareWith.

**Commit:** `Add Coin Change lesson`

### Task 20: Longest Common Subsequence

**Module:** `src/algorithms/dp/lcs.ts`; test in `dp.test.ts`
```ts
export const lcsCode: string;
export function lcs(a: string, b: string): string; // one LCS, trace-back preferring up over left on ties
export function lcsSteps(values: Record<string, string>): Step[]; // a, b: 1–8 characters
```
View: `grid` (m+1)×(n+1), `colLabels` `['', ...b]`, row labels `['', ...a]`; match cells `found` with a diagonal arrow, others arrow from the larger neighbour; trace-back path `active`.

**Tests:** `lcs('ABCBDAB', 'BDCABA').length === 4`; result is a subsequence of both; matches brute-force length on 20 seeded short strings; no common characters → `''` with a final step saying the LCS is empty; 9-character input → one step.

**Lesson:** `lcs` (advanced, Dynamic Programming, `form`: `a`, `b` text; presets default and `No overlap` {ABC / XYZ}; prerequisites `['fibonacci-dp']`, row O(m × n), space O(m × n), curves `['n2']`).

**Commit:** `Add Longest Common Subsequence lesson`

### Task 21: Longest Increasing Subsequence

**Module:** `src/algorithms/dp/lis.ts`; test in `dp.test.ts`
```ts
export const lisCode: string;
export function lis(values: number[]): number[]; // one LIS, earliest-ending choice on ties
export function lisSteps(values: number[]): Step[];
```
View: `grid` rows `value`, `length`, `from` (predecessor index or `—`); comparing `j < i` marks `compare`; final sequence cells `found`.

**Tests:** default `[10,9,2,5,3,7,101,18]` → length 4 and strictly increasing; matches brute force length on 20 seeded arrays; strictly decreasing input → length 1.

**Lesson:** `lis` (advanced, Dynamic Programming, `sort` kind, initial `[10,9,2,5,3,7,101,18]`, prerequisites `['fibonacci-dp']`, compareWith `['lcs']`, row O(n²), space O(n), curves `['n2']`). Add `'lis'` to the LCS lesson's compareWith.

**Commit:** `Add Longest Increasing Subsequence lesson`

### Task 22: Grid DP

**Module:** `src/algorithms/dp/gridPaths.ts`; test in `dp.test.ts`
```ts
export const gridPathsCode: string;
export const WALL_PRESET: (rows: number, cols: number) => [number, number][]; // blocked cells for the "wall" option, never the start or goal
export function gridPaths(rows: number, cols: number, blocked: [number, number][]): number;
export function gridPathsSteps(values: Record<string, string>): Step[]; // rows, cols 1–6; blocked 'none' | 'wall'
```
View: `grid` rows×cols, blocked cells `discarded` with value `■`, each fill step marks top and left sources `compare` with arrows.

**Tests:** `gridPaths(3, 4, []) === 10`; `gridPaths(6, 6, []) === 252`; matches DFS path counting with the wall preset for all sizes 2–6; blocked start → 0 and the final step says no path exists; `rows: '7'` → one step.

**Lesson:** `grid-dp` (advanced, Dynamic Programming, `form`: `rows`, `cols`, `blocked` choice `['none', 'wall']`; presets `3 × 4`, `With a wall`; prerequisites `['fibonacci-dp']`, row O(rows × cols), space O(rows × cols), curves `['n2']`).

**Commit:** `Add Grid DP lesson`

---

## Phase 5: Strings

### Task 23: KMP

**Module:** `src/algorithms/strings/kmp.ts`; test `src/algorithms/strings/strings.test.ts`
```ts
export const kmpCode: string;
export function failureTable(pattern: string): number[];
export function kmpSearch(text: string, pattern: string): number[]; // all start indexes, overlapping included
export function kmpSteps(values: Record<string, string>): Step[]; // text 1–20, pattern 1–10 characters
```
View: `panels` — match `grid` (row `text`, row `pattern` placed at the current shift with `null` gaps; matching chars `found`, mismatch `discarded`, current `active`) and failure-table `grid` (`colLabels` pattern chars). The build phase shows only the failure grid.

**Tests:** `failureTable('ABABCABAB')` → `[0,0,1,2,0,1,2,3,4]`; `kmpSearch(defaultText, 'ABABCABAB')` → `[10]`; `kmpSearch('AAAA', 'AA')` → `[0,1,2]`; matches an `indexOf` loop on 50 seeded strings over alphabet `AB`; pattern longer than text → `[]` with a step saying so; the text index never decreases across match-phase steps.

**Lesson:** `kmp` (advanced, Advanced Algorithms, `form`: `text`, `pattern`; presets default, `Overlapping` {AAAA / AA}, `No match` {ABCDEF / XYZ}; prerequisites `['string']`, row O(n + m), space O(m), curves `['n']`).

**Commit:** `Add KMP lesson`

### Task 24: Rabin-Karp

**Module:** `src/algorithms/strings/rabinKarp.ts`; test in `strings.test.ts`
```ts
export const rabinKarpCode: string;
export const BASE = 256; export const MOD = 101;
export function rabinKarpSearch(text: string, pattern: string): { matches: number[]; spuriousHits: number[] };
export function rabinKarpSteps(values: Record<string, string>): Step[]; // text 1–20, pattern 1–10
```
View: `grid` (text row with the current window `compare`; pattern row aligned under it); `variables` `window hash`, `pattern hash`; a hash match then char check marks `found` or, for a spurious hit, `discarded` with a step titled "Hashes match, characters differ".

**Tests:** default → matches `[0, 10]`; matches equal an `indexOf` loop on 50 seeded strings; find a seeded pair where `spuriousHits` is non-empty and assert its step title appears; `AAAA`/`AA` → `[0,1,2]`.

**Lesson:** `rabin-karp` (advanced, Advanced Algorithms, `form`: `text`, `pattern`; presets default, `Overlapping`, plus a `Hash collision` preset using the pair found by the test; prerequisites `['string']`, compareWith `['kmp']`, rows average O(n + m), worst O(n × m), space O(1), curves `['n', 'n2']`). Add `'rabin-karp'` to the KMP lesson's compareWith.

**Commit:** `Add Rabin-Karp lesson`

---

## Phase 6: Verification and PR

### Task 25: Full verification and pull request

- [ ] **Step 1:** Run `npm test && npm run typecheck && npm run build:pages`. Expected: all pass; `lessonsIn('algorithms')` has length 39 in the lesson test; registry algorithms order equals the final order listed above.
- [ ] **Step 2:** Assert in `lessons.test.ts` that every algorithms curriculum topic now has a lesson: `expect(topicsIn('algorithms').every((t) => getLesson(t.id))).toBe(true)`. Run `npm test`. Expected: PASS.
- [ ] **Step 3:** Run the app (`npm run dev`) and, for each of the 20 lessons, play the default example to the end, try one preset or graph switch, and submit one invalid input. Check both light and dark themes and a 375px-wide viewport for the grid and calls views. Confirm the home roadmap's Recursion and DP steps open lessons and that search finds "kosaraju" and "scc".
- [ ] **Step 4:** Commit any fixes, then `git push -u origin algorithms-track` and open the PR with `gh pr create --title "Build all coming-soon Algorithms lessons" --body ...`; the body summarises the new views, the form input, and lists the 20 lessons, with no AI attribution.
