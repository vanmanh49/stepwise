# SQL track, phase 4: database internals

Date: 2026-10-18
Status: approved design (user asked to proceed straight to implementation)

## Goal

Turn the six "Database internals" topics of the SQL menu into live lessons: **Views**, **Indexes**, **Query Plans**, **Transactions**, **Isolation Levels** and **Normalization**. SQL goes from 22 to 28 live lessons, and every SQL topic is live.

This is phase 4 of 4 (see `2026-10-15-sql-track-phase-1-design.md`, "Phasing").

## Decisions

- **Engine-backed throughout.** Learners type real SQL in every lesson: `CREATE VIEW`, `CREATE INDEX`, `EXPLAIN QUERY PLAN`, `BEGIN`/`COMMIT`/`ROLLBACK`, and two-session scripts for isolation levels. Our own interpreter, extended; sql.js stays a test-only reference.
- **One engine where the plan drives execution.** A planner picks each table's access path; the same plan is printed by `EXPLAIN QUERY PLAN` and used by the executor to fetch rows, so index steps are real and "rows examined" is honest.
- **Indexes are drawn as B-trees** (a new `btree` view), not as sorted tables.
- **Isolation levels follow the SQL standard with a lock-based model** (not SQLite's single-writer behaviour, and not PostgreSQL snapshots), labelled as such in the lesson. This part is not checked against sql.js.
- **One spec, one plan, one PR** on branch `sql-phase-4`; when built: commit, PR, merge.

## 1. Engine (`src/sql/`)

### Schema objects

- `Dataset` gains `indexes: IndexDef[]` (`name`, `table`, `columns: string[]`, `unique`, `implicit`) and `views: ViewDef[]` (`name`, `columns?: string[]`, `sql`, parsed `query`). Both are copied by `cloneDataset`.
- **Implicit indexes**, as in SQLite: a non-INTEGER PRIMARY KEY (single or composite) and each UNIQUE column or UNIQUE constraint gets `sqlite_autoindex_<table>_<n>`, numbered in declaration order. They are created for dataset tables and for `CREATE TABLE`.
- The schema panel lists each table's indexes under it and the views below the tables.

### Statements

- `CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (col [, col …])` and `DROP INDEX [IF EXISTS] name`. Errors: unknown table or column, an existing name ("An index called `x` already exists."), and for UNIQUE, existing duplicates ("Can't create UNIQUE index `x`: rows 3 and 7 both have salary 5200.").
- `CREATE VIEW [IF NOT EXISTS] name [(cols)] AS select` and `DROP VIEW [IF EXISTS] name`. A name can't be both a table and a view. The view's SELECT is checked when created (unknown tables or columns fail then). Reading a view runs its SELECT, as a CTE does; a view can read other views. `INSERT`/`UPDATE`/`DELETE` on a view: "Views are read-only here; change the table it reads from." `DROP TABLE` on a view or `DROP VIEW` on a table name the right statement.
- `DROP TABLE` also drops the table's indexes. A view whose table was dropped fails when read, naming the missing table.
- `EXPLAIN QUERY PLAN select` returns the columns `id, parent, notused, detail`; `detail` uses SQLite's wording (below). `id`/`parent` give the tree; `notused` is 0.
- The `LATER` entries for these statements and for `BEGIN`/`COMMIT` are removed.

### B-tree (`btree.ts`)

- `buildBTree(entries)` bulk-loads sorted `(key: SqlValue[], rowid)` entries into nodes of at most **3 keys** (so 12 rows make 3 levels). Leaves are linked left to right. Keys compare with `compareValues`, column by column; equal keys are ordered by rowid.
- Built from the table's current rows whenever a query uses the index, so it always matches the data.
- `search(tree, bounds)` takes equality values for leading columns plus an optional range on the next column, and returns the nodes visited from the root, the leaf entries scanned and the matching rowids. `IN (…)` runs one search per value.

### Planner (`plan.ts`)

For each table in FROM and each JOIN, **in the order written**, `planSelect(db, stmt)` picks one access path:

1. **Rowid lookup** when WHERE/ON has `pk = expr` on an INTEGER PRIMARY KEY and `expr` only uses earlier tables or constants: `SEARCH t USING INTEGER PRIMARY KEY (rowid=?)`.
2. **Index search** when an index's leading columns are matched by `col = expr` / `col IN (…)` terms, optionally followed by one range term (`<`, `<=`, `>`, `>=`, `BETWEEN`) on the next column: `SEARCH t USING INDEX i (a=? AND b>?)`. Among usable indexes, prefer the one matching the most columns, then a UNIQUE index, then the earlier one. `USING COVERING INDEX` when the index holds every column of `t` the query uses.
3. **Index scan for order** when there is no search but an index's leading column equals the first ORDER BY term (all ascending) or the GROUP BY columns: `SCAN t USING [COVERING] INDEX i`.
4. Otherwise `SCAN t`.

Only AND-ed terms are used. After the access paths, the plan adds `USE TEMP B-TREE FOR ORDER BY`, `… FOR GROUP BY` or `… FOR DISTINCT` when the access path does not already give that order. Subqueries, CTEs and compound SELECTs appear as nested entries with SQLite's labels (`SCALAR SUBQUERY n`, `CORRELATED SCALAR SUBQUERY n`, `LIST SUBQUERY n`, `CO-ROUTINE name` / `MATERIALIZE name`, `COMPOUND QUERY`, `LEFT-MOST SUBQUERY`, `UNION USING TEMP B-TREE` …) where the differential corpus covers them; anything else plans as its parts.

**Not modelled** (and kept out of the differential corpus): join reordering, automatic indexes, OR-by-union, skip-scan, partial and expression indexes, `ANALYZE` statistics.

### Executor

- **Only indexes created with `CREATE INDEX` change execution** (user decision): when a table's planned path uses such an index, its rows come from a B-tree search, so only candidate rows are read; WHERE and ON still run on every candidate, so results never change, and rows come back in index order, as in SQLite. Rowid lookups and implicit `sqlite_autoindex_*` indexes appear in `EXPLAIN QUERY PLAN` but data is still read row by row, so lessons 1–22 step exactly as before. The Query Plans lesson says that SQLite would use those too.
- A new trace event `index-search { table, index, tree, path, scanned, rowids, examined, total }` is emitted for the top-level query's searches of created indexes.
- The work budget counts examined rows, so an index really does less work.

### Transactions (`script.ts`)

- `BEGIN [TRANSACTION]`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT s`, `RELEASE [SAVEPOINT] s`, `ROLLBACK TO [SAVEPOINT] s`. `SAVEPOINT` outside a transaction starts one, as in SQLite.
- Outside a transaction each statement commits on its own (autocommit), as now.
- A statement that fails inside a transaction undoes only itself; the transaction stays open, as in SQLite.
- Errors: `BEGIN` inside a transaction ("A transaction is already open."), `COMMIT`/`ROLLBACK` with none open ("There is no open transaction to commit."), an unknown savepoint ("No savepoint called `s`.").
- A script that ends with a transaction still open rolls it back.
- Trace event `transaction { action: 'begin' | 'commit' | 'rollback' | 'savepoint' | 'release' | 'rollback-to' | 'auto-rollback', name?, tables }`.

### Sessions simulator (`sessions.ts`)

A script is a **sessions script** when its statements start with `A:` or `B:` (every statement must then have one). Up to 40 statements.

- Each session has `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED | READ COMMITTED | REPEATABLE READ | SERIALIZABLE` (default READ COMMITTED, the most common default), `BEGIN`, `COMMIT`, `ROLLBACK`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Other statements: "Only SELECT, INSERT, UPDATE, DELETE and transaction statements can run in a session."
- Outside BEGIN each statement is its own transaction.
- **Data:** committed rows plus each open transaction's uncommitted changes. A session reads committed rows overlaid with its own changes; READ UNCOMMITTED also sees the other session's uncommitted changes. COMMIT applies the changes; ROLLBACK drops them.
- **Locks (row = table + rowid):** writes take exclusive locks held to the end of the transaction. Reads take shared locks on the rows they read:

| Level | Read locks | Effect |
|---|---|---|
| READ UNCOMMITTED | none | can read uncommitted changes (dirty read) |
| READ COMMITTED | released after the statement | no dirty reads; a later read may differ |
| REPEATABLE READ | held to the end of the transaction | rows read can't change; new rows can appear (phantom) |
| SERIALIZABLE | held, and a read with WHERE also locks the table against inserts, updates and deletes by the other session | no phantoms |

- **Waiting:** a statement that needs a lock the other session holds waits; that session's following statements wait behind it, while the other session carries on. When the lock is released, the waiting statement runs. If both sessions wait for each other, it is a deadlock: session B's transaction is rolled back ("Deadlock: B was rolled back so A can continue.") and B's statements up to its next BEGIN are skipped.
- **Anomalies are labelled** when they happen: *dirty read* (a read returns another session's uncommitted change), *non-repeatable read* (a row read earlier in the transaction now has different values), *phantom* (a repeated read with the same WHERE returns rows it did not before), *lost update* (a session overwrites a row that changed since it read it, in the same transaction).
- **Expected matrix** for the four standard scripts (the tests pin it):

| | RU | RC | RR | SER |
|---|---|---|---|---|
| Dirty read | happens | reader waits | reader waits | reader waits |
| Non-repeatable read | happens | happens | writer waits | writer waits |
| Phantom | happens | happens | happens | inserter waits |
| Lost update | happens | happens | deadlock, B rolled back | deadlock, B rolled back |

- The result of a sessions script is the result of its last SELECT that ran (for exercises).

## 2. Steps and visualization

- **`btree` view** (new `BTreeView` in `types/visualization.ts`): nodes with several keys, edges, linked leaves, and roles for the visited path and matching entries. Laid out level by level; at 375px it scrolls inside its box. `TableView` gains an optional `index?: BTreeView` drawn above its tables.
- **Index steps:** "Search idx_salary for salary > 5000" (root highlighted) → one step per level down → "Scan the leaves: 5 matches" → "Fetch 5 rows by rowid" (the table, with fetched rows marked) → "Examined 5 of 12 rows; a full scan reads 12." Then the usual WHERE/SELECT steps on the candidates.
- **EXPLAIN QUERY PLAN steps:** the plan as an indented tree (one step per entry, linked to the clause it serves), then the result rows.
- **View steps:** "VIEW dept_pay: 4 rows" at the line that reads it, like a CTE step.
- **Transaction steps:** "BEGIN: changes are now pending", pending rows marked (`pending` role: inserted, changed, deleted), "COMMIT: 2 changes kept" / "ROLLBACK: 2 changes undone" / "ROLLBACK TO s: 1 change undone", "The script ended inside a transaction, so its changes are undone."
- **`sessions` view** (new `SessionsView`): two columns (A | B), one row per statement in order, each with its status (ran, waiting, resumed, skipped, error) and any anomaly label, plus the table as each session sees it. One step per statement event; a step for each wait and resume.
- **Normalization** uses existing steps (phase 2 scripts).

## 3. Data and lessons

### `bank` dataset

`accounts(id INTEGER PRIMARY KEY, owner TEXT NOT NULL, balance INTEGER NOT NULL CHECK (balance >= 0))`: 1 An 500, 2 Binh 300, 3 Chi 0, 4 Dung 1200. `transfers(id INTEGER PRIMARY KEY, from_id INTEGER REFERENCES accounts(id), to_id INTEGER REFERENCES accounts(id), amount INTEGER NOT NULL CHECK (amount > 0))`: 1 (1 → 2, 100), 2 (4 → 3, 250).

### `signups` dataset

`course_signups(student TEXT, student_email TEXT, course TEXT, course_title TEXT, teacher TEXT, teacher_room TEXT, grade INTEGER)`, no keys, 10 rows: four students, three courses, two teachers; each student's email repeats once per course; teacher Ha's room is `B12` in three rows and `B21` in one (the update anomaly).

### Lessons

Ids, titles, difficulty and group come from the curriculum. Each has 3–4 examples, 2–3 exercises, the standard content, and 4–5 quiz questions with at least one `table` view.

| Lesson | Data | Opening script | Examples | Exercises | Prerequisites |
|---|---|---|---|---|---|
| Views | company | `CREATE VIEW dept_pay AS …; SELECT * FROM dept_pay;` | A view of employees with manager names; a view in a JOIN; a view with a column list; `Fails:` INSERT into a view | Create `manager_names` (employee, manager) and select from it; a view of departments above 10,000 total salary (probes) | ctes, create-table |
| Indexes | company | `CREATE INDEX idx_salary ON employees(salary); SELECT name, salary FROM employees WHERE salary > 5000;` | Equality search; a two-column index; UNIQUE index; `Fails:` UNIQUE index over duplicate salaries | Make `WHERE hired > '2020-01-01'` search instead of scan; an index for `department_id = ? AND salary > ?` (probes are EXPLAIN QUERY PLAN and the query) | where, order-by-limit, create-table |
| Query Plans | company | `CREATE INDEX idx_dept ON employees(department_id); EXPLAIN QUERY PLAN SELECT … JOIN …;` | SCAN vs SEARCH; covering index; ORDER BY served by an index vs TEMP B-TREE; rowid lookup in a join | Make a query use a covering index; remove the TEMP B-TREE for `ORDER BY salary` (probes) | indexes, inner-join |
| Transactions | bank | A transfer of 100 from An to Binh in `BEGIN … COMMIT` | ROLLBACK; a CHECK failure inside a transaction; SAVEPOINT and ROLLBACK TO; ending without COMMIT | Transfer 200 from Dung to Chi and record it in transfers, in one transaction; start a transfer that would overdraw, then roll it back (probes) | update, constraints |
| Isolation Levels | bank | Sessions: A reads An's balance, B updates and commits, A reads again (READ COMMITTED: non-repeatable read) | Dirty read under READ UNCOMMITTED; phantom under REPEATABLE READ; lost update and deadlock | Change A's level so its two reads agree; prevent the phantom (last SELECT compared) | transactions |
| Normalization | signups | `SELECT … FROM course_signups` showing repeats and Ha's two rooms | Grouping to find the repeats; the update anomaly; a 3NF split with CREATE TABLE + INSERT … SELECT; the JOIN that rebuilds the original | Split into students, courses and enrollments (probes check the tables and a rebuilding JOIN); move teachers into their own table | many-to-many, constraints |

`registry.ts` places them in curriculum order; `lessons.test.ts` counts 28 SQL lessons. Nothing in SQL is "Coming soon" any more.

## 4. Testing

- **B-tree:** shape at 0, 1, 3, 4, 12 and 40 entries; equality, range and composite searches; the visited path; duplicates ordered by rowid.
- **Planner:** each rule, preference order, covering detection, temp B-tree entries.
- **Differential (sql.js):** at least 40 `EXPLAIN QUERY PLAN` queries whose `detail` column matches SQLite's exactly; at least 30 scripts with views, indexes and transactions that must leave the same tables, return the same results and fail at the same statement; every phase 1–3 corpus query returns the same rows (as a multiset) after adding indexes on the columns it filters, joins or sorts on.
- **Transactions:** state after each statement, savepoint nesting, a failure inside a transaction, auto-rollback at the end.
- **Sessions:** the 4 × 4 matrix above, waiting and resuming, deadlock, statement-limit and unsupported-statement errors.
- **Steps:** `codeLine` in range; at most 400 steps; index steps follow the B-tree path; sessions steps show waits and resumes.
- **Lessons:** the existing lesson tests; 28 SQL lessons.
- **Before the PR:** `npm test`, typecheck, `build:pages`, and a browser pass over the six lessons (light and dark, 375px).

## Out of scope for phase 4

- Join reordering, automatic indexes, OR optimisation, skip-scan, partial/expression indexes, `ANALYZE`
- MVCC/snapshot isolation (PostgreSQL), more than two sessions, `SELECT … FOR UPDATE`, lock timeouts
- Updatable views, `INSTEAD OF` triggers, materialized views
- BCNF and higher normal forms beyond a mention in the Normalization lesson
