# Algorithms track: build every coming-soon lesson

Date: 2026-10-17
Status: approved design, awaiting spec review

## Goal

Turn all 20 "Coming soon" topics in the **Algorithms** menu into live lessons, so the Algorithms curriculum goes from 19 to 39 live lessons and the home-page roadmap's Recursion and Dynamic Programming steps point at real lessons.

Every new lesson matches the existing ones: a step-by-step visualization the learner can feed with their own input, synced code, and the full lesson content enforced by `src/lessons/lessons.test.ts`.

## Scope

In scope (curriculum ids):

| Difficulty | Group | Lessons |
|---|---|---|
| Intermediate | Sorting | `counting-sort`, `radix-sort` |
| Intermediate | Recursion | `recursion-fundamentals`, `backtracking`, `divide-and-conquer` |
| Intermediate | Tree Algorithms | `lowest-common-ancestor` |
| Advanced | Shortest Path | `floyd-warshall` |
| Advanced | Dynamic Programming | `fibonacci-dp`, `knapsack`, `coin-change`, `lcs`, `lis`, `grid-dp` |
| Advanced | Advanced Algorithms | `greedy`, `union-find`, `kmp`, `rabin-karp`, `a-star`, `network-flow`, `advanced-graph-algorithms` |

Out of scope: the coming-soon Data Structures lessons (Hash Table, Trie, AVL Tree, Red-Black Tree, Disjoint Set, Segment Tree, Fenwick Tree, B-Tree, Advanced Graph Structures), SQL phases 2–4, and any change to how the curriculum lists topics. Those come later as their own specs.

## Decisions

- **One spec, one plan, one branch (`algorithms-track`), one PR.** Merging to `main` deploys through the existing Pages workflow.
- **Union Find** (algorithms) teaches *applying* the structure to a graph: counting connected components and detecting a cycle. The data-structures topic "Disjoint Set / Union Find" will later teach the structure itself; the two lessons stay separate.
- **Advanced Graph Algorithms** teaches **strongly connected components with Kosaraju's algorithm**. The curriculum title stays "Advanced Graph Algorithms"; the lesson's overview names SCC and Kosaraju, and its keywords include "strongly connected components", "scc", "kosaraju".
- **Greedy Algorithms** teaches greedy coin change, including a preset where greedy gives the wrong answer. That failure motivates the Coin Change DP lesson.
- New visual work is limited to four general view kinds plus small extensions (section 1). No lesson gets a one-off renderer.

Alternatives considered and rejected:

- Batching the 20 lessons into three specs (existing views / recursion & DP / strings). Rejected by the user in favour of one spec.
- A dedicated renderer per lesson family (DP table renderer, N-Queens board, text-matching renderer). The single `grid` view covers all of them.

## 1. Shared building blocks

### New view kinds (`src/types/visualization.ts`)

Each is added to the `View` union and gets one renderer in `src/components/visualization/renderers/`, wired through the `StepView` switch in `renderers/index.tsx`. `roles.ts` (`rolesInRun`) learns to collect roles from each new kind so the legend stays correct.

#### `grid`

```ts
export interface GridView {
  kind: 'grid';
  /** Column headers, e.g. capacities 0..C or the characters of a string. */
  colLabels?: string[];
  rows: { label?: string; cells: (Cell | null)[] }[];
  /** Dependency arrows between cells, as [row, col] pairs. */
  arrows?: { from: [number, number]; to: [number, number] }[];
}
```

- `null` cells render as empty gaps. This aligns a shifted pattern under a text in KMP and Rabin-Karp without extra layout code.
- Used by: all DP lessons, the N-Queens board (Backtracking), text/pattern rows (KMP, Rabin-Karp), the KMP failure table.
- `arrows` show which earlier cells a DP cell was computed from (Knapsack, LCS trace-back).

#### `calls`

```ts
export interface CallFrame {
  id: string;
  parent?: string;
  /** e.g. "fib(4)". */
  label: string;
  /** Return value once the frame has finished. */
  result?: string;
  role: Role;
}

export interface CallsView {
  kind: 'calls';
  frames: CallFrame[];
}
```

- A recursion tree. Frames on the active call path use `active`, finished frames `sorted` (shows `result`), pruned or memo-hit frames `discarded`.
- Layout: a new pure `layoutCalls(frames)` in `renderers/callsLayout.ts` places leaves left-to-right in call order and each parent centred over its children, with depth as y. It supports any number of children. `treeLayout.ts` is unchanged.

#### `buckets`

```ts
export interface BucketsView {
  kind: 'buckets';
  /** The array being distributed or collected. */
  input?: { label: string; cells: Cell[] };
  buckets: { label: string; cells: Cell[] }[];
}
```

- Used by Radix Sort (digit buckets 0–9). General enough for the later Hash Table lesson.

#### `panels`

```ts
export interface PanelsView {
  kind: 'panels';
  panels: { label?: string; view: Exclude<View, PanelsView> }[];
}
```

- Stacks several views in one step. `StepView` renders each panel by calling itself. Panels do not nest.
- Used by: Backtracking (board + call tree), Divide and Conquer (array + call tree), Fibonacci DP (call tree + memo table), KMP (match grid + failure table).

