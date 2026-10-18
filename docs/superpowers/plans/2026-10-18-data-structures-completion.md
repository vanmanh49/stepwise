# Data Structures Track Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the nine remaining Data Structures lessons (hash table, trie, AVL, red-black, disjoint set, segment tree, Fenwick tree, B-tree, graph representations) as interactive structure lessons.

**Architecture:** `StructureDef` becomes generic over its state and gains word arguments; four views gain small options and one `trie` view is added; each lesson is a pure structure module (`src/data-structures/<name>.ts`, returns steps + next state) plus a lesson content file, registered in curriculum order.

**Tech Stack:** React 19, TypeScript strict, Vite, Vitest, motion, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-18-data-structures-completion-design.md`

## Global Constraints

- Operations must not mutate `state`; invalid operations return one explanatory step and the same state (use `refuse`-style helpers).
- Word arguments: trimmed, lower-cased, must match `WORD_PATTERN = /^[a-z]{1,8}$/`; error text "<Op>: enter a word of 1–8 letters (a–z) for <Label>."
- Limits: hash table 12 keys; trie 10 words; AVL, red-black 15 nodes; B-tree 15 keys; disjoint set elements 0–9; segment/Fenwick arrays of 8; graph nodes 0–5.
- Every `codeLine` points inside the lesson's `code`; steps have `title`, `why`, and `view`.
- Lesson content passes `src/lessons/lessons.test.ts` (quiz ≥4 questions, ≥3 types, ≥1 with a view; howItWorks ≥4; etc.).
- No AI attribution in commits or PR text.
- Full suite: `.superpowers/t.sh` (last line = counts). Typecheck: `npm run typecheck`.

## Review Focus

- Deleting the last key/word/node, and operating on an empty structure: should give a sensible step, never a crash or an empty step list.
- Red-black delete of a node whose replacement is nil (double black at a nil position): fix-up must track the parent, not the missing node.
- B-tree delete where the merge empties the root, and delete of a key in an inner node whose predecessor leaf then underflows.
- Hash table put of an existing key at the 12-key limit (an update must still work), and resize ordering (each key's new bucket).
- Graph representations in directed mode: `(u,v)` and `(v,u)` are different edges; toggling directed→undirected merges a pair of opposite edges into one.

Each line is pinned by a named test in the owning task below.

---

### Task 1: Generic structure framework with word arguments

**Files:**
- Modify: `src/types/lesson.ts` (StructureArg, StructureOp<S>, StructureDef<S>, config holds `StructureDef<unknown>`)
- Modify: `src/data-structures/shared.ts` (add `WORD_PATTERN`, `parseOpFields`)
- Modify: `src/components/visualization/inputs/StructureInput.tsx` (use `parseOpFields`; text fields `w-24`, `inputMode="text"`, `spellCheck={false}`)
- Modify: `src/lessons/lessons.test.ts` (`defaultSteps` passes numbers and words)
- Modify: `src/data-structures/structures.test.ts` (`run` helper passes `[]` words)
- Create: `src/data-structures/random.testutil.ts`, `src/data-structures/contract.test.ts`, `src/data-structures/shared.test.ts`

**Interfaces:**
- Produces:
  - `type StructureArg = { name: string; label: string; sample: number } | { name: string; label: string; sample: string; text: true }`
  - `StructureOp<S = number[]>.run(state: S, args: number[], words: string[]): { steps: Step[]; state: S }`
  - `StructureDef<S = number[]> { initial: S; view(state: S): View; ops: StructureOp<S>[]; code: string }`
  - `parseOpFields(op: { label: string; args: StructureArg[] }, fields: string[]): { ok: true; args: number[]; words: string[] } | { ok: false; error: string }`
  - `random.testutil.ts`: `rng(seed: number): () => number` (mulberry32), `pick<T>(r, items: T[]): T`, `int(r, lo, hi): number`, `deepFreeze<T>(x: T): T`
  - `sampleArgs(op, r)`/`sampleWords(op, r)` live in `contract.test.ts`

- [ ] **Step 1: Write failing tests** — `shared.test.ts`: `parseOpFields` with a numeric and a text arg: `[' 12 ', ' Cat ']` → `{ ok: true, args: [12], words: ['cat'] }`; `['12', 'c4t']` → error `"Put: enter a word of 1–8 letters (a–z) for Key."`; `['x', 'cat']` → `"Put: enter a whole number between -999 and 999 for Value."` (op label `Put`, args `Value` numeric then `Key` text — order the test fields to match). `contract.test.ts`: for every lesson with `visualization.kind === 'structure'`, seeds 1–3, 50 random ops each: deep-frozen input state, `steps.length ≥ 1`, every `codeLine` in `1..code lines`. Numeric args: `pick` of `sample`, `int(0, 9)`, `int(-5, 99)`; words: `pick` of `sample`, `['cat','car','cart','dog','do','a','owl','bee','zebra']`.
- [ ] **Step 2: Run** `npx vitest run src/data-structures/shared.test.ts src/data-structures/contract.test.ts` — Expected: FAIL (`parseOpFields` missing).
- [ ] **Step 3: Implement** types, `parseOpFields`, StructureInput wiring (calls `op.run(state, args, words)`), update `defaultSteps` and the `run` test helper.
- [ ] **Step 4: Run** the two files, then `npm run typecheck` and `.superpowers/t.sh` — Expected: all pass (existing structures satisfy the contract).
- [ ] **Step 5: Commit** `feat: generic structure state and word arguments`

### Task 2: View extensions and the trie view

**Files:**
- Modify: `src/types/visualization.ts` (`TreeNode.badge?`, `TreeNode.color?`, `BucketsView.direction?`, `BTreeView.linked?`, new `TrieView`, add to `View`)
- Modify: `TreeRenderer.tsx` (badge + colour + top padding), `SvgNode.tsx` (`tone?: 'red' | 'black'`), `BucketsRenderer.tsx` (`direction: 'down'` → `flex-col`, `ValueBox wide`), `BTreeRenderer.tsx` (skip leaf links when `linked === false`), `renderers/index.tsx` (trie case), `src/index.css` (`--node-red`, `--node-black`, `--node-on-color` in light, dark media query, and `[data-theme=dark]`)
- Modify: `callsLayout.ts` (`layoutCalls<T extends { id: string; parent?: string }>(frames: T[])`)
- Create: `TrieRenderer.tsx`, `src/components/visualization/renderers/trieLayout.test.ts`

**Interfaces:**
- Produces: `TrieView { kind: 'trie'; nodes: { id: string; parent?: string; letter: string; word?: string; role: Role }[] }`; `TreeNode { …; badge?: string; color?: 'red' | 'black' }`; `BucketsView.direction?: 'up' | 'down'`; `BTreeView.linked?: boolean`.

- [ ] **Step 1: Write failing test** `trieLayout.test.ts`: `layoutCalls` on trie nodes `[{id:'t:',letter:''},{id:'t:c',parent:'t:'},{id:'t:ca',parent:'t:c'},{id:'t:d',parent:'t:'}]` places `t:ca` at x 0, `t:d` at x 1, `t:` at x 0.5, y = depth. (Fails to typecheck/compile on the widened generic before the change? It passes at runtime — so the RED is `npm run typecheck`: Expected error that `letter` is not in `CallFrame`.)
- [ ] **Step 2: Run** `npm run typecheck` — Expected: FAIL on the test's argument type.
- [ ] **Step 3: Implement** the type changes and renderers. Coloured node rules from the spec §2. Trie root: `r = 8` empty circle; word label 11px mono below the node at `y + NODE_RADIUS + 12`; wrapper `div.overflow-x-auto` like BTreeRenderer; aria label "Trie with words …".
- [ ] **Step 4: Run** `npx vitest run src/components` and `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: tree badges and colours, chain buckets, unlinked B-trees, trie view`

### Task 3: Hash Table

**Files:** Create `src/data-structures/hashTable.ts`, `hashTable.test.ts`, `src/lessons/data-structures/hash-table.ts`; modify `src/lessons/registry.ts`, `src/lessons/lessons.test.ts` (EXPECTED_IDS, DS count).

**Interfaces:**
- Produces: `interface HashState { buckets: [string, number][][] }`; `hashOf(key: string, capacity: number): number` (`h = (h*31 + code) % capacity` per char); `hashTableStructure: StructureDef<HashState>` with ops `put(value; key)` (args: `Key` text sample `'emu'`, `Value` numeric sample `4`), `get`, `remove`; `MAX_KEYS = 12`, `LOAD_LIMIT = 0.75`.

- [ ] **Step 1: Failing tests** — `hashOf('cat', 8)` equals manual `((99*31+97)*31+116)` folding with mod each step; initial state has a bucket with ≥2 keys; put new key appends to chain end; put existing key updates in place (same size); get walks chain (one compare step per entry visited, last step role `found`); remove deletes; "resize at the 7th key" → capacity 16 and every key in `hashOf(key,16)`; "updating a key at the 12-key limit works" (Review Focus); random sequence vs `Map` (seed 7, 200 ops) with load ≤ 0.75 after each successful put of a new key.
- [ ] **Step 2: Run** `npx vitest run src/data-structures/hashTable.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** structure; view = buckets `direction: 'down'`, cells `id: 'k:'+key`, value `` `${key}: ${value}` ``, input row = the key's characters while hashing; `variables` include `h`, `capacity`, `load`. Lesson file (beginner, prerequisites `array`, `linked-list`, curves `['1','n']`, complexity rows Put/Get/Remove avg O(1) worst O(n), Resize O(n)). Register after `queue`.
- [ ] **Step 4: Run** structure test, `src/lessons/lessons.test.ts`, contract test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Hash Table lesson`

### Task 4: Trie

**Files:** Create `src/data-structures/trie.ts`, `trie.test.ts`, `src/lessons/data-structures/trie.ts`; register after `graph`.

**Interfaces:** `trieStructure: StructureDef<string[]>` (sorted unique words), ops `insert`, `search`, `prefix` (label "Starts with"), `delete`; each takes one text arg (`Word`/`Prefix`, samples `'card'`, `'car'`, `'ca'`, `'cat'`); `MAX_WORDS = 10`; `trieView(words, roles?: Record<string, Role>): TrieView`.

- [ ] **Step 1: Failing tests** — node count for `['car','cart','cat']` is 6 (root + c,a,r,t,t); insert creates exactly the missing nodes (one step per letter); search of a prefix that is not a word answers false and says so; starts-with true; delete `'car'` keeps `cart` nodes; delete `'cart'` from `['car','cart']` prunes one node; delete last word leaves only the root (Review Focus); random vs `Set` (seed 11, 200 ops) plus "every leaf node ends a word".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; lesson (intermediate, prerequisites `binary-tree`, `string`, curves `['n']` — cost O(L)).
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Trie lesson`

