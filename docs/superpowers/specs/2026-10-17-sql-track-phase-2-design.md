# SQL track, phase 2: modifying data

Date: 2026-10-17
Status: approved design, awaiting spec review

## Goal

Turn the five "Modifying data" topics of the SQL menu into live lessons: **INSERT**, **UPDATE**, **DELETE**, **CREATE TABLE** and **Constraints**. Learners write scripts that change data, step through every statement the way they already step through SELECT, and practise with exercises that check what their script left behind.

This is phase 2 of 4 (see `2026-10-15-sql-track-phase-1-design.md`, "Phasing"). Phase 3 (advanced querying) and phase 4 (database internals) get their own specs later.

## Decisions

- **Fresh copy per run.** Every Run executes the whole editor script on a fresh copy of the lesson's sample database. Nothing carries over between runs. Steps are always reproducible and exercises are checked deterministically.
- **Our own interpreter, extended.** `src/sql/` gains write statements, a mutable database copy, and constraint enforcement. sql.js stays a devDependency used only in differential tests.
- **SQLite semantics with foreign keys enforced** (`PRAGMA foreign_keys = ON` in the tests).
- **Exercises are checked by probes**: statements run after the script, on the database it left behind.
- **One spec, one plan, one PR** on branch `sql-phase-2`.

Alternatives considered and rejected:

- A persistent sandbox per lesson with a "Reset data" button: steps would depend on earlier runs and exercises would check hidden state.
- Running writes in sql.js in the browser: rejected in phase 1 (bundle size, and it cannot explain its own steps).

## 1. Engine (`src/sql/`)

### Scripts

- A run is a **script** of 1–10 statements separated by `;` (a trailing `;` is optional), at most 2,000 characters as today.
- New entry points, which never throw:
  - `runScript(db, sql): ScriptResult` — the pure result: the final database, and for each statement its kind, its result rows (for SELECT) or affected-row count, and the line it starts on.
  - `scriptSteps(db, sql): ScriptStepsResult` — the steps for the whole script (section 2).
  - `runQuery` and `querySteps` keep working for single SELECT statements; `SqlInput` switches to `scriptSteps`, which handles a single SELECT exactly as `querySteps` does today (same steps).
- Statements run in order on one database copy. The script **stops at the first error**. Changes made by earlier statements stay (they are shown in the steps); the failing statement changes nothing (statement-level atomicity, as in SQLite).
- Errors keep the phase 1 shape (`SqlError` with message, line, column, kind) plus a new kind `'constraint'` that carries `{ rule: 'NOT NULL' | 'UNIQUE' | 'PRIMARY KEY' | 'CHECK' | 'FOREIGN KEY'; table: string; column?: string }`.

### Supported statements

