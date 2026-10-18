# SQL Track Phase 3 (Advanced Querying) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven live SQL lessons (Self Join, Many-to-Many, CASE, set operations, CTEs, recursive CTEs, window functions) on an interpreter that supports CASE, SELECT without FROM, UNION/INTERSECT/EXCEPT, WITH [RECURSIVE] and window functions, stepped for learners.

**Architecture:** The SELECT AST grows optional parts (`with`, `compound`, an optional `from`) and two expression kinds (`case`, `window`), so phase 1 and 2 callers keep working. `executeSelect` binds CTEs into its environment, evaluates compounds and window columns, and emits new trace events that `buildDrafts` turns into steps. A new `company` dataset supplies hierarchical data.

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Vitest; sql.js (devDependency) as the reference engine.

**Spec:** `docs/superpowers/specs/2026-10-18-sql-track-phase-3-design.md`

## Global Constraints

- Branch `sql-phase-3`; commands from the repo root. No new dependencies; no React in `src/sql/`.
- Entry points never throw; unexpected exceptions go through `asSqlError`.
- Semantics match SQLite 3 for the supported subset; every engine task adds its queries to the phase 3 differential corpus.
- Recursion guard: more than 100 rounds or 1,000 rows → `limit` error with the spec's exact message.
- At most 400 steps per query or script; new step kinds join the existing summarising (`group`/`kept`).
- New words (`RECURSIVE`, `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`, `PARTITION` …) are matched by position, as phase 2 did, unless already keywords.
- Copy style as in phase 1/2 lessons. Commits and PR text carry no AI attribution.
- When everything is built: commit, open the PR, merge it (user's standing instruction).

## Review Focus

1. **A recursive CTE that never stops** (`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT * FROM n`). Expected: the guard message, never a frozen page. Pinned in Task 6.
2. **Mismatched column counts in UNION / a CTE column list.** Expected: the spec's message at the offending SELECT's position. Pinned in Tasks 4 and 5.
3. **Window functions over ties** (RANK/DENSE_RANK on equal salaries; running SUM with peers). Expected: SQLite's numbers. Pinned in Task 7.
4. **ORDER BY after a UNION using an expression** (`ORDER BY price * 2`). Expected: the spec's message, not a wrong sort. Pinned in Task 4.
5. **A CTE named like a real table** (`WITH employees AS (…)`). Expected: the CTE shadows the table for that statement only. Pinned in Task 5.

---

## File map

| File | Change | Tasks |
|---|---|---|
| `src/sql/datasets/company.ts` (new), `datasets/index.ts`, `datasets/datasets.test.ts` | company dataset | 1 |
| `src/sql/ast.ts` | `case` and `window` Expr kinds; `SelectStatement.from?`, `.compound?`, `.with?`; `Cte`; `with?` on insert/update/delete Statements; `Clause` gains `WITH`, `UNION`, `WINDOW` | 2–7 |
| `src/sql/parse.ts` | CASE, optional FROM, compounds, WITH [RECURSIVE], OVER; `LATER` entries removed | 2–7 |
| `src/sql/evaluate.ts` | CASE evaluation; window values read from the row | 2, 7 |
| `src/sql/execute.ts` | optional FROM, compounds, CTE binding (`Env.ctes`), recursion, windows; new `TraceEvent`s | 3–7 |
| `src/sql/write.ts` | DML statements honour `with` | 5 |
| `src/sql/queryCorpus3.testutil.ts` (new), `src/sql/differential3.test.ts` (new) | ≥ 90 phase 3 queries vs sql.js | 2–7 |
| `src/sql/steps.ts` (+ `steps3.test.ts`) | steps for CASE rows, combine, CTE, rounds, window; alias labels | 8–11 |
| `src/lessons/sql/*.ts` (7 new), `registry.ts`, `lessons.test.ts` | lessons | 12–18 |

## Shared interfaces (produced by the engine tasks)

```ts
// ast.ts
| { type: 'case'; operand?: Expr; whens: { when: Expr; then: Expr }[]; else?: Expr }
| { type: 'window'; fn: 'ROW_NUMBER' | 'RANK' | 'DENSE_RANK' | 'LAG' | 'LEAD' | AggregateFn; args: Expr[]; star: boolean; partitionBy: Expr[]; orderBy: { expr: Expr; desc: boolean }[] }
export interface Cte { name: string; columns?: string[]; query: SelectStatement; recursive: boolean; line: number; column: number }
export type SetOp = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'EXCEPT';
// SelectStatement gains:
//   from?: TableRef                       (absent for SELECT without FROM)
//   compound?: { op: SetOp; select: SelectStatement; line: number }[]   (on the first SELECT; its orderBy/limit then apply to the whole compound)
//   with?: Cte[]                          (only on the outermost SELECT)
// Clause gains 'WITH' | 'WINDOW' | SetOp (shown in the clause bar)

// execute.ts — Env gains: ctes?: Map<string, Relation> (lower-case names)
// TraceEvent gains:
| { kind: 'case-row'; row: string; input: Relation; column: string; branch: string; value: SqlValue; values: Record<string, string> }
| { kind: 'compound-side'; index: number; op?: SetOp; relation: Relation }
| { kind: 'combined'; op: SetOp; left: Relation; right: Relation; relation: Relation; notes: { left: Record<string, string>; right: Record<string, string> } }
| { kind: 'cte'; name: string; relation: Relation }
| { kind: 'recursion-round'; name: string; round: number; read: Relation; added: Relation; total: Relation }
| { kind: 'window-partitions'; input: Relation; partitions: string[][] }
| { kind: 'window-row'; relation: Relation; row: string; partition: number; dependsOn: string[]; columns: string[]; values: SqlValue[] }
```

---

### Task 1: The `company` dataset

**Files:** Create `src/sql/datasets/company.ts`; modify `datasets/index.ts` (`DatasetId` gains `'company'`), `datasets/datasets.test.ts` (foreign-key map, well-formedness, constraints hold in SQLite).

- [ ] **Step 1: Write failing tests**: `datasets.company` has tables `departments`, `employees` with exactly the rows and declarations in spec §3; SQLite `PRAGMA foreign_key_check` is empty; the property checks: a 5-level chain from Lan to Bao (walk `manager_id`), Tuan and Vy share salary 5200 in department 2, Khoa (5400) earns more than Tuan, Linh hired before Hoa, Thu has `department_id` NULL, no employee in department 4.
- [ ] **Step 2: Run** `npx vitest run src/sql/datasets`. Expected: FAIL.
- [ ] **Step 3: Implement** `company.ts` with the spec's rows, `title: 'Company'`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Add the company sample database`

### Task 2: CASE expressions

**Files:** `ast.ts`, `parse.ts` (`primary()` handles `CASE`; remove `CASE` from `LATER`), `evaluate.ts`, `execute.ts` (`walk`, `mapChildren`, `rejectNested`, `checkGrouping` cover the new node), `src/sql/parse.test.ts`, `src/sql/execute.test.ts`; create `queryCorpus3.testutil.ts` and `differential3.test.ts` (same comparison as `differential.test.ts`, but over `datasets` including company; multiset unless the entry has `ordered: true`).

- [ ] **Step 1: Write failing tests**: parse both forms with `whens`, `else`, positions; `CASE` without `END` → syntax error "Expected END"; evaluate: first true WHEN wins, no ELSE → NULL, simple CASE with NULL operand → ELSE, CASE inside `SUM(…)` and in ORDER BY and GROUP BY; differential corpus gets ≥ 12 CASE queries (all three datasets).
- [ ] **Step 2: Run** `npx vitest run src/sql`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `Support CASE expressions`

### Task 3: SELECT without FROM

**Files:** `ast.ts` (`from?`), `parse.ts`, `execute.ts` (a one-row, zero-column source relation `{ id: 'one' }`), `steps.ts` (no FROM step when absent; the clause bar omits FROM), tests.

- [ ] **Step 1: Write failing tests**: `SELECT 1, 'a'` → one row `[1, 'a']`; `SELECT 1 WHERE 0` → no rows; `SELECT COUNT(*)` → `[1]` (as SQLite); a column reference without FROM → name error "No column `x`."; `querySteps('SELECT 1 + 1')` gives at least a start and a result step with `codeLine` 1; corpus +4 queries.
- [ ] **Step 2–5:** run (FAIL), implement, run `npm test && npm run typecheck` (PASS), commit `Allow SELECT without FROM`.

### Task 4: Set operations

**Files:** `ast.ts` (`SetOp`, `compound`), `parse.ts` (after a SELECT core, loop on `UNION [ALL]` / `INTERSECT` / `EXCEPT`; ORDER BY/LIMIT parsed once after the last core and stored on the first SELECT; ORDER BY/LIMIT before an operator → "ORDER BY and LIMIT go after the last SELECT of a UNION."), `execute.ts` (evaluate each core without its ORDER BY/LIMIT, combine left to right with `valueKey` row keys, then sort/limit the combined relation using result-column names or positions), tests.

- [ ] **Step 1: Write failing tests**: UNION removes duplicates and NULL duplicates; UNION ALL keeps them; INTERSECT/EXCEPT; three operands left to right (`A UNION B EXCEPT C`); column names from the first SELECT; count mismatch → "Each SELECT in a UNION must return the same number of columns: the first returns 2, this one returns 3." at the second SELECT's position; `ORDER BY 1 DESC LIMIT 2` and `ORDER BY city` work; `ORDER BY price * 2` → "ORDER BY after UNION can only name a result column or its position."; ORDER BY before UNION → its message; corpus +16 queries (Review Focus 2 and 4).
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Support UNION, INTERSECT and EXCEPT`.

### Task 5: CTEs

**Files:** `ast.ts` (`Cte`, `with?` on SelectStatement and on insert/update/delete Statements), `parse.ts` (`WITH name [(cols)] AS (select), …` before SELECT in queries and before INSERT/UPDATE/DELETE in scripts; remove `WITH` from `LATER`), `execute.ts` (`Env.ctes`; `scan(db, ref, ctes?)` looks up CTEs first, case-insensitively; each CTE evaluated once in order with earlier CTEs visible; column list renames, count mismatch → "CTE `x` lists 2 columns but its SELECT returns 3."), `write.ts` (DML evaluates its `with` first and passes `ctes` to scans, subqueries and INSERT … SELECT), tests.

- [ ] **Step 1: Write failing tests**: single CTE; chained CTEs; CTE used twice in one query (joined to itself); CTE with column list; CTE shadowing `employees` for that statement only (Review Focus 5); CTE before UPDATE … WHERE id IN (SELECT id FROM cte) and before DELETE and INSERT … SELECT (via `runScript`); unknown CTE name → existing no-table message with suggestion; a self-reference without RECURSIVE → "Add RECURSIVE to let a CTE refer to itself."; corpus +14.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Support WITH (common table expressions)`.

### Task 6: Recursive CTEs

**Files:** `parse.ts` (`WITH RECURSIVE`), `execute.ts` (anchor = the compound's first SELECT, step = the rest joined by its operator; validate the step references the CTE exactly once in FROM/JOIN, else "A recursive CTE must refer to itself exactly once, in FROM or JOIN."; iterate with the previous round's rows bound to the CTE name; UNION skips rows already in the result; guard), tests.

- [ ] **Step 1: Write failing tests**: numbers 1–10 (`SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10`); org chart from Lan with levels (5 rounds of new rows, then none); chain of managers above Bao; UNION ending a cycle on a small table created in a script (`edges` with a loop); UNION ALL vs UNION on the same data; the guard on Review Focus 1's query with the spec's exact message and `kind: 'limit'`; corpus +14 (including the guard query excluded from sql.js comparison, asserted separately).
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Support WITH RECURSIVE with a guard against endless recursion`.

### Task 7: Window functions

**Files:** `ast.ts` (`window` Expr), `parse.ts` (`fn(…) OVER (…)` for the spec's functions; unsupported frames/functions/`WINDOW`/`FILTER` messages; remove `OVER` from `LATER`), `execute.ts` (after HAVING: for each distinct window spec, partition rows by `PARTITION BY` keys in first-seen order, sort each partition by its ORDER BY (stable), compute values per spec §1 frame rules; window results are stored per row and read by `evaluate` when projecting and sorting; window in WHERE/GROUP BY/HAVING → "Window functions can only be used in SELECT and ORDER BY."), `evaluate.ts`, tests.

- [ ] **Step 1: Write failing tests** (expected values computed from the company data): ROW_NUMBER/RANK/DENSE_RANK per department ordered by salary DESC (Engineering by salary DESC — RANK: Minh 1, Khoa 2, Tuan 3, Vy 3, Nam 5, Bao 6; DENSE_RANK: 1, 2, 3, 3, 4, 5; ROW_NUMBER: 1–6, asserting only the set {3, 4} for the tied Tuan and Vy, since the order of ties is not defined); running `SUM(salary) OVER (ORDER BY hired)`; peers included (`SUM(salary) OVER (ORDER BY salary)` gives equal sums to tied rows); `AVG(salary) OVER (PARTITION BY department_id)`; `LAG(salary)`, `LAG(salary, 2, 0)`, `LEAD(name)`; window over a grouped query (`RANK() OVER (ORDER BY SUM(salary) DESC)` with GROUP BY department_id); window in ORDER BY; unsupported `ROWS BETWEEN …`, `NTILE(2)`, `WINDOW w AS …` messages; corpus +24 (Review Focus 3).
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Support window functions`.
- [ ] **Step 6:** assert the phase 3 corpus has at least 90 queries; run `npx vitest run src/sql/differential3.test.ts` (PASS); commit with the engine task if not already.

### Task 8: Steps for CASE and self-join labels

**Files:** `execute.ts` (emit `case-row` while projecting when a SELECT column contains CASE), `steps.ts`, create `src/sql/steps3.test.ts`.

- [ ] **Step 1: Write failing tests**: for the CASE lesson's opening query, steps include one per product titled like `Row 4: price 6.5 → ELSE → 'budget'` / `Row 2: price 42 → WHEN price >= 40 is true → 'premium'`, with `focus` on price and `codeLine` = SELECT line; long runs summarised; for `SELECT e.name, m.name FROM employees e JOIN employees m ON …`, JOIN step tables are labelled `e (employees)` and `m (employees)`.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS), commit `Step through CASE row by row and label self joins by alias`.

### Task 9: Steps for set operations

- [ ] **Step 1: Write failing tests**: `A UNION B` steps: "Left SELECT: n rows", "Right SELECT: m rows", a combine step whose view has the two inputs and the result with notes `duplicate, dropped` / `kept`; INTERSECT notes `in both` (found) / `only in left` (discarded); EXCEPT `also in right, removed`; clause bar `['SELECT', 'UNION', 'SELECT', 'ORDER BY']` for an ordered union; three operands give two combine steps; final result equals `runQuery`.
- [ ] **Step 2–5:** run (FAIL), implement from `compound-side`/`combined` events, run (PASS), commit `Step through UNION, INTERSECT and EXCEPT`.

### Task 10: Steps for CTEs and recursion

- [ ] **Step 1: Write failing tests**: CTE query: a step "WITH dept_pay: 3 rows" with a table labelled `dept_pay`, before the main query's FROM step; clause bar starts with `WITH`. Recursive org chart: "Start: 1 row (Lan)", rounds 1–4 with `found` new rows and `compare` read rows, "Round 5 finds nothing, so the recursion stops"; the guard query returns `ok: false` with the guard message.
- [ ] **Step 2–5:** run (FAIL), implement from `cte`/`recursion-round` events, run (PASS), commit `Step through CTEs and recursion rounds`.

### Task 11: Steps for window functions

- [ ] **Step 1: Write failing tests**: the Window lesson's opening query: clause bar contains `WINDOW` between HAVING position and SELECT; a partition step whose rows carry `group` numbers by department; per-row steps like `Engineering, row 4: RANK() = 3, tied with Tuan on 5200` with the tied rows in `compare`; running SUM step lists the frame rows in `compare`; `steps.length <= 400`.
- [ ] **Step 2–5:** run (FAIL), implement from `window-partitions`/`window-row` events, run (PASS), commit `Step through window functions`.

## Lesson tasks (12–18)

Each lesson task: write `src/lessons/sql/<id>.ts` (content rules as in phases 1–2: 3–4 examples, 2–3 exercises without probes, 4–5 quiz questions of ≥ 3 types with one `view: viewAt(...)`), register it in curriculum order in `registry.ts`, add it to `EXPECTED_IDS` and raise the SQL count by one in `lessons.test.ts`, run `npm test && npm run typecheck` (PASS), commit `Add <Title> lesson`. Content per spec §3's lesson table:

| Task | Lesson id | Dataset |
|---|---|---|
| 12 | `self-join` | company |
| 13 | `many-to-many` | school |
| 14 | `case-expressions` | shop |
| 15 | `set-operations` | shop |
| 16 | `ctes` | company |
| 17 | `recursive-ctes` | company |
| 18 | `window-functions` | company |

### Task 19: Verification, PR and merge

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build:pages`. Expected: PASS; 22 SQL lessons.
- [ ] **Step 2:** Browser pass over the seven lessons (opening query, every example, one right and one wrong exercise answer) in light and dark themes and at 375px; no console errors, no page-level horizontal scroll; a phase 1 and a phase 2 lesson still work.
- [ ] **Step 3:** Final whole-branch review; fix Critical/Important findings with failing tests first.
- [ ] **Step 4:** Push, open the PR, merge it, and confirm the Pages deploy.
