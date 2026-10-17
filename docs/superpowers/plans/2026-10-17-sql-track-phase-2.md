# SQL Track Phase 2 (Modifying Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the five "Modifying data" SQL topics (INSERT, UPDATE, DELETE, CREATE TABLE, Constraints) into live lessons, with scripts that change a fresh copy of the sample database on every run.

**Architecture:** `src/sql/` gains a script parser, a write executor with SQLite-compatible constraint enforcement (foreign keys on), and a script step builder that reuses phase 1's trace-to-steps machinery. A database at run time is a deep copy of a `Dataset` whose tables carry constraint declarations and stable row ids. Exercises gain probe statements that are run on the database a script leaves behind.

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Vitest; `sql.js` (devDependency) as the reference engine in tests.

**Spec:** `docs/superpowers/specs/2026-10-17-sql-track-phase-2-design.md`

## Global Constraints

- Branch `sql-phase-2`; commands run from the repo root.
- No new dependencies. No React inside `src/sql/`.
- Entry points never throw: `runScript`, `scriptSteps`, `runQuery`, `querySteps` return `{ ok: false, error: SqlError }` on failure; unexpected exceptions go through `asSqlError`.
- Scripts: 1–10 statements, at most 2,000 characters (`MAX_QUERY_LENGTH`).
- A table holds at most 50 rows after any statement; a script may create at most 10 tables. Both give `limit` errors.
- Semantics match SQLite 3 with `PRAGMA foreign_keys = ON` for the supported subset. Per-row checks for NOT NULL, UNIQUE, PRIMARY KEY and CHECK; foreign keys checked at the end of each statement (SQLite's immediate constraints).
- Supported column types: exactly `INTEGER`, `REAL`, `TEXT` (case-insensitive). Anything else is an `unsupported` error naming the three.
- At most 400 steps per script; statement header steps are never summarised away.
- Copy style: plain English and short sentences, matching phase 1 lessons (see `src/lessons/sql/left-join.ts`).
- Commit messages and PR text contain no AI attribution (user instruction overrides any default trailer).

## Review Focus

1. **A runtime error in a later statement** (unknown column in statement 3 after statements 1–2 changed data). Expected: the error message with the line in the whole script, as today; the earlier statements are not silently lost (the error says "Statement 3 of 3 failed", and the learner can see the steps up to it). Pinned in Task 6.
2. **Semicolons inside string literals and comments** (`INSERT INTO t VALUES ('a;b')`, `-- note;`). Expected: one statement, not two. Pinned in Task 2.
3. **Forgetting WHERE in UPDATE/DELETE** on the 50-row cap or with a foreign key in the way. Expected: every row changes (or the FK failure step), never a silent partial change. Pinned in Task 4.
4. **Scripts producing more than 400 steps** (INSERT … SELECT of 40 rows then UPDATE of all). Expected: summarised steps, every statement header kept, final tables correct. Pinned in Task 6.
5. **Names colliding with the sample tables** (`CREATE TABLE customers`, `DROP TABLE customers` while orders reference it). Expected: "Table `customers` already exists" / the FOREIGN KEY failure, matching SQLite. Pinned in Tasks 4 and 5.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/sql/schema.ts` (new) | Column and table constraint types; `columnNotes`, `createTableSql` | 1 |
| `src/sql/datasets/{index,shop,school}.ts` | Dataset types use the schema types; constraint declarations; `cloneDataset` | 1 |
| `src/sql/sqlite.testutil.ts` | Creates tables from `createTableSql`, foreign keys on, `run(script)` helper | 1 |
| `src/sql/execute.ts` | `scan` uses stable row ids and wraps non-integer numbers as `Real` | 1 |
| `src/sql/values.ts` | `applyAffinity` | 3 |
| `src/sql/ast.ts`, `src/sql/parse.ts` | Statement AST; `parseScript`, `parseExpression`; `LATER` update | 2 |
| `src/sql/errors.ts` | `'constraint'` kind with `ConstraintInfo` | 4 |
| `src/sql/write.ts` (new) | INSERT / UPDATE / DELETE / CREATE / DROP execution with trace events | 4 |
| `src/sql/constraints.ts` (new) | Row checks and statement-end foreign-key checks | 4 |
| `src/sql/script.ts` (new) | `runScript` | 4 |
| `src/sql/scriptSteps.ts` (new) | `scriptSteps`, `scriptViewAt` | 6 |
| `src/sql/steps.ts` | Exports `Draft`, `buildDrafts`, `fit`, `toTable` for reuse | 6 |
| `src/sql/check.ts` | Probes | 8 |
| `src/types/visualization.ts`, `renderers/TableRenderer.tsx`, `components/sql/SchemaPanel.tsx`, `inputs/SqlInput.tsx` | Column notes; scripts in the editor | 7 |
| `src/types/lesson.ts` | `SqlExercise.probes` | 8 |
| `src/lessons/sql/{insert,update,delete,create-table,constraints}.ts` (new) | Lessons | 10–14 |
| `src/lessons/registry.ts`, `src/lessons/lessons.test.ts` | Registration and SQL lesson rules | 9–14 |

---

### Task 1: Schema types, dataset constraints, stable row ids

**Files:** Create `src/sql/schema.ts`, `src/sql/schema.test.ts`. Modify `src/sql/datasets/index.ts`, `shop.ts`, `school.ts`, `datasets.test.ts`, `src/sql/sqlite.testutil.ts`, `src/sql/execute.ts` (`scan`).

**Interfaces — Produces:**
```ts
// schema.ts
export interface ColumnDef {
  name: string;
  type: ColumnType;                 // 'INTEGER' | 'REAL' | 'TEXT' (moved here from datasets/index.ts and re-exported there)
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  default?: number | string | null; // literal only
  check?: string;                   // SQL expression text over this row's columns
  references?: { table: string; column: string };
}
export interface TableSchema {
  name: string;
  columns: ColumnDef[];
  primaryKey?: string[];            // table-level, composite
  unique?: string[][];
  checks?: string[];
  foreignKeys?: { columns: string[]; table: string; refColumns: string[] }[];
}
export function isRowidAlias(table: TableSchema): string | undefined; // the single INTEGER PRIMARY KEY column, if any
export function columnNotes(table: TableSchema): string[];           // one badge string per column
export function createTableSql(table: TableSchema): string;          // CREATE TABLE text SQLite accepts

// datasets/index.ts
export interface DatasetTable extends TableSchema {
  rows: (number | string | null)[][];
  /** Stable ids, parallel to rows; absent on the static datasets (scan falls back to `${name}#${i}`). */
  rowIds?: string[];
}
export function cloneDataset(db: Dataset): Dataset; // deep copy with rowIds filled in as `${name}#${i}`
```
`columnNotes` output per column, space-joined in this order: `PK` (column or composite member), `NOT NULL`, `UNIQUE`, `DEFAULT <value>`, `CHECK`, `→ table.column` (column `references` or a single-column table FK); empty string when none.

- [ ] **Step 1: Write failing tests** in `schema.test.ts`:
  - `columnNotes` of the declared `order_items` → `['PK → orders.id', 'PK → products.id', 'CHECK']`; of `customers` → `['PK', 'NOT NULL', '', '']`.
  - `createTableSql(customers)` equals `CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, joined TEXT)`; `createTableSql(order_items)` equals `CREATE TABLE order_items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER CHECK (quantity > 0), PRIMARY KEY (order_id, product_id))`. Single-column foreign keys and checks are declared on the column (`references`, `check`); table-level `foreignKeys` and `checks` are used only by CREATE TABLE scripts that write them that way.
  - `isRowidAlias(customers) === 'id'`, `isRowidAlias(order_items) === undefined`.
  - `cloneDataset(shop)` is deep (mutating a clone row leaves `datasets.shop` unchanged) and fills `rowIds` with `customers#0`… .
  - In `datasets.test.ts`: every dataset loads into sql.js via the updated `openSqlite` with foreign keys on, and `PRAGMA foreign_key_check` returns no rows; the declarations are exactly those in spec §1 "Sample datasets gain constraints".
  - In `execute.test.ts`: a query over a cloned dataset whose `rowIds` were changed reports those ids in trace `scan` relations; a value `2.5` stored in an INTEGER column divides as a real (`SELECT x / 2` → `1.25`).