### Graph extensions

- `GraphEdgeView.label?: string`. When set, the renderer shows it instead of `weight`. `graphView()` accepts edge labels through its `extra` argument, as it already does for badges. Network Flow uses it for "flow/capacity" such as `3/5`.
- The `graph` config kind gains `needsGoal?: boolean`, and `generate(g, start, goal?)`. `GraphInput` shows a second node select labelled "Goal" when it is set. When `goal` is omitted, the generator uses the last node of the graph, so callers that pass only a start (including the lesson test) still get a full run. Used by A*.

### New input kind: `form`

Added to `VisualizationConfig` in `src/types/lesson.ts`:

```ts
| {
    kind: 'form';
    fields: { name: string; label: string; type: 'number' | 'numbers' | 'text' | 'choice'; sample: string; options?: string[]; help?: string }[];
    /** Quick-fill chips; the first is loaded when the lesson opens. */
    presets: { label: string; values: Record<string, string> }[];
    generate(values: Record<string, string>): Step[];
  }
```

- New `src/components/visualization/inputs/FormInput.tsx`, dispatched from `LessonVisualization.tsx`. It renders one field per entry (`numbers` is a comma-separated list, `choice` a select over `options`), a Run button and preset chips, styled like `SortInput` and `SearchInput`.
- Parsing and validation happen in the lesson's `generate`, not in the input. Invalid or too-large input returns a single explanatory step and no other steps, the same convention `StructureOp.run` uses for refused operations.
- Each generator enforces a size cap so step counts stay readable (caps listed per lesson below).

## 2. Lessons

Every lesson file lives in `src/lessons/algorithms/<id>.ts`. Step generators and code strings live in algorithm modules under `src/algorithms/` (new folders `recursion/`, `dp/`, `strings/` alongside the existing `graph/`, `sorting/`, `tree/`). Each lesson has the full content the lesson test requires: overview, ≥2 concept paragraphs, ≥4 how-it-works steps, complexity rows and curves, pros/cons/use-when/avoid-when, ≥3 applications, ≥3 common mistakes, ≥3 summary points, and ≥4 quiz questions of ≥3 types with at least one carrying a view.

### Intermediate

| Lesson | Variant taught | Input | View | Default input | Caps | Prerequisites |
|---|---|---|---|---|---|---|
| Counting Sort | Stable: count, prefix sums, place items from the right | `sort` | `array` + `aux` count row | `[4,2,2,8,3,3,1]` | values 0–9 | `array` |
| Radix Sort | LSD, one stable bucket pass per digit | `sort` | `buckets` 0–9 + input row | `[170,45,75,90,802,24,2,66]` | values 0–999 | `counting-sort` |
| Recursion Fundamentals | Factorial, then naive Fibonacci to show repeated work | `form`: function (`choice`: factorial / fibonacci), n | `calls` | fibonacci, 5 | n ≤ 6 | `stack` |
| Backtracking | N-Queens: place, check, undo | `form`: n | `panels`: `grid` board + `calls` | 4 | 4 ≤ n ≤ 6; stop at the first solution | `recursion-fundamentals` |
| Divide and Conquer | Maximum subarray: split, solve halves, combine across the middle | `sort` | `panels`: `array` + `calls` | `[-2,1,-3,4,-1,2,1,-5,4]` | sort-input limits | `recursion-fundamentals`, `merge-sort` |
| Lowest Common Ancestor | Walk down from the root of a BST | `structure`: BST (initial `[8,3,1,6,10,14]`), ops "LCA(a, b)" (first, so it is the default the lesson test runs) and Insert | `tree` | LCA(1, 6) → 3 | BST limits | `binary-search-tree` |

### Advanced

