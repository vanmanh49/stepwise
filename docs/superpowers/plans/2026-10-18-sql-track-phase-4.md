# SQL Track Phase 4 (Database Internals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six live SQL lessons (Views, Indexes, Query Plans, Transactions, Isolation Levels, Normalization) on an interpreter that supports views, indexes drawn as B-trees, `EXPLAIN QUERY PLAN`, transactions with savepoints and a two-session isolation simulator.

**Architecture:** `Dataset` gains `indexes` and `views`; the script parser gains index, view, EXPLAIN, transaction and session statements. A planner (`plan.ts`) picks each table's access path; `EXPLAIN QUERY PLAN` prints it, and when the path uses a `CREATE INDEX` index the executor reads candidate rows from a B-tree (`btree.ts`) and emits `index-search` trace events. `runScript` tracks transaction state; scripts whose statements carry `A:`/`B:` prefixes run in `sessions.ts`. Two new views (`btree`, `sessions`) render the new steps.

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Vitest; sql.js (devDependency) as the reference engine.

**Spec:** `docs/superpowers/specs/2026-10-18-sql-track-phase-4-design.md`

## Global Constraints

- Branch `sql-phase-4`; commands from the repo root. No new dependencies; no React in `src/sql/`.
- Entry points (`runQuery`, `querySteps`, `runScript`, `scriptSteps`, `checkExercise`) never throw; unexpected exceptions go through `asSqlError`.
- Only indexes created with `CREATE INDEX` change execution; rowid and `sqlite_autoindex_*` paths appear only in `EXPLAIN QUERY PLAN`. Lessons 1–22 must step exactly as before (their existing tests are the guard).
- B-tree nodes hold at most 3 keys. Sessions scripts hold at most 40 statements. At most 400 steps per script.
- Plan wording copies SQLite's exactly: `SCAN t`, `SCAN t USING [COVERING] INDEX i`, `SEARCH t USING [COVERING] INDEX i (a=? AND b>?)`, `SEARCH t USING INTEGER PRIMARY KEY (rowid=?)`, `USE TEMP B-TREE FOR ORDER BY|GROUP BY|DISTINCT`. Tables are named by alias when the query gives one.
- Error and step copy as written in the spec. Commits and PR text carry no AI attribution.
- When everything is built: commit, open the PR, merge it (user's standing instruction).

## Review Focus

1. **Writes after CREATE INDEX** (`CREATE INDEX i ON employees(salary); UPDATE employees SET salary = 9999 WHERE id = 4; SELECT name FROM employees WHERE salary > 9000`) → the index reflects the update (Tuan and Lan found). Pinned in Task 6.
2. **Indexed column with NULLs** (`CREATE INDEX i ON employees(department_id); … WHERE department_id < 3`, Thu has NULL) → same rows as without the index; NULL never matches a range. Pinned in Task 6.
3. **A sessions script that ends while a session waits or a transaction is open** → the waiting statements are marked "still waiting when the script ended", open transactions roll back, no exception. Pinned in Task 9.
4. **DDL inside a transaction** (`BEGIN; CREATE TABLE t(x); CREATE INDEX i ON t(x); CREATE VIEW v AS SELECT * FROM t; ROLLBACK; SELECT * FROM t`) → t, i and v are all gone. Pinned in Task 8.
5. **A view that names itself or a dropped table** (`CREATE VIEW v AS SELECT * FROM v` → "No table `v`."; `DROP TABLE` under a view, then reading the view names the missing table). Pinned in Task 4.

---

## File map

| File | Change | Tasks |
|---|---|---|
| `src/sql/datasets/index.ts`, `src/sql/schema.ts`, `src/components/sql/SchemaPanel.tsx` | `IndexDef`, `ViewDef`, implicit indexes, schema panel | 1 |
| `src/sql/datasets/bank.ts`, `signups.ts` (new), dataset tests | new data | 2 |
| `src/sql/ast.ts`, `src/sql/parse.ts` (+ tests) | new statements, session prefixes | 3 |
| `src/sql/write.ts`, `src/sql/execute.ts` | index/view DDL, views readable | 4 |
| `src/sql/btree.ts` (new, + test) | B-tree | 5 |
| `src/sql/plan.ts` (new, + test), `execute.ts`, `planCorpus.testutil.ts` + `differential4.test.ts` (new) | planner, EXPLAIN, index-driven reads | 6–7 |
| `src/sql/script.ts`, `write.ts` | transactions | 8 |
| `src/sql/sessions.ts` (new, + test), `script.ts`, `check.ts` | sessions | 9 |
| `src/types/visualization.ts`, `src/components/visualization/renderers/BTreeRenderer.tsx`, `SessionsRenderer.tsx` (new), `renderers/index.tsx`, `TableRenderer.tsx` | views | 10 |
| `src/sql/steps.ts`, `src/sql/scriptSteps.ts` (+ `steps4.test.ts`) | steps | 11–12 |
| `src/lessons/sql/*.ts` (6 new), `registry.ts`, `lessons.test.ts` | lessons | 13–18 |

## Shared interfaces

```ts
// datasets/index.ts
export interface IndexDef { name: string; table: string; columns: string[]; unique: boolean; implicit: boolean }
export interface ViewDef { name: string; columns?: string[]; sql: string; query: SelectStatement }
// Dataset gains: indexes?: IndexDef[] (created ones only); views?: ViewDef[]
export function indexesOf(db: Dataset, table: string): IndexDef[]   // implicit (from schema) then created, in creation order
// DatasetId gains 'bank' | 'signups'

// schema.ts
export function implicitIndexes(table: TableSchema): IndexDef[]    // sqlite_autoindex_<table>_<n>, declaration order

// ast.ts — Statement gains (every Statement also gains session?: 'A' | 'B')
| { kind: 'create-index'; name: string; table: string; columns: string[]; unique: boolean; ifNotExists: boolean; line: number; column: number }
| { kind: 'drop-index'; name: string; ifExists: boolean; line: number; column: number }
| { kind: 'create-view'; name: string; columns?: string[]; query: SelectStatement; sql: string; ifNotExists: boolean; line: number; column: number }
| { kind: 'drop-view'; name: string; ifExists: boolean; line: number; column: number }
| { kind: 'explain'; select: SelectStatement; line: number }
| { kind: 'transaction'; action: 'begin' | 'commit' | 'rollback' | 'savepoint' | 'release' | 'rollback-to'; name?: string; line: number; column: number }
| { kind: 'set-isolation'; level: IsolationLevel; line: number; column: number }
export type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

// btree.ts
export const MAX_KEYS = 3;
export interface BTreeEntry { key: SqlValue[]; rowid: string }
export interface BTreeNode { id: string; keys: SqlValue[][]; children: string[]; entries: BTreeEntry[]; next?: string }  // entries only on leaves
export interface BTree { root: string; nodes: Map<string, BTreeNode>; levels: string[][] }
export interface Bounds { equal: SqlValue[]; low?: { value: SqlValue; inclusive: boolean }; high?: { value: SqlValue; inclusive: boolean } }
export function buildBTree(entries: BTreeEntry[]): BTree
export function searchBTree(tree: BTree, bounds: Bounds): { path: string[]; scanned: BTreeEntry[]; rowids: string[] }

// plan.ts
export type AccessPath =
  | { kind: 'scan'; label: string; table: string; index?: IndexDef; covering: boolean }
  | { kind: 'rowid'; label: string; table: string; value: Expr }
  | { kind: 'search'; label: string; table: string; index: IndexDef; covering: boolean; equal: Expr[][]; low?: { expr: Expr; inclusive: boolean }; high?: { expr: Expr; inclusive: boolean } }  // equal[i] = the values for column i (several for IN)
export interface PlanEntry { id: number; parent: number; detail: string }
export function planSelect(db: Dataset, stmt: SelectStatement, ctes?: ReadonlyMap<string, Relation>): { paths: Map<string, AccessPath>; entries: PlanEntry[] }   // paths keyed by lower-case label

// execute.ts — TraceEvent gains
| { kind: 'index-search'; table: string; label: string; index: string; tree: BTree; path: string[]; scanned: string[]; rowids: string[]; examined: number; total: number; relation: Relation }
| { kind: 'view'; name: string; relation: Relation }
// write.ts — WriteEvent gains
| { kind: 'transaction'; action: 'begin' | 'commit' | 'rollback' | 'savepoint' | 'release' | 'rollback-to' | 'auto-rollback'; name?: string; changes: number; tables: Relation[] }
| { kind: 'index-created' | 'index-dropped'; index: IndexDef; tree?: BTree }
| { kind: 'view-created' | 'view-dropped'; view: ViewDef }
| { kind: 'explained'; entries: PlanEntry[] }
| SessionEvent

// sessions.ts
export type Anomaly = 'dirty read' | 'non-repeatable read' | 'phantom' | 'lost update';
export type SessionEvent = { kind: 'session'; session: 'A' | 'B'; index: number; statement: Statement; status: 'ran' | 'waiting' | 'resumed' | 'skipped' | 'error' | 'still waiting'; message?: string; anomaly?: Anomaly; result?: QueryResult; seenBy: { A: Relation[]; B: Relation[] } };
export function isSessionsScript(statements: Statement[]): boolean
export function runSessions(db: Dataset, statements: Statement[], emit?: Emit): ScriptResult   // statements[] = script order

// types/visualization.ts
export interface BTreeView { kind: 'btree'; root: string; nodes: { id: string; keys: string[]; children: string[]; leaf: boolean; role: Role; matched: number[] }[] }
export interface SessionsView { kind: 'sessions'; rows: { session: 'A' | 'B'; text: string; status: SessionEvent['status']; anomaly?: string; active: boolean }[]; tables: SqlTable[] }
// TableView gains index?: BTreeView; Role gains 'pending' if absent
```

---

### Task 1: Schema objects

**Files:** `datasets/index.ts`, `schema.ts`, `SchemaPanel.tsx`; tests in `src/sql/schema.test.ts`, `datasets/datasets.test.ts`.

- [ ] **Step 1: Write failing tests**: `implicitIndexes(school.students)` → `[{ name: 'sqlite_autoindex_students_1', columns: ['email'], unique: true, implicit: true }]`; enrollments → `sqlite_autoindex_enrollments_1` on `(student_id, course_id)`; an INTEGER PRIMARY KEY makes none; `indexesOf` lists implicit before created; `cloneDataset` deep-copies `indexes` and `views`.
- [ ] **Step 2: Run** `npx vitest run src/sql`. Expected: FAIL.
- [ ] **Step 3: Implement**; SchemaPanel lists each table's indexes ("idx_salary (salary)", implicit ones as "UNIQUE email (automatic)") and a Views list with each view's SQL.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Add indexes and views to the schema`

### Task 2: `bank` and `signups` datasets

**Files:** create `datasets/bank.ts`, `datasets/signups.ts`; `datasets/index.ts`; dataset tests.

- [ ] **Step 1: Write failing tests**: rows exactly as spec §3; SQLite accepts the declarations and `PRAGMA foreign_key_check` is empty; signups has 4 distinct students, 3 courses, 2 teachers, Ha's rooms are `B12` ×3 and `B21` ×1.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Add the bank and signups sample databases`.

### Task 3: Parser

**Files:** `ast.ts`, `parse.ts` (remove `INDEX`, `VIEW`, `BEGIN`, `COMMIT`, `EXPLAIN` … from `LATER`), `parseScript.test.ts`.

- [ ] **Step 1: Write failing tests**: each new statement parses with positions and fields (`CREATE UNIQUE INDEX IF NOT EXISTS i ON t (a, b)`, `DROP VIEW IF EXISTS v`, `CREATE VIEW v (x, y) AS SELECT …` keeps `sql` = the SELECT text, `EXPLAIN QUERY PLAN SELECT …`, `BEGIN TRANSACTION`, `END`, `ROLLBACK TO SAVEPOINT s`, `RELEASE s`, `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`); `A: SELECT 1; B: BEGIN;` sets `session`; mixing prefixed and unprefixed → "Start every statement with A: or B:, or none of them."; `EXPLAIN` without `QUERY PLAN` → "Only EXPLAIN QUERY PLAN is supported here."; `SET TRANSACTION` outside a sessions script parses (the runner rejects it).
- [ ] **Step 2–5:** run (FAIL), implement, run `npm test && npm run typecheck` (PASS), commit `Parse index, view, EXPLAIN and transaction statements`.

### Task 4: Index and view statements

**Files:** `write.ts` (`executeStatement` handles create/drop index and view, EXPLAIN delegates to Task 6's planner once it exists — until then returns the scan-only plan), `execute.ts` (`scan` reads a view by running its query with the view's column list, as a CTE; emits `view`), tests in `src/sql/script.test.ts`.

- [ ] **Step 1: Write failing tests**: every error message of spec §1 "Statements"; UNIQUE index over duplicates names both rows; `DROP TABLE` drops its indexes; view read, view of a view, view in a JOIN, `INSERT INTO view` → "Views are read-only here; change the table it reads from."; `DROP TABLE v` on a view → "`v` is a view. Use DROP VIEW."; `DROP VIEW t` on a table → "`t` is a table. Use DROP TABLE."; Review Focus 5 (self-naming view; dropped table → reading the view fails with "No table `employees`.").
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Create and drop indexes and views`.

### Task 5: B-tree

**Files:** create `src/sql/btree.ts`, `btree.test.ts`.

- [ ] **Step 1: Write failing tests**: 0 entries → one empty leaf; 3 → one leaf; 4 → two leaves under a root; 12 → 3 levels with every node ≤ 3 keys and all leaves at the same depth; 40 → balanced, leaves linked in key order; duplicates ordered by rowid; `searchBTree` for equality, `>`, `>=`, `<`, `BETWEEN`, composite `(2, >5000)`: the `path` goes root → leaf, `scanned` is the contiguous leaf run that was examined, `rowids` are exactly the matches; NULL keys sort first and never match a range or `=`.
- [ ] **Step 2: Run** `npx vitest run src/sql/btree.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** bulk-loading: sort entries, chunk into leaves of ≤ 3, then build parents level by level (each parent ≤ 4 children, separator = first key of each child after the first) until one node remains; split chunks evenly so no node is underfull except a lone root.
- [ ] **Step 4–5:** run (PASS), commit `Add a B-tree for indexes`.

### Task 6: Planner and EXPLAIN QUERY PLAN

**Files:** create `src/sql/plan.ts`, `plan.test.ts`, `src/sql/planCorpus.testutil.ts`, `src/sql/differential4.test.ts`; `write.ts` (`explain` uses `planSelect`); `sqlite.testutil.ts` (helper to create a dataset's tables, indexes and views in sql.js).

- [ ] **Step 1: Write failing tests**: the four rules and preference order of spec §1 "Planner"; covering detection; temp B-tree entries; nested entries for subqueries/CTEs/compounds that the corpus covers; the differential test compares `detail` and each entry's depth (parent chain) for ≥ 40 corpus entries `{ dataset, setup: string /* CREATE INDEX … */, sql }` over company and school, including the examples in the spec and the Query Plans lesson; `EXPLAIN QUERY PLAN` result columns are `id, parent, notused, detail` with `notused` 0.
- [ ] **Step 2–5:** run (FAIL), implement, run `npm test && npm run typecheck` (PASS), commit `Plan queries and explain them`.

### Task 7: Index-driven execution

**Files:** `execute.ts` (FROM and JOIN tables whose path is a `search`/`scan` with a non-implicit index read rows from `searchBTree`/leaf order; ON/WHERE still run; work counts examined rows; `index-search` emitted for the top-level query), tests in `src/sql/indexes.test.ts`; `differential4.test.ts` gains the phase 1–3 corpora re-run with indexes added.

- [ ] **Step 1: Write failing tests**: Review Focus 1 and 2; `CREATE INDEX i ON employees(salary); SELECT name FROM employees WHERE salary > 5000` returns the 5 rows in salary order and emits one `index-search` with `examined` 5 and `total` 12; a join whose inner table is searched by a created index; rowid and implicit paths leave the trace identical to today (snapshot of `querySteps` titles for one phase 1 join query is unchanged); every query in `queryCorpus.testutil.ts` and `queryCorpus3.testutil.ts` returns the same multiset after `CREATE INDEX` on each column it filters, joins or sorts on.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Read rows through created indexes`.

### Task 8: Transactions

**Files:** `script.ts` (transaction state: open flag, savepoint stack of `structuredClone` snapshots of `tables`, `indexes`, `views`; a failing statement restores only its own snapshot; end of script with an open transaction restores the BEGIN snapshot and emits `auto-rollback`), `write.ts` events, `script.test.ts`, `scriptDifferential.test.ts` (+ ≥ 30 scripts with views, indexes and transactions).

- [ ] **Step 1: Write failing tests**: every rule and error of spec §1 "Transactions"; `SAVEPOINT` outside BEGIN starts a transaction and `RELEASE` of the outermost commits; nested savepoints; `changes` counts in events; Review Focus 4; a CHECK failure inside BEGIN undoes only that statement and the script continues; `SET TRANSACTION …` outside a sessions script → "SET TRANSACTION only works in a two-session script (A: … B: …)."
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Support transactions and savepoints`.

### Task 9: Sessions simulator

**Files:** create `src/sql/sessions.ts`, `sessions.test.ts`; `script.ts` (`runScript` routes when `isSessionsScript`); `check.ts` (a sessions script's result is its last SELECT that ran).

- [ ] **Step 1: Write failing tests**: the 4 × 4 matrix of spec §1 with four fixed scripts on `bank` (each cell asserts the anomaly label or the waiting/deadlock event); waiting statements resume after the lock holder commits; deadlock message and B's skipped statements; Review Focus 3; > 40 statements → "Two-session scripts are limited to 40 statements."; unsupported statement message; autocommit statements in a session; a CHECK violation in a session undoes that statement only.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** a scheduler: a queue per session in script order; repeatedly run the next statement in script order whose session is not blocked; a statement that hits a conflicting lock is put back and its session marked waiting on the holder; on COMMIT/ROLLBACK release locks and retry waiting statements first; if both sessions wait → deadlock. Reads compute rows from committed state overlaid with the reader's write set (and the other session's for READ UNCOMMITTED), then take locks per the level table; writes run the existing `executeStatement` on that overlaid copy and record the changed rows as the write set.
- [ ] **Step 4–5:** run `npm test && npm run typecheck` (PASS), commit `Simulate two sessions at each isolation level`.

### Task 10: B-tree and sessions views

**Files:** `types/visualization.ts`; create `renderers/BTreeRenderer.tsx`, `SessionsRenderer.tsx`; `renderers/index.tsx`; `TableRenderer.tsx` (draws `view.index` above the tables); `roles.ts` (`pending` role if missing); tests `renderers/btreeLayout.test.ts` (layout: nodes per level, x positions non-overlapping, width grows with leaves).

- [ ] **Step 1–5:** write the layout test (FAIL), implement layout and renderers (keys as small boxes per node, edges from each key gap to its child, a dashed arrow between leaves; sessions as a two-column timeline with status chips and anomaly labels, tables below; both scroll inside their box at 375px), run (PASS), commit `Draw B-trees and session timelines`.

### Task 11: Steps for indexes, plans and views

**Files:** `steps.ts`, `scriptSteps.ts`; create `steps4.test.ts`.

- [ ] **Step 1: Write failing tests**: titles exactly as spec §2 for a `salary > 5000` search (root step, one per level, "Scan the leaves: 5 matches", "Fetch 5 rows by rowid", "Examined 5 of 12 rows; a full scan reads 12."), the `btree` view's roles follow the path; `CREATE INDEX` gets a step showing the built tree; EXPLAIN gets one step per plan entry then the result; a view read gets "VIEW dept_pay: 4 rows"; all `codeLine`s in range, ≤ 400 steps.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Step through index searches, plans and views`.

### Task 12: Steps for transactions and sessions

**Files:** `scriptSteps.ts`, `steps4.test.ts`.

- [ ] **Step 1: Write failing tests**: transaction titles exactly as spec §2 with pending rows marked `pending`; auto-rollback step; sessions scripts produce `sessions` views with one step per statement event, a step for each wait and resume, anomaly labels in titles ("A reads An's balance again: 400 — non-repeatable read"); final result step.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Step through transactions and two sessions`.

## Lesson tasks (13–18)

Each lesson task: write `src/lessons/sql/<id>.ts` (3–4 examples, 2–3 exercises, 4–5 quiz questions of ≥ 3 types with one `table` view; content per spec §3), register it in curriculum order in `registry.ts`, add it to `EXPECTED_IDS` and raise the SQL count in `lessons.test.ts`, run `npm test && npm run typecheck` (PASS), commit `Add <Title> lesson`.

| Task | Lesson id | Dataset | Exercise checking |
|---|---|---|---|
| 13 | `views` | company | probes |
| 14 | `indexes` | company | probes incl. `EXPLAIN QUERY PLAN …` |
| 15 | `query-plans` | company | probes incl. `EXPLAIN QUERY PLAN …` |
| 16 | `transactions` | bank | probes |
| 17 | `isolation-levels` | bank | last SELECT compared |
| 18 | `normalization` | signups | probes incl. a rebuilding JOIN |

The quiz `table` view for Isolation Levels comes from the `sessions` view's tables; add a `scriptViewAt` variant if `scriptViewAt` only returns `TableView` (ruling recorded if so). The lesson test that every SQL lesson asks a table question may count a sessions view's tables.

### Task 19: Verification, PR and merge

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build:pages`. Expected: PASS; 28 SQL lessons; no "Coming soon" in SQL.
- [ ] **Step 2:** Browser pass over the six lessons (opening script, every example, one right and one wrong exercise answer) in light and dark themes and at 375px; no console errors, no page-level horizontal scroll; a phase 1, 2 and 3 lesson still work.
- [ ] **Step 3:** Final whole-branch review; fix Critical/Important findings with failing tests first.
- [ ] **Step 4:** Push, open the PR, merge it, and confirm the Pages deploy.