### Task 5: AVL Tree

**Files:** Create `src/data-structures/avl.ts`, `avl.test.ts`, `src/lessons/data-structures/avl-tree.ts`; register after `trie`.

**Interfaces:** `avlStructure: StructureDef<number[]>` (state = preorder; rebuilt with `build` from `bst.ts`), ops `insert`, `search`, `delete` (samples 25, 20, 30), `MAX_AVL_NODES = 15`; reuse `treeView` from `bst.ts`, extended with an optional badges map — add `badges?: Record<number, string>` param.

- [ ] **Step 1: Failing tests** — named rotations: insert 30,20,10 → one "Right rotation" step (LL), root 20; 10,20,30 → RR; 30,10,20 → LR (two rotation steps); 10,30,20 → RL; delete causing rotation (`[20,10,30,40]` delete 10 → root 30); every step title of a rebalanced insert names the case; random (seed 5, 300 ops) keeps BST order, balance factors in −1..1, matches sorted set; delete of the last node yields empty tree view.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with immutable nodes carrying height; badge = balance factor formatted `+1`/`0`/`-1`/`+2`/`-2`. Lesson (advanced, prerequisite `binary-search-tree`, curves `['log']`, compareWith `['binary-search-tree']`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: AVL Tree lesson`

### Task 6: Red-Black Tree

**Files:** Create `src/data-structures/redBlack.ts`, `redBlack.test.ts`, `src/lessons/data-structures/red-black-tree.ts`; register after `avl-tree`.

**Interfaces:** `type RBState = [value: number, red: boolean][]` (preorder); `redBlackStructure: StructureDef<RBState>`, ops `insert`, `search`, `delete`; `MAX_RB_NODES = 15`. Implementation works on a mutable pointer tree (nodes with parent links, a shared NIL is not needed — track `x` and `xParent`) built from a cloned state, then serialises back to preorder; views from `TreeNode.color`.

- [ ] **Step 1: Failing tests** — named insert cases: into `[[10,false]]` insert 5 then 15 then 1 → "uncle is red" recolour step; triangle case title contains "Triangle"; line case title contains "Line"; root recoloured black. Named delete cases each produce a step title containing: "Sibling is red", "both black", "near child", "far child"; a "(mirrored)" case appears; delete a red leaf has no fix-up step; delete a black leaf with nil replacement fixes up (Review Focus). Random (seed 9, 400 ops): BST order, black root, no red-red, equal black heights, matches sorted set.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** CLRS insert-fixup and delete-fixup. Lesson (advanced, prerequisite `binary-search-tree`, compareWith `['avl-tree']`, curves `['log']`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Red-Black Tree lesson`

### Task 7: Disjoint Set

**Files:** Create `src/data-structures/disjointSet.ts`, `disjointSet.test.ts`, `src/lessons/data-structures/disjoint-set.ts`; register after `red-black-tree`.

**Interfaces:** `interface DSUState { parent: number[]; rank: number[] }` (length 10); `disjointSetStructure: StructureDef<DSUState>`, ops `find(x)`, `union(a, b)`, `connected(a, b)` (samples 3; 4,8; 1,3). Initial: `parent = [0,0,1,2,4,4,6,7,7,9]`, `rank = [3,0,0,0,1,0,0,1,0,0]` (find 3 compresses a 3-hop path). Out-of-range elements → refusal.

- [ ] **Step 1: Failing tests** — find(3) from initial: three hop steps then one compression step; afterwards `parent[3] = parent[2] = 0`; union of equal ranks raises rank; union by rank attaches the lower root under the higher; union within one set says "already"; random (seed 3, 300 ops) connectivity equals a naive merge reference, and each tree's height ≤ its root's rank.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; view = panels [graph forest (`directed: true`, edges child→parent, root badge `r<rank>`), array of parents with ids `p<i>`]. Lesson (advanced, prerequisite `array`, curves `['1','log']`, compareWith none).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Disjoint Set lesson`

### Task 8: Segment Tree

**Files:** Create `src/data-structures/segmentTree.ts`, `segmentTree.test.ts`, `src/lessons/data-structures/segment-tree.ts`; register after `disjoint-set`.

**Interfaces:** `segmentTreeStructure: StructureDef<number[]>` (8 values, initial `[5, 3, 7, 9, 6, 4, 1, 2]`), ops `query(l, r)` (label "Range sum", samples 2, 6), `update(i, value)` (samples 3, 1). Node ids `s<lo>-<hi>`.

- [ ] **Step 1: Failing tests** — query(2,6) returns sum 27 in the last step's `variables.sum`; roles: `[0,1]` discarded, `[2,3]` found, `[4,5]` found, `[6,6]` found; update(3,1) last step root value 29; l > r or out of range refused; random (seed 13, 200 ops) every query equals brute force.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; tree via `TreeView` with `value` = sum and `badge` = `lo–hi` or `lo`. Lesson (advanced, prerequisites `binary-tree`, `prefix-sum`, curves `['log','n']`, compareWith `['fenwick-tree']` after Task 9 exists — add it in Task 9).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Segment Tree lesson`

### Task 9: Fenwick Tree

**Files:** Create `src/data-structures/fenwick.ts`, `fenwick.test.ts`, `src/lessons/data-structures/fenwick-tree.ts`; register after `segment-tree`; add `compareWith: ['segment-tree']` here and `['fenwick-tree']` to segment-tree.

**Interfaces:** `fenwickStructure: StructureDef<number[]>` (same initial as Task 8), ops `prefix(i)` (sample 6), `range(l, r)` (2, 6 — 1-based), `add(i, delta)` (3, 2); `fenwickArray(values): number[]` (1-based, index 0 unused).

- [ ] **Step 1: Failing tests** — `fenwickArray([5,3,7,9,6,4,1,2])` = `[_,5,8,7,24,6,10,1,37]`; prefix(6) visits i = 6, 4 (two add steps) → 34; add(3,2) visits 3, 4, 8; range(2,6) = 29; i outside 1–8 refused; random (seed 17, 200 ops) vs brute force.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; grid rows `a[i]`, `tree[i]`, `covers`, `i in binary` (4-bit, lowest set bit cell role `compare`). Lesson (advanced, prerequisite `prefix-sum`, curves `['log']`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Fenwick Tree lesson`

### Task 10: B-Tree

**Files:** Create `src/data-structures/bTree.ts`, `bTree.test.ts`, `src/lessons/data-structures/b-tree.ts`; register after `fenwick-tree`.

**Interfaces:** `interface BNode { keys: number[]; children: BNode[] }`; `bTreeStructure: StructureDef<BNode>` (initial built by inserting `[10, 20, 5, 6, 12, 30, 7, 17]`), ops `insert`, `search`, `delete` (samples 15, 12, 6); `MAX_BTREE_KEYS = 15`; view `BTreeView` with `label: 'B-tree of order 4'`, `linked: false`, node ids by path (`b`, `b.0`, `b.0.1`).

- [ ] **Step 1: Failing tests** — inserting 1..4 into empty: split step, root `[3]`, leaves `[1,2]`, `[4]`; named delete cases: "borrow from the left", "borrow from the right", "merge", root shrink (height decreases) — each from a hand-built state; delete of an inner key uses the predecessor and fixes a resulting underflow (Review Focus); delete until empty leaves an empty root leaf; random (seed 21, 300 ops) keeps 1–3 keys per non-root node, equal leaf depth, sorted inorder keys equal sorted set.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; lesson (advanced, prerequisite `binary-search-tree`, curves `['log']`, text explains B+ trees and names the SQL Indexes lesson).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: B-Tree lesson`

### Task 11: Graph Representations and catalog

**Files:** Create `src/data-structures/graphReps.ts`, `graphReps.test.ts`, `src/lessons/data-structures/advanced-graph-structures.ts`; modify `src/lessons/curriculum.ts` (title "Graph Representations"); register last in DS; update `lessons.test.ts` (`adjacentLessons('graph').next?.id` is `'trie'`, DS count 19).

**Interfaces:** `interface GraphRepsState { directed: boolean; edges: [number, number][] }`; initial undirected edges `[[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[4,5]]`; `graphRepsStructure: StructureDef<GraphRepsState>`, ops `add(u,v)` (samples 3, 5), `remove(u,v)` (1, 2), `has(u,v)` (0, 4), `neighbours(u)` (sample 4), `toggle` (no args, label "Toggle directed").

- [ ] **Step 1: Failing tests** — has(0,4): three steps (matrix, list, edge list) with `variables` cost counts `1`, `2` (node 0's list length), `7`; neighbours(4): matrix row read 6 cells; directed mode treats `(u,v)` and `(v,u)` as different; toggle directed→undirected merges `[1,2]` and `[2,1]` into one edge (Review Focus); self-loop and duplicate refused; random (seed 23, 200 ops): matrix, list and edge list from the view describe one edge set.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; lesson (advanced, prerequisite `graph`, curves `['1','n','n2']`, rows: Has edge, Neighbours, Add edge, Memory).
- [ ] **Step 4: Run** `.superpowers/t.sh`, `npm run typecheck`, `npm run build:pages` — Expected: all green.
- [ ] **Step 5: Commit** `feat: Graph Representations lesson`

### Task 12: Browser pass

- [ ] Run `npx vite --port 5199 --strictPort` in the background; for each of the nine lessons at `http://localhost:5199/data-structures/<id>` at 375px in light and dark: run each operation once, check no console errors, no horizontal page scroll (wide views scroll inside their own box), colours readable.
- [ ] Fix anything found with a failing test first where the defect is in pure code; commit `fix: …`.
