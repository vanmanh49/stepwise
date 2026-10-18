# Batch 1: twelve lessons on the existing engine

Date: 2026-10-13
Status: as built. Written on 2026-10-18 from PR #2 (`feat/batch-1-lessons`, merge `3ccd3c3`) and the code at that commit; no spec was written at the time.

## Goal

Add twelve lessons that the engine from `2026-10-13-dsa-platform-design.md` can already draw, taking the site from 17 to 29 lessons. No new renderers.

- **Data structures:** String, Binary Tree, Priority Queue.
- **Algorithms:** Two Pointers, Sliding Window, Prefix Sum, Heap Sort, Tree Traversal, Topological Sort, Bellman-Ford, Kruskal, Prim.

## Decisions

- Reuse the existing views: strings and the techniques use the array view, trees and the priority queue use the tree and heap views, and graph algorithms use the graph view.
- The one new input kind is **text**, for the String lesson.
- The search input is generalized so its second field can be something other than a target, such as a target sum or a window size.
- "Binary Search Tree Operations" is removed from the curriculum as a duplicate of the Binary Search Tree lesson; it remains a search keyword.

## 1. Text input

- New `TextDef { initial, view, ops, code }` and `TextOp { id, label, arg?, run(text, arg) }`, where `arg` is an optional single field and may be numeric. Visualization kind `{ kind: 'text'; text: TextDef }`, rendered by `TextInput.tsx`.
- `parseText(text)`: at least 1 and at most `MAX_TEXT_LENGTH = 12` characters, and no characters outside the Basic Multilingual Plane (an emoji takes two slots and would break "one cell per character"). Errors: "Type at least one character.", "Use plain letters, digits and punctuation (no emoji).", "Use at most 12 characters so every step stays readable."
- Spaces are drawn as `␣`.
- An operation uses the text in the field even if "Set text" was not pressed first; invalid typed text gives the field error instead (a review fix).

## 2. Search input changes

- Optional config fields: `targetLabel` (default "Target"), `targetHelp`, and `randomTarget(values)` to pick a sensible second value for random data.
- The second field accepts any whole number of up to 4 digits, because a target sum of two items can reach 1998.
- Errors are tied to the field that caused them (`aria-invalid` on that field only, with `aria-describedby` pointing at the message).
- The notice for sorted input becomes "Sorted your input first: this algorithm needs sorted data."

## 3. Lessons

| Lesson | Visualization | Notes |
|---|---|---|
| String | text, initial `LEVEL` | charAt, concat (result at most 12 characters), reverse, palindrome check that points at the first mismatching pair |
| Binary Tree | structure, `[1, 2, 3, 4, 5]`, max 15 nodes | insert at the first free level-order position, height, level-order walk; duplicates allowed |
| Priority Queue | structure, `[2, 5, 3, 9, 7]`, max 15 items | min-heap: enqueue, dequeue the smallest, peek |
| Two Pointers | search, sorted, "Target sum" | finds a pair adding up to the target and never pairs a value with itself |
| Sliding Window | search, "Window size k" | largest sum of k neighbours; the first window wins ties; at most n + 3 steps |
| Prefix Sum | sort-style list input | running totals with a leading 0, then answers a range sum by subtraction |
| Heap Sort | sort | the heap stays visible in every step, and items in their final place never move again |
| Tree Traversal | structure, `[1..7]` | pre-order, in-order, post-order and level order; never changes the tree |
| Topological Sort | graph, no start | Kahn's algorithm; reports a cycle |
| Bellman-Ford | graph, with start | handles negative edges, stops early when nothing changes, detects a negative cycle |
| Kruskal | graph, no start | builds a forest when the graph is disconnected |
| Prim | graph, with start | spans only the start's component and says so |

Prerequisites follow the course order. For example, Binary Search Tree now requires Binary Tree, Heap Sort requires Heap and Selection Sort, and Prim requires Graph and Priority Queue.

## 4. Data

- Sample graphs added: **Course prerequisites** and **Build steps with two starting points** (acyclic, for topological sort), **One negative edge**, and **Negative cycle**. `makeGraph` is exported.
- Big O mapping: `O(E log E)` and `O(E log V)` map to n log n, and `O(V × E)` maps to n², so every algorithm maps to a curve.

## 5. Testing

- New test files: `string.test.ts`, `trees.test.ts`, `techniques.test.ts`, `heap.test.ts`, `traversal.test.ts`, `graph2.test.ts`, `mst.test.ts`.
- Each algorithm is checked against its plain implementation: Prim's tree weight equals Kruskal's from any start, and Bellman-Ford agrees with Dijkstra when no weight is negative.
- Wording tests cover edge cases: singular and plural, a window of one value, negative numbers shown in brackets inside arithmetic.
- The lesson registry test covers the 29 lessons.
- Result at merge: 496 tests passing; `typecheck` and `build` clean. Browser pass at desktop and 390px widths for every new lesson, every operation and every sample graph.

## Out of scope

- New renderers.
- The remaining 29 "Coming soon" topics.