- [ ] **Step 2: Run** `npx vitest run src/sql`. Expected: FAIL (missing module / exports).
- [ ] **Step 3: Implement** the types and helpers, the declarations from spec §1, `cloneDataset`, `openSqlite` creating tables with `createTableSql`, running `PRAGMA foreign_keys = ON`, and gaining `run(script: string): { error?: string }` plus `tables(): Record<string, Cell[][]>` for later differential tests. In `scan`, use `table.rowIds?.[i] ?? \`${table.name}#${i}\`` and wrap a number as `Real` when the column is REAL **or** the number is not an integer.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass (phase 1 differential tests unchanged).
- [ ] **Step 5: Commit** `Declare constraints on the sample databases`

### Task 2: Script parsing

**Files:** Modify `src/sql/ast.ts`, `src/sql/parse.ts`. Create `src/sql/parseScript.test.ts`.

**Interfaces — Produces:**
```ts
// ast.ts
export type Statement =
  | { kind: 'select'; select: SelectStatement; line: number }
  | { kind: 'insert'; table: TableRef; columns?: string[]; values?: Expr[][]; select?: SelectStatement; line: number; lines: { INSERT: number; VALUES?: number; SELECT?: number } }
  | { kind: 'update'; table: TableRef; set: { name: string; expr: Expr; line: number; column: number }[]; where?: Expr; line: number; lines: { UPDATE: number; SET: number; WHERE?: number } }
  | { kind: 'delete'; table: TableRef; where?: Expr; line: number; lines: { DELETE: number; WHERE?: number } }
  | { kind: 'create'; schema: TableSchema; checkExprs: Expr[]; line: number }   // every CHECK parsed once
  | { kind: 'drop'; table: string; ifExists: boolean; line: number; column: number };
export type WriteClause = 'INSERT' | 'VALUES' | 'UPDATE' | 'SET' | 'DELETE' | 'CREATE TABLE' | 'DROP TABLE';

// parse.ts
export type ScriptParse = { ok: true; statements: Statement[] } | { ok: false; error: SqlError };
export function parseScript(sql: string): ScriptParse;
export function parseExpression(text: string): Expr; // throws SqlError; used for dataset CHECK text
export const MAX_STATEMENTS = 10;
```
`parseQuery` keeps its behaviour, including "Run one statement at a time." for multi-statement input.

