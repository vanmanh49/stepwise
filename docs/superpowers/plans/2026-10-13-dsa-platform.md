# Stepwise Platform Implementation Plan

> Written on 2026-10-18 as a record of how PR #1 was built (branch `feat/dsa-platform`, merge `266f6d0`). Each task matches a commit on that branch, and every box is checked because the work is done.

**Goal:** 17 interactive DSA lessons on one step engine, with home, catalogs, lesson pages, dashboard, Big O explorer, search, progress and themes.

**Architecture:** Pure generators turn input into `Step[]`, where each step holds a full `View` snapshot. A pure reducer moves through the steps, and a single `Visualizer` renders any view. Lessons are content files in a registry, and a curriculum list marks the rest as "Coming soon".

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Tailwind CSS v4, React Router, Motion, Lucide, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-dsa-platform-design.md`

## Global Constraints

- Step generators and structure operations are pure and never mutate their input.
- Every step has a `title` and a `why`. Every `codeLine` falls inside the lesson's code.
- An invalid operation returns one explanatory step and leaves the state unchanged.
- No state is shown by colour alone: each role has a border cue and a mark.
- Inputs accept −999 to 999. Sort inputs take 2–12 numbers and search inputs 1–12. Linear structures hold at most 10 items, the BST 12 nodes and the heap 15 items.
- At most 400 steps for 12 reversed items.

## Review Focus

1. **Invalid operations** (pop an empty stack, delete a missing value, an index out of range): expect one step explaining why, with the state unchanged. Covered in Task 5.
2. **Corrupt LocalStorage**: expect progress to load with the bad fields dropped, never a crash. Covered in Task 8.
3. **Reaching the last step while playing**: expect playback to stop, and Play to restart from 0. Covered in Task 1.
4. **Unknown or unreachable start nodes**: expect BFS, DFS and Dijkstra to say so instead of throwing. Covered in Task 4.
5. **Deep links on GitHub Pages** (`/stepwise/algorithms/bfs` opened directly): expect the lesson to load. Covered in Task 13 and checked by hand.

---

### Task 1: Step types and player engine (`e3f7139`)

**Files:** `src/types/visualization.ts`, `src/engine/player.ts`, `src/engine/usePlayer.ts`, `src/engine/player.test.ts`

**Produces:** `Step`, `View`, `Cell`, `Role`; `playerReducer`, `initialPlayer`, `SPEEDS = [0.5, 1, 1.5, 2]`; `usePlayer(steps, { autoPlay, loop })`.

- [x] Tests: starts paused at step 0 and 1×; next and prev clamp; a tick advances; a tick reaching the end stops; play at the end restarts; manual navigation pauses; seek clamps; restart; load keeps the speed; cannot play with 0 steps; speed changes without moving.
- [x] Implement the reducer and hook; tests pass.

### Task 2: Sorting algorithms and input parsing (`03c0cb4`)

**Files:** `src/algorithms/sorting/{cells,bubble,selection,insertion,merge,quick}.ts`, `sorting.test.ts`, `src/utils/parseInput.ts`, `parseInput.test.ts`

**Produces:** `toCells`, `withRoles`, `arrayView`, `swapCells`; `<name>Sort(values)` and `<name>SortSteps(values)` with `<name>SortCode`; `parseNumberList(text, {min, max})`, `randomArray(length)`.

- [x] Tests: no input mutation; each cell id kept through every step; every step explained with a valid code line; under 400 steps for 12 reversed items; each sort agrees with `Array.prototype.sort` on edge-case inputs; the parser accepts commas, spaces, trailing commas and negatives.
- [x] Implement; tests pass.

### Task 3: Searching algorithms (`f034f7b`)

**Files:** `src/algorithms/searching/{linear,binary}.ts`, `searching.test.ts`, `src/types/lesson.ts`

- [x] Tests: empty, single, present and missing values, negatives; the found cell is marked in the last step and nothing is marked when the target is missing; linear search returns the first duplicate; binary search handles 100 000 values and needs at most 4 comparisons for 12.
- [x] Implement; tests pass.

### Task 4: BFS, DFS and Dijkstra (`3cfda9a`)

**Files:** `src/algorithms/graph/{bfs,dfs,dijkstra,graphs,view}.ts`, `graph.test.ts`

**Produces:** the `Graph` type and the sample graphs `simple`, `weighted`, `islands`, `directed`; `neighbours(g, id)`, which returns neighbours sorted by id and defaults the weight to 1.

- [x] Tests: neighbours in both directions for undirected graphs and outgoing only for directed ones; BFS visits level by level and skips unreachable nodes; DFS goes deep first; Dijkstra's distances are correct and edge direction is respected; an unknown start is reported.
- [x] Implement, including the frontier list and Dijkstra's distance table with ∞; tests pass.

### Task 5: Data structure operations (`838ca2c`)

**Files:** `src/data-structures/{shared,array,linkedList,stack,queue,bst,heap,graph}.ts`, `structures.test.ts`

**Produces:** `StructureDef`, `StructureOp`; `refuse(state, view, title, why, codeLine)`, `MAX_LINEAR_ITEMS = 10`.

| Structure | Operations |
|---|---|
| Array | access, insert, delete, search, update, swap |
| Linked list | insert at head, insert at tail, search, delete |
| Stack | push, pop, peek |
| Queue | enqueue, dequeue, peek |
| BST (max 12 nodes) | insert, search, delete, inorder |
| Max-heap (max 15 items) | insert, extract max |

- [x] Tests: each operation's result; out-of-range, empty and full cases explained in one step with the state unchanged; peek does not change anything.
- [x] Implement; tests pass.

### Task 6: Visualizer, renderers and code panel (`4f2786b`)

**Files:** `src/components/visualization/{Visualizer,Controls,Explanation,Legend,ErrorBoundary,roles}.ts(x)`, `renderers/*`, `src/components/code/CodePanel.tsx`, `src/index.css`

- [x] Add the role tokens for light and dark (`--role-<role>`, `--role-<role>-fg`) and `ROLE_META` with a cue and mark per role.
- [x] Add one renderer per view kind. The heap draws its tree and array together. `layoutTree` and `heapToTree` are tested in `treeLayout.test.ts`.
- [x] Keyboard: ←, → and Space. Motion respects reduced-motion settings.

### Task 7: Lesson model, registry and the 17 lessons (`9409670`)

**Files:** `src/types/lesson.ts`, `src/lessons/{registry,curriculum}.ts`, `src/lessons/{data-structures,algorithms}/*.ts`, `lessons.test.ts`

- [x] Tests: the 17 lessons appear in learning order; previous and next links stay within a category; paths look like `/<category>/<id>`; every reference points to a lesson that exists; content is complete; each quiz is valid (the answer index is in range); each default visualization runs with valid code lines; the curriculum lists every topic once and agrees with lesson metadata.
- [x] Write the lessons; tests pass.

### Task 8: Progress store (`a49e756`)

**Files:** `src/store/progress.ts`, `progress.test.ts`

- [x] Tests: `sanitizeProgress` keeps valid fields and drops malformed entries and zero-total scores; `computeStreak` handles no activity, a streak ending today or yesterday, a missed day, duplicates, unsorted days and month boundaries; `percent` rounds and handles an empty total; the actions work as intended.
- [x] Implement with Zustand `persist` (key `dsa-progress`), merging stored data through `sanitizeProgress`.

### Task 9: Lesson page, inputs, quiz and sidebar (`602108c`)

**Files:** `src/pages/LessonPage.tsx`, `src/components/lesson/*`, `src/components/quiz/Quiz.tsx`, `src/components/navigation/{CourseSidebar,Drawer}.tsx`, `src/components/visualization/inputs/*`

- [x] Add the inputs for sort, search, structure and graph, with the spec's limits and error messages.
- [x] Lay out the lesson page sections in the spec's order. The quiz records the best score, and a perfect score completes the lesson.

### Task 10: Home, catalogs, dashboard, Big O explorer and search (`142e06f`)

**Files:** `src/pages/{Home,Catalog,Dashboard,BigO}.tsx`, `src/components/bigo/*`, `src/components/navigation/{search,SearchPalette}.ts(x)`, `src/components/progress/Roadmap.tsx`, `MiniPlayer.tsx`

- [x] Tests: `COMPLEXITIES` lists six classes in growth order, its counts are never below 1, and `formatOps` and `curveForNotation` work. Search: an empty query returns nothing; title prefix beats substring beats keyword; live lessons come first; matching ignores case; at most 8 results; only live lessons get a path.
- [x] Implement. Ctrl+K and Cmd+K open search.

### Task 11: README and polish (`30293f1`)

- [x] Write the README covering features, stack, commands and architecture, and load routes on demand in `App.tsx`.

### Task 12: Review fixes (`9954362`)

- [x] Fix the findings of the whole-branch review: a fresh stage identity per run, so animations do not carry over between runs; step explanations reworded; larger touch targets. Tests were added in `searching.test.ts`, `structures.test.ts` and `progress.test.ts`.

### Task 13: Search dialog redesign and GitHub Pages build (`14e41af`, `a4c6966`)

- [x] Restyle `SearchPalette`.
- [x] Add `build:pages` (base `/stepwise/`, with `index.html` copied to `404.html`), and take `BrowserRouter`'s basename from `BASE_URL`.

### Verification and PR

- [x] `npm run typecheck` clean; `npm test` 315 passing; `npm run build` succeeds.
- [x] Browser pass at desktop and 390px widths, in light and dark: every lesson plays to the end with the right code line highlighted, with no console errors.
- [x] PR #1 opened and merged on 2026-10-13.
