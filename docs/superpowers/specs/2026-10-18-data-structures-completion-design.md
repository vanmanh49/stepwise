# Data Structures track completion

Date: 2026-10-18
Status: approved design (user asked to proceed to the plan and native execution)

## Goal

Turn the nine "Coming soon" Data Structures topics into live lessons: **Hash Table**, **Trie**, **AVL Tree**, **Red-Black Tree**, **Disjoint Set**, **Segment Tree**, **Fenwick Tree**, **B-Tree / B+ Tree** and **Graph Representations** (topic id `advanced-graph-structures`). Data Structures goes from 10 to 19 live lessons, and no topic in the catalog stays "Coming soon".

## Decisions

- **One spec, one plan, one PR** on branch `data-structures-completion`; when built: commit, PR, merge.
- **Every lesson is an interactive structure lesson** (`visualization.kind === 'structure'`): the learner runs operations on persistent contents and watches each one step by step, as in the existing BST, heap and stack lessons.
- **Balanced trees support insert, search and delete**, with deletion shown in full: rotations for AVL, recolouring and double-black fix-up for red-black, borrow and merge for the B-tree.
- **Advanced Graph Structures teaches graph representations**: adjacency matrix, adjacency list and edge list side by side for the same graph. The topic keeps its id; its title becomes "Graph Representations".
- **The DS disjoint-set lesson is separate** from the Algorithms union-find lesson. It is about the structure (parent array, union by rank, path compression); the Algorithms lesson stays about using it.

## 1. Structure framework

`StructureDef` and `StructureOp` become generic over their state so a structure can hold words, maps or trees, not only numbers:

```ts
export type StructureArg =
  | { name: string; label: string; sample: number }
  | { name: string; label: string; sample: string; text: true };

export interface StructureOp<S = number[]> {
  id: string;
  label: string;
  args: StructureArg[];
  /** Must not mutate `state`. Numbers arrive in `args` and words in `words`, each in field order. */
  run(state: S, args: number[], words: string[]): { steps: Step[]; state: S };
}

export interface StructureDef<S = number[]> { initial: S; view(state: S): View; ops: StructureOp<S>[]; code: string }
```

- The default `S = number[]` keeps every existing structure unchanged; they ignore `words`.
- `VisualizationConfig`'s structure entry holds a `StructureDef<unknown>`.
- **Operation form:** a text field is wider (`w-24`) and accepts a word: it is trimmed and lower-cased, and must match `WORD_PATTERN = /^[a-z]{1,8}$/` (exported from `src/data-structures/shared.ts`). Otherwise the form shows "<Op>: enter a word of 1–8 letters (a–z) for <Label>." Numeric fields keep their rule (a whole number from -999 to 999).
- Operations that can't run (a full structure, a missing key, an index out of range) return one explanatory step and the same state, as now.
- The lessons test runs each structure's first operation with its samples, as now, passing text samples as `words`.

## 2. Views

Existing views are extended. One new view is added.

- **Tree** (`TreeNode`) gains `badge?: string`, drawn above the node (AVL balance factors, segment-tree ranges), and `color?: 'red' | 'black'` (red-black trees). The renderer adds top padding when any node has a badge.
  - A coloured node at the `default` role is filled with `--node-red` or `--node-black`, with white text.
  - With any other role it takes the role's fill, and its border is drawn 4px wide in its colour, so the highlight and the colour both show.
  - The tokens are defined for light and dark themes. The aria label adds "red" or "black" per node.
- **Buckets** gains `direction?: 'up' | 'down'` (default `'up'`, the radix-sort look). Hash-table chains use `'down'`, so a chain reads from the head.
- **B-tree** gains `linked?: boolean` (default `true`, the SQL index look). The DS B-tree sets `false`: there are no leaf links, and keys live in every node.
- **New `trie` view:** `{ kind: 'trie'; nodes: { id; parent?: string; letter: string; word?: string; role }[] }`.
  - The root has letter `''` and no parent, and is drawn as a small empty circle.
  - Each other node is a circle showing its letter. A node that ends a word shows the word in small text below it.
  - Layout reuses `layoutCalls`. Its parameter is widened to `{ id: string; parent?: string }[]`.
  - The new view needs a case in `StepView`, and the renderer scrolls sideways on narrow screens like the B-tree.

Panels, graph, grid and array views are used as they are.

## 3. Lessons

Each lesson has a structure in `src/data-structures/<name>.ts` with its own test file, and a lesson in `src/lessons/data-structures/<id>.ts`. The code panel shows TypeScript, and each step's `codeLine` points into it. Limits keep every step readable; hitting one gives the usual explanatory step.

### Hash Table (`hash-table`, beginner)