- [ ] **Step 1: Write failing tests** in `parseScript.test.ts`:
  - `"INSERT INTO t (a, b) VALUES (1, 'x'), (2, NULL);\nSELECT * FROM t"` → two statements, kinds `insert`, `select`, lines 1 and 2, two value rows.
  - `INSERT INTO t SELECT * FROM u`, `UPDATE t SET a = a + 1, b = 'y' WHERE c IS NULL`, `DELETE FROM t`, `DROP TABLE IF EXISTS t` parse to the expected shapes, with clause lines on multi-line input.
  - `CREATE TABLE m (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, age INTEGER DEFAULT 0 CHECK (age >= 0), club_id INTEGER REFERENCES clubs(id), PRIMARY KEY (id), UNIQUE (email, age), FOREIGN KEY (club_id) REFERENCES clubs(id))` → `TableSchema` with each field set.
  - `"INSERT INTO t VALUES ('a;b'); -- c;d\nSELECT 1 FROM t"` → exactly two statements; the string value is `a;b`.
  - 11 statements → `limit` error "Scripts are limited to 10 statements."; empty script → "Write a statement to run."
  - `ALTER TABLE t ADD c`, `INSERT OR REPLACE INTO t …`, `… REFERENCES p(id) ON DELETE CASCADE`, `UPDATE … RETURNING *`, `CREATE INDEX …`, `CREATE VIEW …`, `BEGIN` → `unsupported` errors naming the feature; column type `VARCHAR(20)` → `unsupported` "Use INTEGER, REAL or TEXT."; a CHECK containing a subquery → `unsupported`.
  - Error positions: `UPDATE t SET = 1` reports line/column of `=`.
  - `parseExpression('quantity > 0')` returns a binary expression.
