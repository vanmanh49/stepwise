# Batch 1 Lessons Implementation Plan

> Written on 2026-10-18 as a record of how PR #2 was built (branch `feat/batch-1-lessons`, merge `3ccd3c3`). Each task matches a commit on that branch, and every box is checked because the work is done.

**Goal:** Twelve new lessons (String, Binary Tree, Priority Queue, Two Pointers, Sliding Window, Prefix Sum, Heap Sort, Tree Traversal, Topological Sort, Bellman-Ford, Kruskal, Prim) on the existing renderers.

**Architecture:** Add one new input kind (`text`) and make the search input's second field configurable. Everything else is new step generators, sample graphs and lesson content registered in the existing registry.

**Tech Stack:** React 19, TypeScript (strict), Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-batch-1-lessons-design.md`

## Global Constraints

- No new renderers.
- The platform's constraints still apply: pure generators; every step explained with a valid code line; invalid operations give one step and leave the state unchanged.
- Text is at most 12 characters, with no emoji. Binary Tree and Priority Queue hold at most 15 items.
- Each new lesson is registered in learning order and passes the content and quiz checks in `lessons.test.ts`.

## Review Focus

1. **Text with emoji or more than 12 characters**: expect the field's error message, not broken cells. Covered in Task 1.
2. **A window size larger than the list, or a target sum above 999**: expect the field-specific error, or a valid run for sums up to 4 digits. Covered in Task 3.
3. **Graphs with a cycle (topological sort) or a negative cycle (Bellman-Ford)**: expect the lesson to report it rather than give a wrong order or distances. Covered in Task 6.
4. **Disconnected graphs for Kruskal and Prim**: expect a forest from Kruskal, and from Prim a tree of the start's component with a note saying so. Covered in Task 7.
5. **Text typed but not set before pressing an operation**: expect the operation to use the typed text (or show its error). Covered in Task 9.

---

### Task 1: Text input and the String lesson (`15efbba`)

**Files:** `src/types/lesson.ts` (`TextDef`, `TextOp`, `{ kind: 'text' }`), `src/utils/parseInput.ts` (`parseText`, `MAX_TEXT_LENGTH`), `inputs/TextInput.tsx`, `inputs/LessonVisualization.tsx`, `src/data-structures/string.ts`, `string.test.ts`, `src/lessons/data-structures/string.ts`

- [x] Tests: charAt leaves the text unchanged; concat builds a new string and refuses empty additions and results over 12 characters; reverse keeps each character's identity; the palindrome check points at the first mismatch; `parseText` rejects empty text, emoji and long text.
- [x] Implement; register the lesson.

### Task 2: Binary Tree and Priority Queue (`9e72176`)

**Files:** `src/data-structures/{binaryTree,priorityQueue}.ts`, `trees.test.ts`, the two lesson files; Binary Search Tree's prerequisites now include `binary-tree`.

- [x] Tests: `levelOrderTree` links i to 2i+1 and 2i+2; insert fills the first free level-order slot; duplicates and an empty start are allowed; the tree refuses a 16th node; height and the level-order walk are correct; every parent of the priority queue is no larger than its children; dequeue returns the smallest; the empty and full cases take one step; peek changes nothing.
- [x] Implement; register both lessons.

### Task 3: Two Pointers, Sliding Window and Prefix Sum (`8accf94`)

**Files:** `src/algorithms/techniques/{twoPointers,slidingWindow,prefixSum}.ts`, `techniques.test.ts`, `inputs/SearchInput.tsx`, `src/types/lesson.ts` (`targetLabel`, `targetHelp`, `randomTarget`), the three lesson files

- [x] Tests: two pointers finds the pair or returns null and never pairs a value with itself; sliding window finds the largest sum, picks the first window on a tie and stays within n + 3 steps; prefix sums include a leading 0 and answer range sums by subtraction, including on short and empty lists.
- [x] The search input now uses field-specific errors and accepts a second value of up to 4 digits.

### Task 4: Heap Sort (`19d2464`)

**Files:** `src/algorithms/sorting/heap.ts`, `heap.test.ts`, `src/lessons/algorithms/heap-sort.ts`

- [x] Tests: no input mutation; the heap shows in every step and the result ends sorted; item identities are kept; a placed item never becomes unsorted again; every step has a valid code line; trivial inputs stay small.

### Task 5: Tree Traversal (`fb0a4ee`)

**Files:** `src/algorithms/tree/traversal.ts`, `traversal.test.ts`, `src/lessons/algorithms/tree-traversal.ts`

- [x] Tests: all four orders on a full tree, an incomplete tree, a single node and an empty tree; nodes are highlighted in traversal order; an empty tree is explained in one step; the operations never change the tree.

### Task 6: Topological Sort and Bellman-Ford (`400c2a5`)

**Files:** `src/algorithms/graph/{topological,bellmanFord}.ts`, `graphs.ts` (adds `courses`, `build`, `negative`, `negative-cycle`), `graph2.test.ts`, the two lesson files

- [x] Tests: the sample graphs are acyclic or negative where the lessons need it; topological sort returns null on a cycle and orders by id when there are no edges; Bellman-Ford's distances are correct with a negative edge, it agrees with Dijkstra when weights are non-negative, it detects a negative cycle, stops early, and explains an unknown start in one step.

### Task 7: Kruskal and Prim (`49f51ce`)

**Files:** `src/algorithms/graph/{kruskal,prim}.ts`, `mst.test.ts`, the two lesson files

- [x] Tests: Kruskal takes the cheapest edges that form no cycle and builds a forest when disconnected; Prim matches Kruskal's weight from every start, spans only its own component and says so, and handles a single node and an unknown start.

### Task 8: Curriculum, Big O table and README (`9c87204`)

- [x] Remove `bst-operations` from the curriculum and add "bst operations" to the BST keywords. A search test confirms the old name still finds the lesson.
- [x] Add the Big O mappings `O(E log E)`, `O(E log V)` and `O(V × E)`, with tests. Update the README lesson list.

### Task 9: Review fixes (`89bcff2`)

- [x] Fix the whole-branch review findings: operations use typed text that was not set first; wording for singular and plural, single-value windows and bracketed negative numbers; Bellman-Ford's wording after an early stop; stricter input validation. Each fix has a test in the related test file.

### Verification and PR

- [x] `npm run typecheck` clean; `npm test` 496 passing; `npm run build` succeeds.
- [x] Browser pass at desktop and 390px widths: every new lesson, operation and sample graph plays to the end with no console errors.
- [x] PR #2 opened and merged on 2026-10-13.