- **State:** separate chaining; `{ buckets: [key: string, value: number][][] }`. Starts with 8 buckets.
- **Hash:** `h = (h * 31 + charCode) mod capacity`, one step per character, with the characters of the key drawn as an input row. The current character is highlighted.
- **Operations:**
  - **Put(key, value):** inserts at the end of the chain, or updates an existing key.
  - **Get(key)** and **Remove(key):** walk the chain, one step per entry compared.
- **Resize:** after a put that raises the load factor above 0.75 (the 7th key in 8 buckets), capacity doubles to 16 and every key is rehashed, one step per key moved. The steps show the load factor.
- **Limits:** at most 12 keys.
- **Initial contents:** chosen so that two keys share a bucket.
- **View:** buckets (`direction: 'down'`); cells read `key: value`; the input row holds the key being hashed.

### Trie (`trie`, intermediate)

- **State:** a sorted set of words; at most 10 words of 1–8 letters.
- **Operations:**
  - **Insert(word):** walks letter by letter, creating missing nodes and marking the end of the word.
  - **Search(word)** and **Starts with(prefix):** walk letter by letter, then answer whether the walk succeeded and whether it ended at a word.
  - **Delete(word):** unmarks the end of the word and prunes nodes no other word uses, one step per node removed.
- **View:** trie. Node ids are the prefix (`t:` + prefix), so nodes keep their place across steps.

### AVL Tree (`avl-tree`, advanced)

- **State:** the preorder of the tree. Rebuilding by BST insertion of a preorder gives the same shape.
- **Operations:**
  - **Insert / Delete:** the BST step first, as in the BST lesson; delete uses the inorder successor. Then the walk back up to the root, one step per ancestor, with its height and balance factor updated.
  - Each rotation is its own step (LL, RR, LR as two rotations, RL as two rotations), with a before/after explanation.
  - **Search:** as in the BST lesson.
- **Limits:** at most 15 nodes.
- **View:** tree; each node's badge is its balance factor (`0`, `+1`, `-1`, `+2`, `-2`; left height minus right height).

### Red-Black Tree (`red-black-tree`, advanced)

- **State:** the preorder as `[value, red][]`; colours ride along when rebuilt.
- **Insert:** the BST insert of a red node, then the fix-up, one step per case:
  - red uncle: recolour and move up;
  - black uncle, triangle: rotate the parent;
  - black uncle, line: rotate the grandparent and swap colours;
  - finally, the root is made black.
- **Delete:** CLRS deletion. Removing a black node creates a "double black", fixed by these cases, one step each:
  - red sibling: rotate and recolour;
  - black sibling with black children: recolour and move up;
  - black sibling, near child red: rotate the sibling;
  - black sibling, far child red: rotate the parent and recolour.
  - Mirror cases are named "(mirrored)".
- **Search:** as in the BST lesson.
- **Limits:** at most 15 nodes.
- **View:** tree with `color`.

### Disjoint Set (`disjoint-set`, advanced)

- **State:** `{ parent: number[]; rank: number[] }` over elements 0–9. It starts with a few sets already joined, so finds have paths to compress.
- **Operations:**
  - **Find(x):** follows parents to the root, one step per hop, then path compression points every visited node at the root, one step.
  - **Union(a, b):** two finds, then union by rank. The shorter tree's root goes under the taller one; equal ranks raise the new root's rank. If both are already in one set, one step says so.
  - **Connected?(a, b):** two finds, then compares the roots.
- **View:** panels.
  - A graph of the forest: directed edges from child to parent, a badge with each root's rank, positions from the `layoutCalls` columns scaled to the 0–100 box.
  - Below it, the parent array.

### Segment Tree (`segment-tree`, advanced)

- **State:** an array of 8 numbers; the tree stores range sums.
- **Operations:**
  - **Range sum(l, r):** a recursive query, one step per node visited. Each node is marked:
    - fully inside: used whole (`found`);
    - outside: skipped (`discarded`);
    - partly inside: split (`compare`).
  - **Update(i, value):** walks down to the leaf, sets it, then recomputes the sums on the way back up, one step per node.
- **View:** panels: the array (the query range highlighted), and the tree with each node's sum as its value and its range (`0–7`, `3`) as its badge.

### Fenwick Tree (`fenwick-tree`, advanced)

- **State:** an array of 8 numbers (positions shown 1-based); the Fenwick array is derived from it.
- **Operations:**
  - **Prefix sum(i):** adds `tree[i]`, then `i -= i & -i`, one step each.
  - **Range sum(l, r):** `prefix(r) - prefix(l - 1)`.
  - **Add(i, delta):** adds `delta` to `tree[i]`, then `i += i & -i`, one step each.
- **View:** a grid with columns 1–8 and four rows:
  - `a[i]`;
  - `tree[i]`;
  - `covers` (the range `tree[i]` sums, e.g. `5–8`);
  - `i in binary`, with the lowest set bit noted.

### B-Tree / B+ Tree (`b-tree`, advanced)