- [ ] **Step 2: Run** `npx vitest run src/sql/parseScript.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** statement parsers on the existing `Parser` class (one method per statement; statements split by `;` tokens, so literals and comments are already safe). Update `LATER`: remove INSERT, UPDATE, DELETE, CREATE (TABLE), DROP; add INDEX → `indexes`, VIEW → `views`, BEGIN/COMMIT/ROLLBACK → `transactions`, ALTER → undefined. Add `PRIMARY`, `KEY`, `UNIQUE`, `CHECK`, `DEFAULT`, `REFERENCES`, `FOREIGN`, `IF`, `REPLACE`, `RETURNING`, `CONFLICT`, `INDEX`, `VIEW`, `BEGIN`, `COMMIT`, `ROLLBACK`, `CASCADE` to `KEYWORDS` only where needed for parsing or for a clear unsupported message.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass (phase 1 parser tests unchanged).
- [ ] **Step 5: Commit** `Parse scripts of INSERT, UPDATE, DELETE, CREATE TABLE and DROP TABLE`

### Task 3: Type affinity

**Files:** Modify `src/sql/values.ts`, `src/sql/values.test.ts`.

**Interfaces — Produces:** `export function applyAffinity(value: SqlValue, type: ColumnType): number | string | null` — the stored (plain) value.

- [ ] **Step 1: Write failing tests**: INTEGER: `'5'`→`5`, `' 5 '`→`5`, `'2.5'`→`2.5`, `'abc'`→`'abc'`, `new Real(3)`→`3`, `new Real(2.5)`→`2.5`, `null`→`null`; REAL: `5`→`5`, `'2.5'`→`2.5`, `'x'`→`'x'`; TEXT: `5`→`'5'`, `new Real(2.5)`→`'2.5'`, `new Real(3)`→`'3.0'`, `'a'`→`'a'`.
- [ ] **Step 2: Run** `npx vitest run src/sql/values.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per SQLite's affinity rules for these three types (text converts only when the whole trimmed text is a well-formed number; TEXT formats numbers with `formatValue`).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Convert stored values by column type, as SQLite does`

### Task 4: Write executor, constraints and `runScript`

**Files:** Create `src/sql/write.ts`, `src/sql/constraints.ts`, `src/sql/script.ts`, `src/sql/script.test.ts`. Modify `src/sql/errors.ts`, `src/sql/execute.ts` (export `filter` and its trace type for reuse).

**Interfaces:**
- Consumes: `parseScript`, `Statement` (Task 2); `applyAffinity` (Task 3); `cloneDataset`, `isRowidAlias`, `TableSchema` (Task 1); `executeSelect`, `filter` (execute.ts).
- Produces:
```ts
// errors.ts
export type SqlErrorKind = 'syntax' | 'name' | 'unsupported' | 'limit' | 'constraint';
export interface ConstraintInfo { rule: 'NOT NULL' | 'UNIQUE' | 'PRIMARY KEY' | 'CHECK' | 'FOREIGN KEY'; table: string; column?: string }
// SqlError gains an optional readonly `constraint?: ConstraintInfo`

// write.ts
export type WriteEvent =
  | { kind: 'statement-start'; index: number; total: number; statement: Statement }
  | { kind: 'inserted'; table: string; rowId: string; filled: string[]; relation: Relation }   // filled = columns given a default or automatic id
  | { kind: 'select-for-insert'; result: QueryResult }
  | { kind: 'updated'; table: string; rowId: string; changed: { column: string; before: SqlValue; after: SqlValue }[]; relation: Relation }
  | { kind: 'deleted'; table: string; rowIds: string[]; before: Relation; relation: Relation }
  | { kind: 'created'; schema: TableSchema; relation: Relation }
  | { kind: 'dropped'; table: string; before: Relation }
  | { kind: 'violation'; error: SqlError; table: string; rowId: string; clashWith?: { table: string; rowId: string }; relation: Relation }  // relation = the table as it was when the row failed
  | { kind: 'rolled-back'; table: string; relation: Relation }
  | TraceEvent;                     // WHERE row checks reuse phase 1's 'filter-test' / 'filtered'
export function executeStatement(db: Dataset, statement: Statement, trace?: (e: WriteEvent) => void): { affected: number; result?: QueryResult };

// script.ts
export interface StatementOutcome { kind: Statement['kind']; line: number; affected: number; result?: QueryResult }
export type ScriptResult =
  | { ok: true; db: Dataset; statements: StatementOutcome[] }
  | { ok: false; error: SqlError; db: Dataset; statements: StatementOutcome[]; failedIndex: number }; // db = state after the earlier statements
export function runScript(db: Dataset, sql: string, trace?: (e: WriteEvent) => void): ScriptResult;
```
Rules (spec §1): fresh `cloneDataset` per call; statements in order; stop at the first error; the failing statement's changes are undone (snapshot the affected table(s) before each statement and restore on error); new row ids `${table}+${n}` counting up per table; INTEGER PRIMARY KEY gets `max + 1` (or 1) when omitted or NULL; UPDATE evaluates all SET expressions against the old row; INSERT … SELECT reads the table before the statement; NOT NULL / UNIQUE / PRIMARY KEY / CHECK per written row; FOREIGN KEY at statement end, both directions (a child must have a parent; a deleted or changed parent must have no remaining children); DROP TABLE deletes all rows first under the same FK rule, then removes the table. Error messages (exact form, tests assert them): `NOT NULL failed: members.email can't be NULL (row 2).` / `UNIQUE failed: students.email already has 'mai@school.edu' (row 1).` / `PRIMARY KEY failed: …` / `CHECK failed: quantity > 0 is false for this row.` / `FOREIGN KEY failed: orders.customer_id 99 has no matching customers.id.` / `FOREIGN KEY failed: customers row 1 still has rows in orders that refer to it.` / `Table \`x\` already exists.` / `No table \`x\`.` (with suggestion) / `This table would hold more than 50 rows.`