- `INSERT INTO t [(col, …)] VALUES (…), (…)` and `INSERT INTO t [(col, …)] SELECT …`
- `UPDATE t SET col = expr [, col = expr …] [WHERE …]` — expressions and subqueries as in phase 1
- `DELETE FROM t [WHERE …]`
- `CREATE TABLE t (…)`:
  - column types `INTEGER`, `REAL`, `TEXT`
  - column constraints `PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `DEFAULT literal`, `CHECK (expr)`, `REFERENCES other(col)`
  - table constraints `PRIMARY KEY (a, b)`, `UNIQUE (a, b)`, `CHECK (expr)`, `FOREIGN KEY (a) REFERENCES other(b)`
- `DROP TABLE [IF EXISTS] t`
- `SELECT` as in phase 1
- Anything else gives the existing `unsupported` error naming the feature and, where planned, the lesson: `ALTER TABLE`, `ON DELETE …`/`ON UPDATE …` actions, `INSERT OR …`/`ON CONFLICT`, `RETURNING`, `CREATE INDEX`/`VIEW` (phase 4), `BEGIN`/`COMMIT` (phase 4). The parser's `LATER` map is updated: INSERT, UPDATE, DELETE, CREATE TABLE and DROP become supported.

### Semantics to match (SQLite)

- **Type affinity on write**: values stored into `INTEGER`/`REAL` columns are converted when they look numeric (`'5'` into INTEGER becomes the number `5`, `'2.5'` becomes the number `2.5`, `'abc'` stays text), and `TEXT` columns store numbers as text (`5` → `'5'`). Matches SQLite's affinity rules for these three types.
- **`INTEGER PRIMARY KEY`** (single column) is filled with `max(existing) + 1` (or 1 for an empty table) when the value is omitted or NULL.
- **Defaults**: an omitted column gets its `DEFAULT` or NULL.
- **NOT NULL**: NULL is rejected. A `PRIMARY KEY` that is not `INTEGER PRIMARY KEY` still allows NULL, as in SQLite (the lesson explains this quirk).
- **UNIQUE / PRIMARY KEY**: duplicates rejected; NULLs never clash with each other.
- **CHECK**: rejected only when the expression is false; NULL (unknown) passes. A CHECK may only refer to its own row's columns (no subqueries or aggregates), as in SQLite.
- **FOREIGN KEY**: a non-NULL child value must exist in the parent column on INSERT and UPDATE; deleting or changing a parent row that still has children is rejected. Self-references are allowed.
- **UPDATE** evaluates every SET expression against the row's values before the update. **INSERT … SELECT** from the same table reads the table as it was before the statement.
- **Statement atomicity**: constraint checks happen as rows are written; on the first violation the statement's changes are undone and the script stops.

### Sample datasets gain constraints

`DatasetTable` gains optional constraint declarations, rendered from one place for the engine, the schema panel and the differential tests' `CREATE TABLE`:

- `shop`: `customers.id`, `products.id`, `orders.id` are `INTEGER PRIMARY KEY`; `customers.name`, `products.name`, `products.price` are `NOT NULL`; `orders.customer_id REFERENCES customers(id)`; `order_items` has `PRIMARY KEY (order_id, product_id)`, `order_id REFERENCES orders(id)`, `product_id REFERENCES products(id)`, `CHECK (quantity > 0)`.
- `school`: `students.id`, `courses.id` are `INTEGER PRIMARY KEY`; `students.name`, `courses.title` are `NOT NULL`; `students.email` is `UNIQUE`; `enrollments` has `PRIMARY KEY (student_id, course_id)` and foreign keys to `students` and `courses`.

The existing rows already satisfy these (checked while writing this spec, and kept true by a dataset test). Phase 1 SELECT results do not change.

### Limits

- A table may hold at most 50 rows after any statement (`limit` error otherwise); a script may create at most 10 tables.
- The existing `MAX_WORK` and join-size limits apply to every statement.

## 2. Steps and visualization

- **Per statement**: each statement opens with a header step, "Statement 2 of 3: UPDATE customers", whose `why` says what the statement will do. Header steps are never merged away.
- **Clause bar**: the `table` view's `clauses` list the running statement's clauses in execution order — `UPDATE → WHERE → SET`, `DELETE → WHERE`, `INSERT → VALUES` (or `INSERT → SELECT`), `CREATE TABLE`, `DROP TABLE`; SELECT as in phase 1. `current` marks the running one.
- **`codeLine`** points at the clause's line in the whole script.
- **INSERT … VALUES**: one step per row: values converted to column types, defaults and automatic ids filled in, constraints checked; the new row appears with role `found` and note `inserted`.
- **INSERT … SELECT**: the SELECT's result in one step, then the rows inserted as above.
- **UPDATE**: the WHERE check row by row (phase 1's filter steps), then one SET step per matched row, with the changed cells in `focus` and a note such as `city: Hue → Hanoi`.
- **DELETE**: the WHERE check, then the matched rows with role `discarded` and note `deleted`, then the table without them.
- **CREATE TABLE**: the new empty table with its columns and constraint badges. **DROP TABLE**: the table shown once, then gone.
- **Constraint failure**: the offending new or changed row with role `discarded`, the existing row it clashes with (UNIQUE, PRIMARY KEY, FOREIGN KEY) with role `compare`, and a `why` that names the rule, e.g. "UNIQUE failed: students.email already has 'mai@school.edu' (row 1)". The script stops here, and the step says the statement's changes were undone.
- **Final step**: the end state of up to three tables the script changed (in order of first change), then the last SELECT's result if there was one.
- **View additions**: `SqlTable.columnNotes?: string[]`, one short badge string per column (`PK`, `NOT NULL`, `UNIQUE`, `CHECK`, `→ customers.id`, `DEFAULT 0`), rendered under the column header by `TableRenderer`. `SchemaPanel` shows the same notes.
- **Limits**: the 400-step cap applies to the whole script; same-outcome row checks are merged as in phase 1.

## 3. Exercises and checking

- `SqlExercise` gains `probes?: string[]`. Exercises without probes keep phase 1 behaviour (compare the result of the learner's query with the solution's).
- With probes, `checkExercise`:
  1. runs the learner's script and the solution, each on a fresh copy of the dataset;
  2. if the learner's script fails, returns `{ status: 'error' }` as today;
  3. runs each probe (a script, usually one statement) against each resulting database, on a copy so probes do not affect each other;
  4. compares outcomes probe by probe: a result (as a multiset, or in order when `orderMatters`), or a constraint error (by `rule` and `table`), or another error;
  5. returns `correct`, or `{ status: 'probe'; index; expected; actual }` for the first probe that differs.
- `describeCheck` turns a probe mismatch into plain words: "After your script, `SELECT id, price FROM products` gives 2 rows that differ." / "Inserting NULL into members.email should fail (NOT NULL), but your table accepted it." / "This insert should succeed, but your table rejected it (CHECK on members)."
- Learners' CREATE TABLE statements are therefore judged by behaviour, not wording.
- Lesson test rules for probes: on the solution's database every probe behaves as the exercise intends, and at least one probe behaves differently on the untouched dataset (so doing nothing never passes).
- Stored progress is unchanged.

## 4. Lessons

Ids, titles, difficulty and group come from the curriculum. Each has 3–4 examples, 2–3 exercises, and the standard content (overview, concept, how it works, applications, common mistakes, summary, 4–5 quiz questions with at least one showing a `table` view).

| Lesson | Dataset | Opening script | Examples | Exercises | Prerequisites |
|---|---|---|---|---|---|
| INSERT (beginner) | shop | Add customer 11 Tam from Hue, then `SELECT` her | Several rows at once; a column left out (NULL / default); automatic id; `INSERT … SELECT` | Add a product; add two customers in one statement; copy every Books product into a new table (provided by a `CREATE TABLE` in the starter) | `select-from` |
| UPDATE (beginner) | shop | Move customer 4 to Hanoi, then `SELECT` | Raise Books prices by 10%; SET from an expression; forgotten WHERE (every row changes); SET with a subquery | Mark pending orders as shipped; give customers with no city the city 'Unknown' | `where` |
| DELETE (beginner) | shop | Delete the items of order 3, then `SELECT` | WHERE with a subquery; delete everything; a delete blocked by a foreign key (customer with orders) | Delete the items of cancelled orders; delete the products never ordered | `where` |
| CREATE TABLE (intermediate) | school | Create `clubs (id INTEGER PRIMARY KEY, name TEXT, founded INTEGER)`, insert two rows, `SELECT` | Type conversion; DEFAULT; automatic id; `DROP TABLE IF EXISTS` then recreate | Create `rooms` matching a description (probes); create `clubs` and insert three rows (probes) | `insert` |
| Constraints (intermediate) | school | Create `members` with PRIMARY KEY, NOT NULL, UNIQUE, CHECK and REFERENCES, insert a good row, then a bad one | NOT NULL and UNIQUE failing; CHECK failing; FOREIGN KEY failing; composite primary key | Members table with required unique email (probes); a `memberships` table whose foreign keys reject unknown students (probes) | `create-table` |

`registry.ts` places them in curriculum order; `lessons.test.ts` counts 15 SQL lessons.

## 5. Testing

- **Differential (sql.js, `PRAGMA foreign_keys = ON`)**: about 80 scripts over both datasets; compare final tables (all tables, as multisets), each SELECT result, which statement fails, and its constraint rule. The datasets are created in sql.js from the same declarations, constraints included. Coverage: type affinity, automatic ids, defaults, NULL in UNIQUE, CHECK with NULL, composite keys, foreign keys on INSERT / UPDATE / DELETE, failing statements leaving no partial changes, UPDATE reading old values, INSERT … SELECT from the same table, DROP and recreate, DROP of a missing table with and without IF EXISTS.
- **Parser**: every new statement and constraint form parses with lines and columns; malformed and unsupported forms give the expected errors.
- **Steps**: every `codeLine` within the script; at most 400 steps; row ids stable across statements; the final tables equal `runScript`; every statement has a header step; a single SELECT produces the same steps as `querySteps`.
- **Checker**: correct; wrong data; a constraint that should fail but passes, and the reverse; learner script error; two differently worded CREATE TABLE statements both pass.
- **`lessons.test.ts`**: every opening script, example and solution runs; the probe rules from section 3 hold; 15 SQL lessons.
- **Before the PR**: `npm test`, typecheck, `build:pages`, and a browser pass over the five lessons (light and dark, 375px wide).

## Out of scope for phase 2

- `ALTER TABLE`, `ON DELETE`/`ON UPDATE` actions, `INSERT OR …`/`ON CONFLICT`, `RETURNING`
- transactions, indexes and views (phase 4); CASE, set operations, CTEs and window functions (phase 3)
- keeping data between runs