| Lesson | Variant taught | Input | View | Default input | Caps | Prerequisites |
|---|---|---|---|---|---|---|
| Floyd-Warshall | All-pairs shortest paths, one intermediate node k at a time | `graph` (no start) | `graph` + distance-matrix `table` | new 4-node directed weighted graph, plus one with a negative edge | — | `dijkstra` |
| Fibonacci DP | Memoised recursion, then bottom-up table | `form`: n, method (`choice`: memo / table) | memo: `panels` `calls` + `grid`; table: `grid` | 6, memo | n ≤ 12 | `recursion-fundamentals` |
| 0/1 Knapsack | Item × capacity table, then trace back the chosen items | `form`: weights, values, capacity | `grid` + `arrows` | w=[1,3,4,5], v=[1,4,5,7], C=7 | ≤ 5 items, C ≤ 10 | `fibonacci-dp` |
| Coin Change | Fewest coins, amount by amount | `form`: coins, amount | `grid` (one row) | [1,3,4], 6 | amount ≤ 20, ≤ 5 coins | `fibonacci-dp`, `greedy` |
| Longest Common Subsequence | 2-D table, then trace back | `form`: two `text` fields | `grid` + `arrows` | "ABCBDAB" / "BDCABA" | each ≤ 8 characters | `fibonacci-dp` |
| Longest Increasing Subsequence | O(n²) DP with predecessor links, then rebuild | `sort` | `grid`: input row + `dp` row | `[10,9,2,5,3,7,101,18]` | sort-input limits | `fibonacci-dp` |
| Grid DP | Count unique paths, optionally with blocked cells | `form`: rows, cols, blocked (`choice`: none / preset wall) | `grid` | 3 × 4, none | rows, cols ≤ 6 | `fibonacci-dp` |
| Greedy Algorithms | Greedy coin change; a preset where it fails | `search` (list = coins, target labelled "Amount") | `array` | [25,10,5,1], 63 | amount ≤ 200 | `array` |
| Union Find | Go through edges: union by rank and path compression; count components, flag the edge that closes a cycle | `graph` (no start) | `graph` + parent/rank `table` | `islandGraph`, plus a graph with a cycle | — | `graph`, `kruskal` |
| KMP | Build the failure table, then scan without backing up in the text | `form`: text, pattern | `panels`: match `grid` + failure-table `grid` | "ABABDABACDABABCABAB" / "ABABCABAB" | text ≤ 20, pattern ≤ 10 | `string` |
| Rabin-Karp | Rolling hash; compare characters only on a hash match | `form`: text, pattern | `grid`; window hash and pattern hash in `variables` | "GEEKS FOR GEEKS" / "GEEK" | text ≤ 20, pattern ≤ 10 | `string` |
| A* Search | f = g + h, Euclidean heuristic from node positions | `graph` with `needsGoal` | `graph` + g/h/f `table` | new grid-like graph with a wall, A → last node | — | `dijkstra` |
| Network Flow | Edmonds-Karp: BFS augmenting path, update the residual graph | `graph` (no start; source `S`, sink `T` by node id) | `graph` with "flow/capacity" edge labels | new 6-node network | — | `bfs` |
| Advanced Graph Algorithms | Kosaraju SCC: DFS finish order, reverse edges, DFS again | `graph` (directed, no start) | `graph`, nodes badged by component | new 8-node directed graph with 3 SCCs | — | `dfs`, `topological-sort` |

`compareWith` links (each id must exist): Counting Sort ↔ Radix Sort and `quick-sort`; Floyd-Warshall ↔ `dijkstra`, `bellman-ford`; Fibonacci DP ↔ `recursion-fundamentals`; Coin Change ↔ `greedy`; LCS ↔ `lis`; A* ↔ `dijkstra`, `bfs`; Union Find ↔ `kruskal`; KMP ↔ `rabin-karp`; Advanced Graph Algorithms ↔ `topological-sort`.

Graph presets added to `src/algorithms/graph/graphs.ts` with `makeGraph`, positioned in the existing 0–100 box.

## 3. Wiring

- Each lesson is registered in the same commit that adds it, together with its `lessons.test.ts` update, so the suite stays green after every commit.
- `src/lessons/registry.ts`: import and register the 20 lessons. Order follows the curriculum: within the algorithms block, intermediate lessons come after the current intermediate ones and advanced after the current advanced ones, in the curriculum's listed order.
- `src/lessons/lessons.test.ts`: `defaultSteps` gains a `form` case that runs `generate(presets[0].values)`, and a new test checks that every preset of a `form` lesson yields at least 3 steps. `EXPECTED_IDS` gains the 20 ids in that order; the algorithms count becomes 39; the adjacent-lesson assertion `adjacentLessons('prim').next` changes to whatever now follows `prim`.
- `src/lessons/curriculum.ts`: unchanged. The roadmap's Recursion and DP steps start resolving automatically.
- Big-O page and search pick up new lessons through the registry; verify, do not change.

## 4. Testing

- One unit test file per algorithm module (e.g. `src/algorithms/dp/dp.test.ts`), checking the generator's final state against a straightforward reference implementation on several inputs, plus that invalid or oversized input yields exactly one step.
- `callsLayout.test.ts`: frames never overlap, parents sit over their children, n-ary trees lay out.
- `roles.test.ts`: roles are collected from `grid`, `calls`, `buckets` and nested `panels`.
- `lessons.test.ts` already enforces content, quiz validity, prerequisite and compare links, and that each default visualization runs with code lines inside the code. It covers all 20 new lessons once they are registered.
- Before the PR: `npm test`, the type check, `npm run build:pages`, then run the app and step through every new lesson's default example.

## 5. Build order

Each step ends with tests and the type check green.

1. Infrastructure: the four views and renderers, `roles.ts`, `callsLayout`, graph edge labels and `needsGoal`, the `form` kind and `FormInput`.
2. Lessons on existing views: Counting Sort, Radix Sort, LCA, Floyd-Warshall, Greedy, Union Find, A*, Network Flow, Advanced Graph Algorithms.
3. Recursion: Recursion Fundamentals, Backtracking, Divide and Conquer.
4. Dynamic programming: Fibonacci DP, Knapsack, Coin Change, LCS, LIS, Grid DP.
5. Strings: KMP, Rabin-Karp.
6. Full verification (tests, type check, `build:pages`, manual run of every new lesson), then the PR.