- [ ] **Step 1: Write failing tests** in `script.test.ts` (each asserts the final table contents with `toPlain`, and errors by `kind`, `constraint.rule` and message):
  - INSERT with column list, without (all columns), multi-row, defaults, automatic ids (`max + 1`, and 1 on an empty created table), type affinity on insert.
  - INSERT … SELECT into a created table; INSERT … SELECT from the same table doubles it exactly once.
  - UPDATE with WHERE, without WHERE (every row), swapping two columns `SET a = b, b = a`, SET with a subquery; affected counts.
  - DELETE with WHERE, without WHERE on `order_items`, with a subquery.
  - NOT NULL, UNIQUE (NULLs never clash), composite PRIMARY KEY, CHECK false fails / NULL passes, FK on insert, FK on update of child, deleting a parent with children fails, deleting children then parent in two statements succeeds.
  - `UPDATE products SET id = id + 1` fails with PRIMARY KEY (per-row check, as SQLite) and leaves products unchanged.
  - A failing third statement: `ok: false`, `failedIndex: 2`, `db` reflects statements 1–2, the error line is the third statement's line.
  - `CREATE TABLE customers (…)` → `Table \`customers\` already exists.`; `DROP TABLE customers` → FOREIGN KEY failure; `DROP TABLE order_items` succeeds and a later `SELECT * FROM order_items` → no-table error; `DROP TABLE IF EXISTS nope` succeeds.
  - 51st row → `limit` error; 11th CREATE TABLE → `limit`.
  - Each call starts fresh: running the same INSERT script twice gives the same result, and `datasets.shop` is unchanged.
- [ ] **Step 2: Run** `npx vitest run src/sql/script.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `constraints.ts` (`checkRow(db, table, values, rowIndex | null): void` throwing the constraint `SqlError`; `checkForeignKeys(db, touched: Set<string>): void`; CHECK expressions parsed once per table with `parseExpression` and evaluated with `evaluateTruth` against the row), `write.ts`, `script.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Commit** `Run INSERT, UPDATE, DELETE, CREATE TABLE and DROP TABLE scripts with constraints`

### Task 5: Differential scripts against SQLite

**Files:** Create `src/sql/scriptCorpus.testutil.ts`, `src/sql/scriptDifferential.test.ts`.

**Interfaces — Consumes:** `runScript` (Task 4), `openSqlite(…).run/tables` (Task 1).