- **State:** a B-tree of order 4, written as nested `{ keys: number[]; children: Node[] }`. Nodes hold 1–3 keys, and every leaf is at the same depth.
- **Operations:**
  - **Insert:** goes down to a leaf and adds the key. A node with 4 keys splits: the third key moves up, and a root split makes a new root. One step per split.
  - **Search:** compares within each node, then follows a child, one step per node.
  - **Delete:** a key in an inner node is replaced by its predecessor, the largest key in its left subtree, which is then deleted from its leaf. A node left with 0 keys is fixed in this order, one step each:
    1. borrow from the left sibling, through the parent;
    2. borrow from the right sibling;
    3. merge with a sibling, pulling the separator down.
  - A merge can underflow the parent, and the fix repeats up the tree. An empty root is replaced by its only child.
- **Limits:** at most 15 keys.
- **View:** btree with `linked: false`.
- **B+ trees** are explained in the lesson text, with a link to the SQL Indexes lesson: in a B+ tree, data lives only in linked leaves.

### Graph Representations (`advanced-graph-structures`, advanced)

- **State:** `{ directed: boolean; edges: [number, number][] }` over nodes 0–5 at fixed hexagon positions. It starts undirected with 7 edges.
- **Operations:**
  - **Add edge(u, v)** and **Remove edge(u, v):** update all three representations, one step each.
  - **Has edge?(u, v)** and **Neighbours(u):** answer the same question from each representation in turn, one step each. The entries read are highlighted, and `variables` count them, e.g. "matrix: 1 cell", "list: 3 entries", "edge list: 7 entries".
  - **Toggle directed:** no arguments; it switches the graph between directed and undirected.
- **Rules:**
  - A self-loop or an edge already present is refused.
  - In an undirected graph, `(u, v)` and `(v, u)` are the same edge; the matrix is symmetric, and both lists hold both directions.
- **View:** panels:
  - the graph;
  - the adjacency matrix (a grid with `1`/`0` cells);
  - the adjacency list (a grid with one row per node, its neighbours as cells, gaps as `null`);
  - the edge list (an array of `u→v` or `u–v` cells).

## 4. Catalog

- The curriculum title of `advanced-graph-structures` becomes "Graph Representations".
- **Registry order** follows the curriculum: array, string, linked-list, stack, queue, hash-table, binary-tree, binary-search-tree, heap, priority-queue, graph, trie, avl-tree, red-black-tree, disjoint-set, segment-tree, fenwick-tree, b-tree, advanced-graph-structures.
- **Prerequisites:**
  - hash-table: array, linked-list
  - trie: binary-tree, string
  - avl-tree and red-black-tree: binary-search-tree
  - disjoint-set: array
  - segment-tree: binary-tree, prefix-sum
  - fenwick-tree: prefix-sum
  - b-tree: binary-search-tree
  - advanced-graph-structures: graph
- The roadmap is unchanged.

## 5. Lesson content

Each lesson meets the existing content tests:
- overview; at least 2 concept paragraphs; at least 4 how-it-works points;
- complexity rows (one per operation) and curves;
- pros and cons; at least 3 applications; at least 3 common mistakes;
- a quiz of at least 4 questions of at least 3 types, at least one with a view;
- at least 3 summary points.

The style matches the existing DS lessons: short sentences, plain words, "you" addressed, no filler.

## 6. Testing

- **Framework:** the operation form accepts and lower-cases words, and rejects others with the message above (unit test of the parsing helper).
- **Contract test over every structure lesson**, on seeded random operation sequences (50 operations, arguments drawn from each op's sensible range):
  - `run` never mutates its input state (deep-frozen);
  - every result has at least one step;
  - every `codeLine` is within the lesson's code.
- **Per structure,** against a simple reference, over seeded random sequences:
  - **hash table:** matches a `Map`; the load factor stays at or below 0.75 after each put, until the 12-key limit.
  - **trie:** matches a `Set`; no node outlives every word under it.
  - **AVL:** a BST, with every balance factor in −1..1; matches a sorted set.
  - **red-black:** a BST, with a black root, no red node with a red child, equal black height on every path; matches a sorted set.
  - **disjoint set:** connectivity matches a naive set-merging reference; ranks bound the tree heights.
  - **segment tree** and **Fenwick tree:** sums match brute force after random updates.
  - **B-tree:** 1–3 keys per node, all leaves at one depth, keys in order; matches a sorted set.
  - **graph representations:** the matrix, list and edge list always describe the same edge set.
- **Named-case tests** for each rotation and fix-up case (AVL LL/RR/LR/RL; each red-black insert and delete case; B-tree borrow left, borrow right, merge and root shrink; hash resize).
- **Existing lesson tests** cover content, quiz, registry order and counts (DS 19).
- **Browser pass:** every new lesson in light and dark at 375px, running each operation once.