- [ ] **Step 1: Write the corpus**: `export const scriptCorpus: { db: DatasetId; sql: string }[]` with at least 80 scripts covering every bullet of spec §5 "Differential", plus each Review Focus item 5 case. Each script ends with zero or more SELECTs.
- [ ] **Step 2: Write the test**: for each script, run ours and SQLite (fresh database each time; SQLite runs statement by statement so the failing index is known). Assert: same failing statement index (or both succeed); when failing, our `constraint.rule` matches the SQLite message (`NOT NULL constraint failed` / `UNIQUE constraint failed` / `CHECK constraint failed` / `FOREIGN KEY constraint failed`; SQLite reports PRIMARY KEY of a non-rowid table as UNIQUE, so map PRIMARY KEY → UNIQUE for that comparison); every table equal as a multiset of rows after normalising numbers; each SELECT's rows equal (as multiset unless the SELECT has ORDER BY).
- [ ] **Step 3: Run** `npx vitest run src/sql/scriptDifferential.test.ts`. Expected: PASS. Any mismatch is a bug in Task 4's code: fix it there with a failing unit test in `script.test.ts` first.
- [ ] **Step 4: Prove the harness bites**: temporarily change `applyAffinity` so INTEGER keeps text; at least one corpus script must fail; revert.
- [ ] **Step 5: Commit** `Check write scripts against SQLite`

### Task 6: Script steps

**Files:** Create `src/sql/scriptSteps.ts`, `src/sql/scriptSteps.test.ts`. Modify `src/sql/steps.ts` (export `Draft`, `buildDrafts`, `fit`, `toTable`; let `fit` keep drafts flagged `pinned`), `src/types/visualization.ts` (`SqlTable.columnNotes?: string[]`).

**Interfaces — Produces:**
```ts
export type ScriptStepsResult =
  | { ok: true; steps: Step[]; result: ScriptResult }   // includes constraint failures: steps end on the violation and roll-back
  | { ok: false; error: SqlError };                       // syntax errors and non-constraint runtime errors
export function scriptSteps(db: Dataset, sql: string): ScriptStepsResult;
export function scriptViewAt(db: Dataset, sql: string, index: number): TableView; // throws, for lesson quizzes
```
Step content follows spec §2 exactly (header per statement with `pinned`, clause bars `['UPDATE','WHERE','SET']` etc., `codeLine` = the clause's line in the script, notes `inserted` / `city: Hue → Hanoi` / `deleted`, `focus` on changed cells, violation with `discarded` + `compare` rows, roll-back step, final step with up to three changed tables then the last SELECT result). A non-constraint runtime error in statement k returns `ok: false` with message prefixed `Statement k of n failed: `. Tables built from a stored table carry `columnNotes` from Task 1.

- [ ] **Step 1: Write failing tests**:
  - A single SELECT: `scriptSteps` steps deep-equal `querySteps` steps.
  - `INSERT …; UPDATE …; SELECT …` (the spec §2 example): header titles `Statement 1 of 3: INSERT INTO customers`, `Statement 2 of 3: UPDATE customers`, `Statement 3 of 3: SELECT`; the inserted row has note `inserted` and role `found`; the update step note is `city: Hue → Hanoi` with `focus` on the city column; every `codeLine` within the script; row ids stable from insert to update.
  - DELETE: deleted rows `discarded` with note `deleted`, followed by a step without them.
  - UNIQUE violation: a step whose view has the new row `discarded` and the clashing row `compare`, `why` containing `UNIQUE failed`, then a roll-back step; `result.ok === false`.
  - Unknown column in statement 3: `ok: false`, message starts `Statement 3 of 3 failed:`, line is in statement 3.
  - Big script (create a table, insert … select 40 rows, update all): `steps.length <= 400`, all three header steps present, final step tables equal `runScript`'s db.
  - CREATE TABLE step's table has `columnNotes` from the declared constraints; the final step lists at most three tables.
- [ ] **Step 2: Run** `npx vitest run src/sql/scriptSteps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `scriptSteps` by collecting `WriteEvent`s from `runScript`, turning SELECT statements' events into drafts with phase 1's `buildDrafts` (line numbers offset to the script), write events into drafts here, and one `fit` over the whole script.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Commit** `Step through scripts statement by statement`

### Task 7: Editor, table renderer and schema panel

**Files:** Modify `src/components/visualization/inputs/SqlInput.tsx`, `renderers/TableRenderer.tsx`, `src/components/sql/SchemaPanel.tsx`. Create `src/components/visualization/renderers/tableNotes.test.ts` (pure helper `notesRow(table: SqlTable): string[] | undefined` in `renderers/tableNotes.ts`).

- [ ] **Step 1: Write failing test**: `notesRow` returns `undefined` when `columnNotes` is absent or all empty, else the notes padded to the column count.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement**: `TableRenderer` renders `notesRow` as a muted mono row under the header; `SchemaPanel` shows `columnNotes` next to each column type; `SqlInput` runs `scriptSteps` (label "Your script" when the lesson's `initialQuery` has more than one statement, else "Your query"; help text "Separate statements with ;. Each run starts from a fresh copy of the data."; on `ok: false` show the error as today).
- [ ] **Step 4: Run** `npm test && npm run typecheck`, then `npm run dev` and open `/sql/where` (phase 1 unchanged) . Expected: tests pass; WHERE lesson behaves as before.
- [ ] **Step 5: Commit** `Run scripts in the SQL editor and show column constraints`

### Task 8: Probe-based checking

**Files:** Modify `src/types/lesson.ts` (`SqlExercise.probes?: string[]`), `src/sql/check.ts`, `src/sql/check.test.ts`.

**Interfaces — Produces:**
```ts
export type ProbeOutcome =
  | { kind: 'rows'; columns: number; keys: string[] }               // valueKey-joined rows
  | { kind: 'constraint'; rule: ConstraintInfo['rule']; table: string }
  | { kind: 'error'; message: string };
export function probeOutcomes(db: Dataset, script: string, probes: string[]): ProbeOutcome[] | SqlError; // runs probes on copies of the script's resulting db
// CheckResult gains: | { status: 'probe'; index: number; probe: string; expected: ProbeOutcome; actual: ProbeOutcome }
```
`checkExercise` without probes is unchanged; with probes it follows spec §3. `describeCheck` for `probe`: rows differ → `After your script, \`<probe>\` gives <n> rows that differ.`; expected constraint, got rows → `<probe as summary> should fail (<rule>), but your table accepted it.`; expected rows, got constraint → `This should succeed, but your table rejected it (<rule> on <table>).`; other → `\`<probe>\` behaves differently after your script.`

- [ ] **Step 1: Write failing tests**: an UPDATE exercise solved correctly; solved with a missing WHERE (probe mismatch with the "rows that differ" text); a CREATE TABLE exercise with probes passes for `email TEXT NOT NULL UNIQUE` and `email TEXT UNIQUE NOT NULL` alike, fails with the "should fail (NOT NULL)" text when NOT NULL is missing, and with "should succeed" when an extra CHECK rejects a good row; a learner script error returns `status: 'error'`; phase 1 exercises still behave as before.
- [ ] **Step 2: Run** `npx vitest run src/sql/check.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Commit** `Check write exercises with probes`

### Task 9: SQL lesson test rules for scripts

**Files:** Modify `src/lessons/lessons.test.ts`.

- [ ] **Step 1: Change the SQL lesson block**: examples and `initialQuery` must run with `scriptSteps` (`ok: true` and, for examples meant to show a failure, a violation step — mark those with a label starting "Fails:"; every other example must not fail); `defaultSteps` uses `scriptSteps`; for exercises with probes: every probe on the solution's database gives a non-`error` outcome, and `probeOutcomes(untouched dataset, '', probes)` differs from the solution's outcomes in at least one probe; `asks a quiz question about a table` unchanged.
- [ ] **Step 2: Run** `npm test`. Expected: PASS for the 10 existing SQL lessons (they have no probes and no failing examples).
- [ ] **Step 3: Commit** `Prepare the SQL lesson tests for scripts and probes`

## Lesson tasks (10–14)

Each lesson task follows the same steps; the table gives what is specific.

- [ ] **L1: Write the lesson** `src/lessons/sql/<id>.ts` exporting a `Lesson` with `category: 'sql'`, no `complexity`, `code === visualization.initialQuery`, 3–4 examples, 2–3 exercises (write exercises use probes), content per the Global Constraints of the phase 1 lessons (overview, ≥2 concept paragraphs, ≥4 how-it-works, ≥3 applications, ≥3 mistakes, ≥3 summary, 4–5 quiz questions of ≥3 types, one with `view: scriptViewAt(...)`).
- [ ] **L2: Register** in `registry.ts` after the last SQL lesson in curriculum order; in `lessons.test.ts` add the id to `EXPECTED_IDS` and raise the SQL count by one.
- [ ] **L3: Run** `npm test && npm run typecheck`. Expected: all pass.
- [ ] **L4: Commit** `Add <Title> lesson`.

| Task | Lesson | Dataset | Opening script | Examples | Exercises (probes) | Prereqs |
|---|---|---|---|---|---|---|
| 10 | `insert` INSERT | shop | `INSERT INTO customers (id, name, city, joined) VALUES (11, 'Tam', 'Hue', '2024-03-01');\nSELECT * FROM customers WHERE id = 11;` | Several rows at once; leave out `city` (NULL) and `id` (automatic); `CREATE TABLE books …` then `INSERT … SELECT`; `Fails: missing name` (NOT NULL) | Add product 10 'Mug', Kitchen, 7.5 (probe `SELECT * FROM products`); add two customers in one statement (probe `SELECT name, city FROM customers`); copy Books products into a new `books` table (the prompt gives the `CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, price REAL)` line to start with, and the solution includes it; probe `SELECT * FROM books`) | `select-from` |
| 11 | `update` UPDATE | shop | `UPDATE customers SET city = 'Hanoi' WHERE id = 4;\nSELECT * FROM customers WHERE id = 4;` | Books +10%; SET from an expression; `UPDATE` without WHERE; SET with a subquery | Mark pending orders shipped (probe `SELECT id, status FROM orders`); city 'Unknown' where NULL (probe `SELECT id, city FROM customers`) | `where` |
| 12 | `delete` DELETE | shop | `DELETE FROM order_items WHERE order_id = 3;\nSELECT * FROM order_items;` | WHERE with a subquery; delete all `order_items`; `Fails: customer with orders` (FOREIGN KEY) | Delete items of cancelled orders (probe `SELECT * FROM order_items`); delete products never ordered (probe `SELECT id FROM products`) | `where` |
| 13 | `create-table` CREATE TABLE | school | `CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT, founded INTEGER);\nINSERT INTO clubs (name, founded) VALUES ('Chess', 2019), ('Drama', 2021);\nSELECT * FROM clubs;` | Type conversion (`'2020'` into INTEGER); DEFAULT; automatic id; `DROP TABLE IF EXISTS` then recreate | `rooms (id INTEGER PRIMARY KEY, name TEXT, seats INTEGER)` (probes: insert without id gets id 1; `seats` given `'30'` stores 30; select); `clubs` with three rows (probe `SELECT name FROM clubs`) | `insert` |
| 14 | `constraints` Constraints | school | `CREATE TABLE members (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), email TEXT UNIQUE, age INTEGER CHECK (age >= 16));\nINSERT INTO members (student_id, email, age) VALUES (1, 'mai@club.vn', 18);\nINSERT INTO members (student_id, email, age) VALUES (2, 'mai@club.vn', 19);` | `Fails: NOT NULL and UNIQUE`; `Fails: CHECK`; `Fails: unknown student` (FOREIGN KEY); composite `PRIMARY KEY (student_id, course_id)` | `members` with required unique email (probes: NULL email fails NOT NULL; duplicate fails UNIQUE; good row succeeds); `memberships` whose foreign keys reject unknown students and courses (probes: unknown student fails FK; unknown course fails FK; valid pair succeeds) | `create-table` |

Note on lesson 14: its opening script fails on purpose (UNIQUE); its quiz `predict-next` uses `scriptViewAt` on the step before the violation.

### Task 15: Verification and PR

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build:pages`. Expected: all pass; 15 SQL lessons; `topicsIn('sql')` minus phase 3 and 4 topics all have lessons.
- [ ] **Step 2:** `npm run dev`; for each of the five lessons, run the opening script, every example and one exercise (correct and incorrect), in light and dark themes and at 375px width. Check a phase 1 lesson (`/sql/group-by-having`) still works. Expected: no console errors, no page-level horizontal scroll.
- [ ] **Step 3:** Commit fixes (each with a failing test first), then push and open the PR only when the user chooses that option.
