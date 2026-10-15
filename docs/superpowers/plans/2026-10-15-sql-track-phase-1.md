# SQL Track Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQL menu to Stepwise with 10 lessons in which learners step through any query they write, clause by clause, and solve checked exercises.

**Architecture:** A pure TypeScript SQL interpreter in `src/sql/` (tokenizer → parser → executor that reports trace events → step generator) produces `Step[]` with a new `table` view kind. These steps play in the existing `Visualizer`. SQL becomes a third lesson `Category` that reuses the catalog, lesson page, quiz and progress store. sql.js is used only in tests, as a reference for SQLite semantics.

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Vite, Tailwind v4, Zustand, Motion, Vitest. New devDependencies: `sql.js@1.15.0` and `@types/sql.js`.

**Spec:** `docs/superpowers/specs/2026-10-15-sql-track-phase-1-design.md`

## Global Constraints

- `src/sql/` contains no React and no imports from `components/`, `pages/` or `lessons/`.
- `sql.js` is a devDependency. Only `*.test.ts` files and `src/sql/sqlite.testutil.ts` import it.
- Datasets have at most 20 rows per table. `querySteps` returns at most 400 steps. Query text is capped at 2,000 characters.
- Semantics match SQLite for the supported subset. The one deliberate exception: a non-aggregated, non-grouped column in a grouped query is rejected.
- `parseQuery`, `runQuery`, `querySteps` and `checkExercise` never throw. They return `{ ok: false, error }` (or a `CheckResult`). Internal helpers may throw `SqlError`, and only these entry points catch it.
- Lesson text lives in `src/lessons/`, never in components. Components read colours from CSS variables and role styling from `components/visualization/roles.ts`.
- Step `title` and `why` are plain language and use the actual values.
- Tests run in Node: `npm test` runs Vitest over `src/**/*.test.ts`. Component behaviour is checked in the browser (Task 16).
- Commit messages follow the repo style ("Add …", "Fix …") and contain no AI attribution.
- Every task ends with `npm run typecheck` and `npm test` passing. The baseline is 496 passing tests.

## Review Focus

1. **A text value compared with a number column, or the reverse** (`WHERE year = '2'`, `WHERE name = 5`). Expect SQLite's affinity behaviour, not "numbers sort before text". Pinned in Task 5 and the Task 7 corpus.
2. **An aggregate in WHERE** (`WHERE COUNT(*) > 1`). Expect the teaching error that points to HAVING, not a crash or a silently wrong result. Pinned in Task 6.
3. **An empty query, a query that is only a comment, a trailing `;`, or two statements.** Expect "Write a query to run." / OK / "Run one statement at a time." Pinned in Task 4.
4. **A three-way join, or a join that produces more than 400 row checks.** Expect at most 400 steps, with summary steps, a final result equal to `runQuery`, and a UI that stays responsive. Pinned in Task 9.
5. **A bare `id` in a query that joins two tables that both have `id`.** Expect the ambiguity error naming both tables. Pinned in Task 5.

---

## File map

| Path | Responsibility | Task |
|---|---|---|
| `src/sql/values.ts` | `SqlValue`, `Real`, arithmetic, comparison, three-valued logic, LIKE, formatting | 1 |
| `src/sql/errors.ts` | `SqlError`, `suggest()` | 1 |
| `src/sql/datasets/{shop,school,index}.ts` | read-only sample databases | 2 |
| `src/sql/sqlite.testutil.ts` | loads a dataset into sql.js (tests only) | 2 |
| `src/sql/tokenize.ts` | `tokenize()` | 3 |
| `src/sql/ast.ts`, `src/sql/parse.ts` | AST types, `parseQuery()` | 4 |
| `src/sql/evaluate.ts` | expression evaluation in a scope | 5, 6 |
| `src/sql/execute.ts` | `Relation`, `TraceEvent`, `executeSelect()`, `runQuery()` | 5, 6 |
| `src/sql/differential.test.ts` | the corpus compared against sql.js | 7 |
| `src/types/visualization.ts` | `TableView`, `SqlTable`, `SqlRow` | 8 |
| `src/components/visualization/renderers/TableRenderer.tsx` | draws `table` views | 8 |
| `src/sql/steps.ts` | `querySteps()`, `viewAt()` | 9 |
| `src/sql/check.ts` | `checkExercise()`, `describeCheck()` | 10 |
| category plumbing (routes, header, pages), `src/lessons/curriculum.ts` | SQL category, optional complexity | 11 |
| `src/store/progress.ts` | `exercises` field, `solveExercise()` | 12 |
| `components/visualization/inputs/SqlInput.tsx`, `components/sql/Exercises.tsx` | editor, schema panel, exercises | 13 |
| `src/lessons/sql/*.ts` | 10 lessons | 14, 15 |
| `README.md` | documentation | 16 |

---

### Task 1: SQL values and errors

**Files:**
- Create: `src/sql/values.ts`, `src/sql/errors.ts`
- Test: `src/sql/values.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // values.ts
  export class Real { constructor(readonly value: number) {} }   // a REAL; plain JS numbers are INTEGERs
  export type SqlValue = null | number | string | Real;
  export type Truth = boolean | null;                              // null = unknown
  export function arithmetic(op: '+' | '-' | '*' | '/' | '%', a: SqlValue, b: SqlValue): SqlValue;
  export function negate(a: SqlValue): SqlValue;
  export function compareValues(a: SqlValue, b: SqlValue): number;  // total order for sorting: NULL < numbers < text
  export function compare(op: '=' | '<>' | '<' | '<=' | '>' | '>=', a: SqlValue, b: SqlValue): Truth;  // NULL → null
  export function and(a: Truth, b: Truth): Truth;  export function or(a: Truth, b: Truth): Truth;  export function not(a: Truth): Truth;
  export function truth(v: SqlValue): Truth;          // NULL → null, numbers ≠ 0 → true, text → its numeric prefix ≠ 0 (SQLite)
  export function like(value: SqlValue, pattern: SqlValue): Truth;
  export function toNumber(v: SqlValue): number | null;
  export function valueKey(v: SqlValue): string;      // equal for SQL-equal values: 2 and Real(2) share a key; NULLs share a key
  export function formatValue(v: SqlValue): string;   // 'NULL', '42', '42.0', '9.5', 'Ana'
  export function toPlain(v: SqlValue): number | string | null;
  // errors.ts
  export type SqlErrorKind = 'syntax' | 'name' | 'unsupported' | 'limit';
  export class SqlError extends Error { constructor(message: string, readonly kind: SqlErrorKind, readonly line: number, readonly column: number, readonly topic?: string); }
  export function suggest(name: string, candidates: string[]): string | undefined;  // closest by edit distance ≤ 2, case-insensitive
  ```

- [ ] **Step 1: Write the failing tests** in `src/sql/values.test.ts`:
  - `arithmetic('/', 7, 2)` → `3`; `arithmetic('/', 7, new Real(2))` → `Real(3.5)`; `arithmetic('/', -7, 2)` → `-3` (truncates); `arithmetic('/', 5, 0)` → `null`; `arithmetic('%', 7, 3)` → `1`; `arithmetic('+', null, 1)` → `null`; `arithmetic('*', new Real(1.5), 2)` → `Real(3)`.
  - `compare('=', null, null)` → `null`; `compare('<', 2, new Real(2.5))` → `true`; `compare('=', 2, new Real(2))` → `true`; `compare('<', 99, 'a')` → `true`.
  - Three-valued truth tables: `and(false, null)` → `false`; `and(true, null)` → `null`; `or(true, null)` → `true`; `or(false, null)` → `null`; `not(null)` → `null`.
  - `like('Anna', 'a%')` → `true`; `like('Bo', '_o')` → `true`; `like('Bo', 'b')` → `false`; `like(null, '%')` → `null`; `like(15, '1%')` → `true`.
  - `compareValues` sorts `[ 'b', 2, null, new Real(1.5), 'a' ]` to `[null, Real(1.5), 2, 'a', 'b']`.
  - `formatValue(new Real(42))` → `'42.0'`; `formatValue(null)` → `'NULL'`; `valueKey(2) === valueKey(new Real(2))`.
  - `suggest('cutomer_id', ['id', 'customer_id'])` → `'customer_id'`; `suggest('zzz', ['id'])` → `undefined`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/values.test.ts`. Expected: FAIL, cannot resolve `./values`.

- [ ] **Step 3: Implement `values.ts` and `errors.ts`** with the signatures above.
  - The arithmetic result is a `Real` if either operand is a `Real`.
  - Integer `/` truncates toward zero, and division or modulo by zero gives `null`.
  - Text in arithmetic converts via its numeric prefix (SQLite), else `0`.
  - `like` is case-insensitive for ASCII only. `%` matches any run and `_` matches one character. Non-text operands are compared through `formatValue`, except that a whole `Real` formats as `'42.0'` (as SQLite does).

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/sql/values.test.ts`, then `npm run typecheck`. Expected: PASS, with no type errors.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/sql/values.ts src/sql/errors.ts src/sql/values.test.ts
  git commit -m "Add SQL value semantics and error type"
  ```

### Task 2: Datasets and the SQLite test loader

**Files:**
- Create: `src/sql/datasets/shop.ts`, `src/sql/datasets/school.ts`, `src/sql/datasets/index.ts`, `src/sql/sqlite.testutil.ts`
- Modify: `package.json` (devDependencies)
- Test: `src/sql/datasets/datasets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';
  export interface DatasetTable { name: string; columns: { name: string; type: ColumnType }[]; rows: (number | string | null)[][] }
  export type DatasetId = 'shop' | 'school';
  export interface Dataset { id: DatasetId; title: string; tables: DatasetTable[] }
  export const datasets: Record<DatasetId, Dataset>;
  export function findTable(db: Dataset, name: string): DatasetTable | undefined;  // case-insensitive
  // sqlite.testutil.ts
  export async function openSqlite(db: Dataset): Promise<{ query(sql: string): { columns: string[]; rows: (number | string | null)[][] }; close(): void }>;
  ```
- Schemas (exact):
  - `shop`: `customers(id INTEGER, name TEXT, city TEXT, joined TEXT)`, `products(id INTEGER, name TEXT, category TEXT, price REAL)`, `orders(id INTEGER, customer_id INTEGER, ordered_on TEXT, status TEXT)`, `order_items(order_id INTEGER, product_id INTEGER, quantity INTEGER)`
  - `school`: `students(id INTEGER, name TEXT, year INTEGER, email TEXT)`, `courses(id INTEGER, title TEXT, credits INTEGER)`, `enrollments(student_id INTEGER, course_id INTEGER, grade INTEGER)`

- [ ] **Step 1: Install the test reference.** Run `npm install -D sql.js@1.15.0 @types/sql.js`. Expected: both appear in `devDependencies`.

- [ ] **Step 2: Write the failing tests** in `datasets.test.ts`.

  For every table:
  - it has 1–20 rows, and every row's length equals the number of columns
  - cell types match their column: INTEGER uses `Number.isInteger`, REAL is a number, TEXT is a string; any cell may be `null`, except that `id` and foreign-key columns are never null
  - `id` is unique, and every foreign key resolves

  `shop`:
  - customers: 8–12 rows; at least 1 `city` is NULL; at least 2 customers share a city; at least 1 customer lives in `Hanoi` and at least 1 in `Hue`; at least 1 name starts with `A`; at least 1 customer has no orders; at least 1 customer has more than 1 order
  - products: 8–12 rows; the set of categories is exactly `{'Books','Electronics','Kitchen'}`; at least 1 category has an average price > 30 and at least 1 has an average ≤ 30; at least 2 products share a price; the 3 lowest prices are distinct and all lower than the 4th lowest; at least 1 price is a whole number; at least 1 product is never ordered
  - orders: 10–15 rows; all three statuses `shipped`, `pending` and `cancelled` appear and no others; `ordered_on` values are unique and match `YYYY-MM-DD`
  - order_items: `(order_id, product_id)` pairs are unique; `quantity` is 1–5; order 1 has at least 2 items

  `school`:
  - students: 8–12 rows; `year` is 1–4; at least 1 `email` is NULL; at least 1 student has no enrollments
  - courses: 5–8 rows; `credits` is 2–5 and not all equal; at least 1 course has no enrollments
  - enrollments: `(student_id, course_id)` pairs are unique; `grade` is 0–100 or NULL; at least 1 grade is NULL

  Loader: `openSqlite(datasets.shop).query('SELECT COUNT(*) FROM customers')` returns the customers row count, and `query('SELECT price FROM products WHERE 0')` returns `{ columns: ['price'], rows: [] }`.

- [ ] **Step 3: Run the tests and confirm they fail.** Run `npx vitest run src/sql/datasets`. Expected: FAIL on missing modules.

- [ ] **Step 4: Implement.**
  - Write the two datasets with realistic names, satisfying every rule above.
  - `openSqlite` calls `initSqlJs()` with no `locateFile`, creates each table with its declared column types, and inserts rows with a prepared statement.
  - `query` uses `db.exec`. Because `exec` returns `[]` for zero rows, take the columns from `stmt.getColumnNames()` of a prepared statement in that case.

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run src/sql/datasets && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add package.json package-lock.json src/sql/datasets src/sql/sqlite.testutil.ts
  git commit -m "Add shop and school sample datasets"
  ```

### Task 3: Tokenizer

**Files:**
- Create: `src/sql/tokenize.ts`
- Test: `src/sql/tokenize.test.ts`

**Interfaces:**
- Consumes: `SqlError` (Task 1).
- Produces:
  ```ts
  export type TokenKind = 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'punct' | 'eof';
  export interface Token { kind: TokenKind; text: string; /** keywords upper-cased; identifiers unquoted */ value: string; line: number; column: number; start: number; end: number }
  export const KEYWORDS: ReadonlySet<string>;   // every SQL word the parser recognises, including unsupported ones (INSERT, UNION, WITH, OVER, CASE, EXISTS, RIGHT, FULL, CROSS, …)
  export function tokenize(sql: string): Token[];   // throws SqlError; always ends with an 'eof' token
  ```

- [ ] **Step 1: Write the failing tests.**
  - `tokenize("select Name from t -- hi\nwhere x >= 2.5")` gives the kinds `keyword identifier keyword identifier keyword identifier operator number eof`; the first token's value is `'SELECT'`; `x` has `line: 2, column: 7`.
  - `'it''s'` becomes one string token with value `it's`.
  - `"order"` becomes an identifier with value `order`.
  - The operators are `<> != <= >= = < > + - * / %`, and the punctuation is `( ) , . ;`.
  - `'abc` throws `SqlError` with the message "This string is missing its closing quote." at the quote's line and column.
  - `@` throws "Unexpected character `@`.".

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/tokenize.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `tokenize`** with the interface above. Lines and columns are 1-based. `--` comments run to the end of the line and are dropped.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL tokenizer"`.

### Task 4: AST and parser

**Files:**
- Create: `src/sql/ast.ts`, `src/sql/parse.ts`
- Test: `src/sql/parse.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `Token`, `SqlError`, `SqlValue`, `Real`.
- Produces (`ast.ts`). Every `Expr` has `text: string` (its trimmed source slice) and `line: number`:
  ```ts
  export type Expr = { text: string; line: number; column: number } & (
    | { type: 'literal'; value: SqlValue }
    | { type: 'column'; table?: string; name: string }
    | { type: 'unary'; op: '-' | 'NOT'; operand: Expr }
    | { type: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '=' | '<>' | '<' | '<=' | '>' | '>=' | 'AND' | 'OR'; left: Expr; right: Expr }
    | { type: 'isNull'; operand: Expr; negated: boolean }
    | { type: 'between'; operand: Expr; low: Expr; high: Expr; negated: boolean }
    | { type: 'like'; operand: Expr; pattern: Expr; negated: boolean }
    | { type: 'inList'; operand: Expr; items: Expr[]; negated: boolean }
    | { type: 'inSubquery'; operand: Expr; query: SelectStatement; negated: boolean }
    | { type: 'subquery'; query: SelectStatement }
    | { type: 'aggregate'; fn: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'; arg: Expr | '*'; distinct: boolean }
  );
  export type Clause = 'FROM' | 'JOIN' | 'WHERE' | 'GROUP BY' | 'HAVING' | 'SELECT' | 'DISTINCT' | 'ORDER BY' | 'LIMIT';
  export type SelectItem = { kind: 'star'; table?: string } | { kind: 'expr'; expr: Expr; alias?: string };
  export interface TableRef { table: string; alias?: string }
  export interface JoinClause extends TableRef { kind: 'inner' | 'left'; on: Expr; line: number }
  export interface SelectStatement {
    distinct: boolean; columns: SelectItem[]; from: TableRef; joins: JoinClause[];
    where?: Expr; groupBy: Expr[]; having?: Expr;
    orderBy: { expr: Expr; desc: boolean }[]; limit?: { count: number; offset: number };
    /** First source line of each clause present. */ lines: Partial<Record<Clause, number>>;
  }
  // parse.ts
  export type ParseResult = { ok: true; statement: SelectStatement } | { ok: false; error: SqlError };
  export function parseQuery(sql: string): ParseResult;
  export function parseSelect(tokens: Token[], pos: number): { statement: SelectStatement; pos: number };  // used for subqueries; throws
  ```
- Operator precedence, lowest first: `OR`, `AND`, `NOT`, comparison/`IS`/`BETWEEN`/`LIKE`/`IN`, `+ -`, `* / %`, unary `-`.
- `SELECT DISTINCT` and `SELECT` share a line; `lines.DISTINCT` equals `lines.SELECT` when DISTINCT is present.

- [ ] **Step 1: Write the failing tests.**

  Parsing:
  - `SELECT DISTINCT c.name AS n, price * 2 FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE c.city IS NOT NULL AND price BETWEEN 1 AND 9 GROUP BY c.name HAVING COUNT(DISTINCT o.id) > 1 ORDER BY n DESC, 2 LIMIT 5 OFFSET 2;` parses to the expected shape:
    - `columns[0]` has alias `n`
    - `joins[0].kind` is `'left'`
    - `where.op` is `'AND'` with an `isNull` (negated) on the left
    - `having.left` is an aggregate with `distinct: true`
    - `orderBy[1].expr` is the literal `2`
    - `limit` is `{ count: 5, offset: 2 }`
  - On a multi-line query, `lines` records each clause's line, e.g. `{ SELECT: 1, FROM: 2, WHERE: 3 }`.
  - `a OR b AND NOT c` parses as `OR(a, AND(b, NOT c))`.
  - `x NOT IN (1, 2)`, `x IN (SELECT id FROM t)`, `(SELECT MAX(id) FROM t)` and `x NOT LIKE 'a%'` produce the right node types.
  - `2.0` becomes a literal `Real(2)`; `2` becomes the number `2`.

  Errors:
  - `SELECT name customers` (missing FROM) gives a `syntax` error whose message contains "Expected FROM", at line 1, col 13.
  - `''` and `'-- only a comment'` give "Write a query to run.".
  - `'SELECT 1 FROM t;'` is OK (trailing `;`); `'SELECT 1 FROM t; SELECT 2 FROM t'` gives "Run one statement at a time.".
  - A 2,001-character query gives a `limit` error, "Queries are limited to 2,000 characters.".
  - `LIMIT 2.5` gives "LIMIT needs a whole number.".

  Unsupported features (kind `unsupported`, message "`X` isn't supported here yet. It is covered in a later lesson.", with `topic` as listed):

  | Input | Feature | Topic |
  |---|---|---|
  | `INSERT …` | `INSERT` | `insert` |
  | `UPDATE …` | `UPDATE` | `update` |
  | `DELETE …` | `DELETE` | `delete` |
  | `CREATE …` | `CREATE` | `create-table` |
  | `… UNION …` | `UNION` | `set-operations` |
  | `WITH …` | `WITH` | `ctes` |
  | `… OVER (…)` | `OVER` | `window-functions` |
  | `CASE …` | `CASE` | `case-expressions` |
  | `RIGHT JOIN` | `RIGHT JOIN` | none |
  | `UPPER(name)` | `UPPER` | none |

  When there is no topic, the message is "`X` isn't supported here yet.". For a function, it is "Function `UPPER` isn't supported here yet.".

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/parse.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement a recursive-descent parser** in `parse.ts` with the interfaces above. Syntax errors have the form "Expected X, found `tok`" or "Expected X, found the end of the query", at the found token's line and column. `parseQuery` catches `SqlError`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command, then `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL parser"`.

### Task 5: Executor core (FROM, JOIN, WHERE, SELECT, DISTINCT, ORDER BY, LIMIT)

**Files:**
- Create: `src/sql/evaluate.ts`, `src/sql/execute.ts`
- Test: `src/sql/execute.test.ts`

**Interfaces:**
- Consumes: `parseQuery`, the AST, values, `Dataset`, `findTable`, `suggest`.
- Produces:
  ```ts
  // execute.ts
  export interface ColumnRef { table?: string; name: string; type?: ColumnType }   // table = alias if given, else table name
  export interface Row { id: string; values: SqlValue[]; members?: Row[] }        // members: the source rows of a group
  export interface Relation { columns: ColumnRef[]; rows: Row[] }
  export interface QueryResult { columns: string[]; rows: SqlValue[][] }
  export type TraceEvent =
    | { kind: 'scan'; table: string; relation: Relation }
    | { kind: 'join-test'; join: JoinClause; left: Relation; right: Relation; leftRow: string; rightRow: string; outcome: Truth }
    | { kind: 'join-unmatched'; join: JoinClause; leftRow: string }
    | { kind: 'joined'; join: JoinClause; relation: Relation }
    | { kind: 'filter-test'; clause: 'WHERE' | 'HAVING'; input: Relation; row: string; outcome: Truth; values: Record<string, string> }
    | { kind: 'filtered'; clause: 'WHERE' | 'HAVING'; relation: Relation }
    | { kind: 'grouped'; input: Relation; groups: { key: SqlValue[]; rowIds: string[] }[]; relation: Relation }
    | { kind: 'projected'; relation: Relation }
    | { kind: 'distinct'; input: Relation; removed: string[]; relation: Relation }
    | { kind: 'sorted'; input: Relation; relation: Relation }
    | { kind: 'limited'; input: Relation; relation: Relation };
  export function executeSelect(db: Dataset, stmt: SelectStatement, trace?: (e: TraceEvent) => void): QueryResult;  // throws SqlError
  export type RunResult = { ok: true; result: QueryResult; statement: SelectStatement } | { ok: false; error: SqlError };
  export function runQuery(db: Dataset, sql: string): RunResult;
  // evaluate.ts
  export interface Scope { columns: ColumnRef[]; row: Row; outer?: Scope; db: Dataset }
  export function evaluate(expr: Expr, scope: Scope): SqlValue;   // throws SqlError
  export function evaluateTruth(expr: Expr, scope: Scope): Truth;
  export function referencedColumns(expr: Expr, scope: Scope): Record<string, string>;  // 'c.city' → formatValue(value), used in trace values
  ```
- Row ids:
  - FROM rows: `` `${table}#${index}` ``, where `table` is the dataset table name and `index` is the dataset row index
  - joined rows: `` `${leftId}+${rightId}` ``
  - LEFT JOIN rows with no match: `` `${leftId}+null` ``
  - projected rows keep their source id
  - DISTINCT keeps the first occurrence
- Output column names: the alias if there is one, else the expression's `text`; `*` expands to the column names.
- Trace events are emitted only for the top-level statement, in logical order, and only for clauses that are present.

- [ ] **Step 1: Write the failing tests** using `datasets.shop`. Compare `runQuery(...).result` with literal expectations computed from the dataset in the test (e.g. `rows.filter(...)`):
  - `SELECT * FROM products` returns all rows with all columns.
  - `SELECT name, price * 2 AS double FROM products` gives columns `['name', 'double']`.
  - WHERE drops NULL comparisons: `SELECT name FROM customers WHERE city <> 'X'` excludes customers with a NULL city.
  - INNER JOIN with aliases; LEFT JOIN keeps unmatched customers with `NULL` order columns; ON referencing both sides.
  - `SELECT DISTINCT city FROM customers` returns one NULL row.
  - `ORDER BY price DESC, name`; `ORDER BY 2`; ORDER BY an alias; ORDER BY a column not in the select list; NULLs first in ASC and last in DESC.
  - `LIMIT 3 OFFSET 2`; `LIMIT 0` gives no rows.
  - Affinity: `SELECT name FROM students WHERE year = '2'` (with `datasets.school`) equals `WHERE year = 2`; `SELECT name FROM customers WHERE name = 5` returns no rows and no error; `WHERE price > '20'` equals `WHERE price > 20`.
  - Errors:
    - a bare `id` in `orders JOIN customers` gives "Column `id` is ambiguous: it exists in `orders` and `customers`. Write `orders.id` or `customers.id`."
    - `customer_idd` gives "No column `customer_idd`. Did you mean `customer_id`?" with kind `name` and the column's line and column
    - `FROM custmers` gives "No table `custmers`. Did you mean `customers`?"
    - with `FROM customers c`, `customers.name` gives "No column `customers.name`."
  - Trace: for `SELECT name FROM customers WHERE city = 'Hanoi' ORDER BY name LIMIT 2`, the event kinds in order are `scan`, `filter-test`×N, `filtered`, `projected`, `sorted`, `limited`, and every `filter-test.row` id starts with `customers#`.
  - `runQuery` returns `{ ok: false }` and never throws, for every error input above.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/execute.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `evaluate.ts`** (no aggregates or subqueries yet; those are Task 6).
  - Names resolve in the current scope first, then the outer scope.
  - A qualified name matches the alias when one was given, else the table name.
  - Comparisons apply SQLite affinity:
    - if one side is a direct column reference of type INTEGER or REAL and the other side is TEXT that parses fully as a number, convert the text to a number
    - if one side is a TEXT column reference and the other is a number that is not a column, convert the number to text with `formatValue`
    - otherwise use `compare`
  - IN-list and BETWEEN use the same affinity rule against the operand.

- [ ] **Step 4: Implement `execute.ts`.** Run the stages in logical order and emit the trace events. ORDER BY resolves, in order: a positive integer literal as a column position (1-based; out of range gives "ORDER BY position 4 is out of range: the query returns 3 columns."), then an output alias, then the source columns. Sorting is stable. `runQuery` = `parseQuery` + `executeSelect`, catching `SqlError`.

- [ ] **Step 5: Run the tests and confirm they pass.** Run `npx vitest run src/sql && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** with `git commit -m "Add SQL executor for filtering, joining and sorting"`.

### Task 6: Aggregates, GROUP BY, HAVING and subqueries

**Files:**
- Modify: `src/sql/evaluate.ts`, `src/sql/execute.ts`
- Test: `src/sql/grouping.test.ts`

**Interfaces:**
- Consumes and produces: the same exports as Task 5. Grouped rows have id `` `group#${n}` `` (n from 1, in order of each group's first appearance) and `members` set to their source rows. Their `values` hold the GROUP BY key values, in the order of the GROUP BY expressions.

- [ ] **Step 1: Write the failing tests** (shop and school datasets).
  - `SELECT COUNT(*), COUNT(city), COUNT(DISTINCT city), SUM(price), AVG(price), MIN(price), MAX(price) FROM …` returns one row, matching values computed in the test.
  - Aggregates over no rows (`WHERE 0`): COUNT gives `0`; SUM, AVG, MIN and MAX give `NULL`; it is still one row.
  - `SUM` of INTEGERs is an integer (`typeof === 'number'`); `AVG` is a `Real`.
  - `SELECT city, COUNT(*) FROM customers GROUP BY city` has one row for NULL, and groups come out in order of first appearance.
  - `GROUP BY category HAVING AVG(price) > 30` keeps only the qualifying categories.
  - `HAVING` without GROUP BY treats the whole table as one group.
  - Errors:
    - a bare column in a grouped query (`SELECT name, COUNT(*) FROM customers`, and `SELECT name FROM products GROUP BY category`) gives "`name` must appear in GROUP BY or be used in an aggregate such as COUNT or MAX."
    - `WHERE COUNT(*) > 1` gives "Aggregates like COUNT can't be used in WHERE, which runs before rows are grouped. Use HAVING instead."
    - an aggregate nested in another aggregate gives "Aggregates can't be nested."
  - Subqueries:
    - `IN (SELECT …)` and `NOT IN (SELECT …)`
    - a scalar subquery that returns 0 rows gives `NULL`, and one that returns several rows uses the first row
    - a subquery with 2 columns used as a value gives "A subquery used as a value must return one column."
    - correlated: `SELECT name FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) > 1`
    - `NOT IN` against a list containing NULL gives no rows
  - Trace for `SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) > 2` contains `grouped` (its `groups` cover every input row exactly once), then `filter-test` events with `clause: 'HAVING'` and `row` ids starting with `group#`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/grouping.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In a grouped query (GROUP BY present, or any aggregate in SELECT, HAVING or ORDER BY), aggregates evaluate over `row.members`.
  - A column reference outside an aggregate is allowed only when its `text`, case-insensitively, equals a GROUP BY expression's `text`, or it names the same column as a GROUP BY column reference.
  - Subqueries run via `executeSelect` with no trace and a scope whose `outer` is the current scope.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/sql && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL grouping, aggregates and subqueries"`.

### Task 7: Differential tests against SQLite

**Files:**
- Create: `src/sql/differential.test.ts`

**Interfaces:**
- Consumes: `runQuery`, `datasets`, `openSqlite`, `toPlain`.

- [ ] **Step 1: Write the corpus**: `const corpus: { db: DatasetId; sql: string; ordered?: boolean }[]`, with at least 120 queries. Set `ordered: true` only when the ORDER BY keys have no ties in the result.

  | Category | Min. queries | Examples |
  |---|---|---|
  | projection & arithmetic | 12 | int/real division, `1.0 * a / b`, `%`, unary minus, division by zero |
  | WHERE & NULL | 20 | `= NULL`, `IS NULL`, `NOT (x = 1)` with NULL, `AND`/`OR` with unknown, BETWEEN, IN-list with NULL |
  | LIKE | 6 | case, `_`, a number operand |
  | affinity | 6 | `year = '2'`, `price > '20'`, `name = 5`, `name > 5` |
  | ORDER BY / LIMIT | 14 | DESC, multiple keys, position, alias, NULL placement, OFFSET past the end |
  | DISTINCT | 6 | NULLs, several columns |
  | aggregates | 14 | empty input, `COUNT(DISTINCT)`, SUM int vs real, AVG |
  | GROUP BY / HAVING | 14 | NULL group, HAVING on aggregates not in SELECT, ORDER BY an aggregate |
  | joins | 16 | inner, left with no match, three tables, ON with extra conditions, WHERE on the right side of a LEFT JOIN |
  | subqueries | 12 | IN, NOT IN, scalar, correlated, nested two levels |

- [ ] **Step 2: Write the test.**
  ```ts
  describe.each(corpus)('$db: $sql', ({ db, sql, ordered }) => {
    it('matches SQLite', () => { /* ours = runQuery(...); expect(ours.ok).toBe(true); compare to sqlite.query(sql) */ });
  });
  ```
  - Open one sql.js instance per dataset in `beforeAll`.
  - Compare the number of columns, then the rows, mapping each row with `toPlain`.
  - Numbers are equal within `1e-9`.
  - Compare as sequences when `ordered` is set, otherwise as multisets (sort both sides by `JSON.stringify`).

- [ ] **Step 3: Run the tests.** Run `npx vitest run src/sql/differential.test.ts`. Expected: PASS. Fix any mismatch in `values.ts`, `evaluate.ts` or `execute.ts`, never in the corpus, unless the query relies on SQLite behaviour the spec rejects (the bare-column rule). Such queries do not belong in the corpus.

- [ ] **Step 4: Commit** with `git commit -m "Add differential SQL tests against SQLite"`.

### Task 8: Table view and renderer

**Files:**
- Modify: `src/types/visualization.ts`, `src/components/visualization/renderers/index.tsx`, `src/components/visualization/roles.ts`
- Create: `src/components/visualization/renderers/TableRenderer.tsx`
- Test: `src/components/visualization/roles.test.ts` (new)

**Interfaces:**
- Produces `SqlRow`, `SqlTable` and `TableView` exactly as in spec section 3, with `TableView` added to the `View` union.

- [ ] **Step 1: Write the failing test.** `rolesInView({ kind: 'table', clauses: ['FROM'], tables: [{ label: 't', columns: ['a'], rows: [{ id: '1', cells: [1], role: 'found' }, { id: '2', cells: [null], role: 'discarded' }] }] })` → `['found', 'discarded']`.

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run src/components/visualization/roles.test.ts`. Expected: FAIL (a type error or undefined).

- [ ] **Step 3: Add the types and the `rolesInView` case.**

- [ ] **Step 4: Implement `TableRenderer({ view }: { view: TableView })`.**
  - **Clause strip:** an ordered list of `view.clauses`; the item equal to `view.current` gets `aria-current="step"` plus the accent styling.
  - **Tables:**
    - each table is a `card` with `overflow-x-auto` and a caption showing its `label`
    - side by side at `lg` and wider, stacked below that
  - **Rows:**
    - the background uses `roleFill(role)`, the left border uses `roleBorder`, and `ROLE_META[role].mark` appears in a leading cell with an `aria-label` equal to the role's `label`
    - `focus` cells get a 2px outline in `var(--accent)`
    - `group` rows alternate between `bg-surface-2` and `bg-surface` by group number
    - `note` appears in a trailing muted cell
    - `null` cells render a `NULL` chip in `text-muted italic`
    - rows animate with `motion` layout, keyed by `row.id`, as the other renderers do with stable ids, and respect reduced motion the way they do
  - **Registration:** add the `table` case to `StepView`.

- [ ] **Step 5: Run the checks.** Run `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** with `git commit -m "Add table view and renderer"`.

### Task 9: Step generator

**Files:**
- Create: `src/sql/steps.ts`
- Test: `src/sql/steps.test.ts`

**Interfaces:**
- Consumes: `parseQuery`, `executeSelect`, `TraceEvent`, `TableView`, `formatValue`, `toPlain`.
- Produces:
  ```ts
  export const MAX_STEPS = 400;
  export type StepsResult = { ok: true; steps: Step[]; result: QueryResult } | { ok: false; error: SqlError };
  export function querySteps(db: Dataset, sql: string): StepsResult;
  /** For lesson quizzes; negative index counts from the end. Throws if the query fails. */
  export function viewAt(db: Dataset, sql: string, index: number): TableView;
  ```
- The step sequence:

  | When | Step (exact copy) | Roles and tables |
  |---|---|---|
  | start | title "Run the query"; why "SQL runs the clauses in this order: " + used clauses joined with " → " + "." | FROM table, all rows `default`; `current` undefined; `codeLine` = `lines.SELECT` |
  | `scan` (FROM) | "FROM {table}: start with all {n} rows" | table rows `default` |
  | `join-test` | "{left label} row {i} with {right label} row {j}: {on.text} → {true\|false\|unknown}" | left row `active`, right row `compare`; outcome true → right row `found`, else `discarded` |
  | `join-unmatched` | "No match for row {i}, so LEFT JOIN keeps it with NULLs" | row `found`, note "no match" |
  | `joined` | "JOIN result: {n} rows" | the joined table |
  | `filter-test` | "Row {i}: {condition.text} → {true\|false\|unknown}" | row `active`; outcome true gets note "kept", false or unknown gets note "removed", with role `found` or `discarded`; `variables` = the event's `values` |
  | `filtered` | "{WHERE\|HAVING} kept {k} of {n} rows" | |
  | `grouped` | two steps: "GROUP BY sorted rows into {g} groups" (input rows with `group` set), then "Each group becomes one row" (the grouped relation) | |
  | `projected` | "SELECT picks the columns {names}" | |
  | `distinct` | "DISTINCT removed {r} duplicate rows" | removed rows `discarded` |
  | `sorted` | "ORDER BY sorted the rows by {keys text}" | rows `sorted` |
  | `limited` | "LIMIT kept {k} of {n} rows" | the cut rows `discarded` |
  | final | "Result: {n} row(s)" | result rows `found`, `current` undefined |

  - The why for an unknown outcome is "A comparison with NULL is unknown, and {clause} only keeps rows where the condition is true."
  - Every step's `codeLine` is the source line of its clause (`lines[clause]`, and `join.line` for joins).
  - Row numbers `i` and `j` are 1-based positions in the displayed table.
- Cap: when the total would exceed `MAX_STEPS`, keep the first K test steps of each clause or join, and replace the rest of that clause's tests with one step: "…{m} more rows checked, {k} kept". Start with K = 12 and halve K (minimum 1) until the total is ≤ `MAX_STEPS`.

- [ ] **Step 1: Write the failing tests.**
  - For every query in the Task 7 corpus: `querySteps` is ok, and the last step's last table (as `toPlain` cells) equals `runQuery`'s rows.
  - Every `codeLine` is between 1 and the query's line count.
  - Every step's `clauses` lists only clauses present in `statement.lines`.
  - A row's id keeps the same cells in every step where it appears.
  - The step count is `≤ 400` for `SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id JOIN customers c ON o.customer_id = c.id`, and that run contains a step whose title starts with "…".
  - The first step's title is "Run the query", and its why for `SELECT name FROM customers WHERE city = 'Hue' ORDER BY name` is "SQL runs the clauses in this order: FROM → WHERE → SELECT → ORDER BY.".
  - A NULL-comparison row gets "→ unknown" in its title and the role `discarded`.
  - `querySteps` on invalid SQL returns `ok: false`.
  - `viewAt(db, sql, -1)` equals the last step's view.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/steps.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `steps.ts`.** Collect the trace events from one `executeSelect` call and map them to steps per the table above. Never re-execute.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `npx vitest run src/sql && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL step generator"`.

### Task 10: Exercise checker

**Files:**
- Create: `src/sql/check.ts`
- Test: `src/sql/check.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CheckResult =
    | { status: 'correct' } | { status: 'error'; error: SqlError }
    | { status: 'columns'; expected: number; actual: number }
    | { status: 'rows'; missing: number; extra: number } | { status: 'order' };
  export function checkExercise(db: Dataset, query: string, exercise: { solution: string; orderMatters: boolean }): CheckResult;
  export function describeCheck(result: CheckResult): string;
  ```
- `describeCheck` copy:

  | Status | Message |
  |---|---|
  | correct | "Correct!" |
  | error | the error message plus " (line L, col C)" |
  | columns | "Expected 2 columns, got 3." |
  | rows | "2 rows missing, 1 extra row." (each part only when non-zero; singular "row" when the count is 1) |
  | order | "Right rows, wrong order." |

- [ ] **Step 1: Write the failing tests** (shop dataset).
  - The same query is correct.
  - Renamed columns (`SELECT name AS n`) are correct.
  - `2` versus `2.0` (e.g. `SELECT price` versus `SELECT price * 1.0`) is correct.
  - Shuffled rows with `orderMatters: false` are correct; with `true` they give `order`.
  - A missing WHERE gives `rows` with extra > 0.
  - An extra column gives `columns`.
  - A syntax error gives `error`.
  - Every message in the `describeCheck` copy table above.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/sql/check.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Compare rows by a key built with `valueKey` per cell.
  - Use a multiset difference for `rows`.
  - When `orderMatters` is set and the multisets are equal but the sequences differ, the result is `order`.
  - A solution that fails throws `Error` (a lesson bug, caught by lesson tests).

- [ ] **Step 4: Run the tests and confirm they pass.** Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL exercise checker"`.

### Task 11: SQL category, menu and curriculum

**Files:**
- Modify:
  - `src/types/lesson.ts` (`Category`; `complexity?`)
  - `src/App.tsx`
  - `src/components/layout/Header.tsx`
  - `src/components/navigation/CourseSidebar.tsx`
  - `src/components/navigation/SearchPalette.tsx`
  - `src/pages/Catalog.tsx`, `src/pages/Home.tsx`, `src/pages/Dashboard.tsx`, `src/pages/LessonPage.tsx`
  - `src/lessons/curriculum.ts`, `src/lessons/lessons.test.ts`

**Interfaces:**
- Produces: `Category = 'data-structures' | 'algorithms' | 'sql'`; `Lesson.complexity?:`; `CATEGORY_TITLE.sql = 'SQL'`.
- SQL curriculum, in this order (id, title, group):
  - **beginner:**
    - `select-from` SELECT and FROM (Querying)
    - `where` Filtering with WHERE (Querying)
    - `null-values` NULL and three-valued logic (Querying)
    - `order-by-limit` Sorting and LIMIT (Querying)
    - `distinct` DISTINCT (Querying)
    - `aggregates` COUNT, SUM, AVG, MIN, MAX (Summarising)
    - `insert` INSERT (Modifying data)
    - `update` UPDATE (Modifying data)
    - `delete` DELETE (Modifying data)
  - **intermediate:**
    - `group-by-having` GROUP BY and HAVING (Summarising)
    - `inner-join` INNER JOIN (Joins)
    - `left-join` LEFT JOIN (Joins)
    - `subqueries` Subqueries (Subqueries)
    - `self-join` Self Join (Joins)
    - `many-to-many` Many-to-Many Joins (Joins)
    - `create-table` CREATE TABLE (Modifying data)
    - `constraints` Constraints (Modifying data)
    - `case-expressions` CASE Expressions (Advanced querying)
    - `set-operations` UNION, INTERSECT, EXCEPT (Advanced querying)
  - **advanced:**
    - `ctes` Common Table Expressions (Advanced querying)
    - `recursive-ctes` Recursive CTEs (Advanced querying)
    - `window-functions` Window Functions (Advanced querying)
    - `views` Views (Database internals)
    - `indexes` Indexes (Database internals)
    - `query-plans` Query Plans (Database internals)
    - `transactions` Transactions (Database internals)
    - `isolation-levels` Isolation Levels (Database internals)
    - `normalization` Normalization (Database internals)
- Catalog intro (exact copy): "Ask questions of a database. Each lesson runs your query one clause at a time, so you can see which rows every clause keeps, joins, groups or removes."

- [ ] **Step 1: Write the failing tests** in `lessons.test.ts`:
  - `topicsIn('sql')` has 28 topics; its ids equal the list above in that order.
  - All curriculum ids are unique (the existing test now spans all categories).
  - In "has complete content", the complexity assertions are guarded with `if (lesson.category !== 'sql')`.
  - "maps every algorithm to a Big O curve" uses `lesson.complexity!`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lessons`. Expected: FAIL on the `topicsIn('sql')` length.

- [ ] **Step 3: Implement.**
  - `App.tsx`: add `<Route path="sql" element={<Catalog category="sql" />} />` and `sql/:lessonId`.
  - Header `links`: add `{ to: '/sql', label: 'SQL' }` after Algorithms.
  - `SearchPalette`: the icon is `Database` for `sql`, `Boxes` for data structures, else `Workflow`.
  - `Home` and `Dashboard`: add a SQL progress bar. The Dashboard category list becomes `['data-structures', 'algorithms', 'sql']`.
  - `LessonPage`:
    - filter `SECTIONS` to drop `complexity` when `!lesson.complexity`; render the Complexity section and the ContextPanel complexity block only when it is present
    - for `category === 'sql'`, label the `code` section and its nav entry "Example query", with the intro "The query this lesson starts with. In the visualization above, the highlighted line follows the clause that is running."
    - `ComplexityTable` is only rendered inside the guarded section

- [ ] **Step 4: Run the checks.** Run `npm test && npm run typecheck`. Expected: PASS. Then `npm run dev`: `/sql` shows the catalog with 28 "Coming soon" topics, and the header shows SQL on desktop and mobile widths.

- [ ] **Step 5: Commit** with `git commit -m "Add SQL category, menu and curriculum"`.

### Task 12: Exercise progress

**Files:**
- Modify: `src/store/progress.ts`, `src/store/progress.test.ts`

**Interfaces:**
- Produces: `ProgressData.exercises: string[]`, with entries of the form `` `${lessonId}/${exerciseId}` ``; `solveExercise(lessonId: string, exerciseId: string, allExerciseIds: string[]): void`; `emptyProgress.exercises = []`. `reset` clears it.

- [ ] **Step 1: Write the failing tests.**
  - `sanitizeProgress({ completed: [] })` gives `exercises: []`.
  - Non-strings, duplicates and entries without exactly one `/` are dropped.
  - Solving `a` of `['a','b']` does not complete the lesson; also solving `b` adds the lesson to `completed`.
  - Solving the same exercise twice keeps one entry.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/store`. Expected: FAIL.

- [ ] **Step 3: Implement** per the interface. Keep the persist `version: 1`: `merge` already sanitizes, so older stored data gains `exercises: []`.

- [ ] **Step 4: Run the tests and confirm they pass.** Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Track solved SQL exercises in progress"`.

### Task 13: Query editor, schema panel and exercises UI

**Files:**
- Modify: `src/types/lesson.ts`, `src/components/visualization/inputs/LessonVisualization.tsx`, `src/pages/LessonPage.tsx`, `src/lessons/lessons.test.ts` (the `defaultSteps` case)
- Create: `src/components/visualization/inputs/SqlInput.tsx`, `src/components/sql/SchemaPanel.tsx`, `src/components/sql/Exercises.tsx`

**Interfaces:**
- Consumes: `querySteps`, `checkExercise`, `describeCheck`, `datasets`, `solveExercise`.
- Produces: the `{ kind: 'sql'; dataset: DatasetId; initialQuery: string; examples: { label: string; query: string }[]; exercises: SqlExercise[] }` member of `VisualizationConfig`, and `SqlExercise` exactly as in the spec. Components:
  - `SqlInput({ config, code, onStep })`
  - `SchemaPanel({ dataset }: { dataset: Dataset })`
  - `Exercises({ lessonId, dataset, exercises }: { lessonId: string; dataset: DatasetId; exercises: SqlExercise[] })`
- `lessons.test.ts` `defaultSteps` gets the case `'sql'`: return `querySteps(datasets[config.dataset], config.initialQuery)` steps, or throw `Error(error.message)`.

- [ ] **Step 1: Add the config type and the `defaultSteps` case.** Run `npm run typecheck`. Expected: errors only in `LessonVisualization.tsx`, which is not yet exhaustive.

- [ ] **Step 2: Implement `SqlInput`**, following `TextInput`'s structure (the editor as the `Visualizer` `toolbar`, the error as `notice`).
  - **Editor:**
    - a `<textarea>` with a label "Your query", `font-mono`, `spellCheck={false}`, `maxLength={2000}` and 6 rows
    - Ctrl+Enter or Cmd+Enter runs the query
  - **Buttons:**
    - **Run**, the primary button
    - **Reset to example**, which restores and runs `initialQuery`
    - one chip button per `examples` entry, which loads and runs that query
  - **Running:**
    - on mount, run `initialQuery`
    - on success, replace the steps and set the `code` passed to `Visualizer` to the query that ran (never the unsaved draft)
    - on failure, keep the previous steps and show `${message} (line ${line}, col ${column})` in a `role="alert"` region
  - **Schema:** render `SchemaPanel` below the editor.

- [ ] **Step 3: Implement `SchemaPanel`.** One `<details>` per table.
  - Its summary is the table name and row count.
  - The body lists the columns as `name TYPE`, plus a small table showing the first 5 rows, with NULL as a muted `NULL`.

- [ ] **Step 4: Implement `Exercises`.**
  - For each exercise: the prompt; a textarea (the same style as the editor, starting empty); a **Check** button; and a **Show hint** button when there is a `hint`.
  - The feedback comes from `describeCheck` in a `role="status"` region.
  - On `correct`, call `solveExercise(lessonId, exercise.id, exercises.map(e => e.id))`.
  - Show a "Solved" badge (an icon plus text) from `useProgress((s) => s.exercises)`.

- [ ] **Step 5: Wire it into the lesson.**
  - `LessonVisualization`: add the `case 'sql'`.
  - `LessonPage`: in the Practice section, render `<Exercises …/>` above the `Quiz` when `lesson.visualization.kind === 'sql'`, under a sub-heading "Write the query".

- [ ] **Step 6: Run the checks.** Run `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 7: Commit** with `git commit -m "Add SQL query editor, schema panel and exercises"`.

### Task 14: Lessons 1–5 (SELECT and FROM, WHERE, NULL, ORDER BY and LIMIT, DISTINCT)

**Files:**
- Create: `src/lessons/sql/select-from.ts`, `where.ts`, `null-values.ts`, `order-by-limit.ts`, `distinct.ts`
- Modify: `src/lessons/registry.ts`, `src/lessons/lessons.test.ts`

**Interfaces:**
- Consumes: the `Lesson` type, the `sql` config, `viewAt`, `datasets`.
- Each lesson:
  - `category: 'sql'`, with `title`, `difficulty` and `group` from the Task 11 curriculum, and no `complexity`
  - `code === visualization.initialQuery`
  - 3–4 `examples`, 2–3 `exercises`, and a 4–5 question quiz using at least 3 question types, including a `predict-next` question whose `view` comes from `viewAt(...)`
  - the same content minimums as the existing lessons
  - every lesson uses the `shop` dataset
- Lessons, with their initial queries and exercises (`orderMatters: false` unless marked):

  **`select-from`** (prerequisites: none)
  - Initial query: `SELECT name, price\nFROM products;`
  - Exercises:
    - `names-prices`: "List every product's name and price." → `SELECT name, price FROM products;`
    - `home-city`: "Show each customer's name and city, with the city column named home_city." → `SELECT name, city AS home_city FROM customers;`
    - `with-tax`: "Show each product's name and its price with 20% tax added." → `SELECT name, price * 1.2 FROM products;`

  **`where`** (prerequisites: `select-from`)
  - Initial query: `SELECT name, price\nFROM products\nWHERE price > 30;`
  - Exercises:
    - `books`: "Products in the Books category." → `SELECT name FROM products WHERE category = 'Books';`
    - `price-range`: "Products costing from 10 to 50 inclusive." → `SELECT name, price FROM products WHERE price BETWEEN 10 AND 50;`
    - `starts-a`: "Customers whose name starts with A." → `SELECT name FROM customers WHERE name LIKE 'A%';`

  **`null-values`** (prerequisites: `where`)
  - Initial query: `SELECT name, city\nFROM customers\nWHERE city = 'Hanoi' OR city IS NULL;`
  - Exercises:
    - `no-city`: "Customers with no city recorded." → `SELECT name FROM customers WHERE city IS NULL;`
    - `not-hanoi`: "Customers not living in Hanoi, including those with no city." → `SELECT name FROM customers WHERE city <> 'Hanoi' OR city IS NULL;`

  **`order-by-limit`** (prerequisites: `where`)
  - Initial query: `SELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 3;`
  - Exercises:
    - `by-price`: "Products from most to least expensive; break ties by name." → `SELECT name, price FROM products ORDER BY price DESC, name;` (orderMatters)
    - `cheapest-3`: "The 3 cheapest products." → `SELECT name, price FROM products ORDER BY price LIMIT 3;` (orderMatters)
    - `older-orders`: "Skip the 3 most recent orders and show the next 2." → `SELECT id, ordered_on FROM orders ORDER BY ordered_on DESC LIMIT 2 OFFSET 3;` (orderMatters)

  **`distinct`** (prerequisites: `select-from`)
  - Initial query: `SELECT DISTINCT city\nFROM customers;`
  - Exercises:
    - `cities`: "Every city customers live in, each once." → `SELECT DISTINCT city FROM customers;`
    - `statuses`: "Each order status, once." → `SELECT DISTINCT status FROM orders;`

- [ ] **Step 1: Write the failing tests** in `lessons.test.ts`:
  - append the 5 ids to `EXPECTED_IDS` after `prim`
  - expect `lessonsIn('sql')` to have length 5
  - add `describe.each(lessonsIn('sql'))`:
    - no `complexity`
    - `code === initialQuery`
    - 3–4 examples, each ok via `querySteps`
    - 2–3 exercises with unique ids, each `checkExercise(db, solution, exercise)` returning `{ status: 'correct' }`
    - quiz has a `table` view

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run src/lessons`. Expected: FAIL.

- [ ] **Step 3: Write the five lessons** in the existing lessons' voice (see `src/lessons/algorithms/linear-search.ts`).
  - Cover the concept SQL's logical order.
  - In `null-values` and `order-by-limit`, add a sentence where PostgreSQL or MySQL differ: NULL sort position, and `LIMIT` versus `FETCH FIRST`.
  - Register them after `prim` in `registry.ts`.

- [ ] **Step 4: Run the checks.** Run `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** with `git commit -m "Add first five SQL lessons"`.

### Task 15: Lessons 6–10 (aggregates, GROUP BY and HAVING, INNER JOIN, LEFT JOIN, subqueries)

**Files:**
- Create: `src/lessons/sql/aggregates.ts`, `group-by-having.ts`, `inner-join.ts`, `left-join.ts`, `subqueries.ts`
- Modify: `src/lessons/registry.ts`, `src/lessons/lessons.test.ts`

**Interfaces:**
- The same lesson rules as Task 14.
- Datasets: `subqueries` uses `school`; the others use `shop`.

  **`aggregates`** (prerequisites: `where`)
  - Initial query: `SELECT COUNT(*), AVG(price), MAX(price)\nFROM products;`
  - Exercises:
    - `count-customers`: "How many customers are there?" → `SELECT COUNT(*) FROM customers;`
    - `avg-price`: "The average product price." → `SELECT AVG(price) FROM products;`
    - `with-city`: "How many customers have a city recorded?" → `SELECT COUNT(city) FROM customers;`

  **`group-by-having`** (prerequisites: `aggregates`)
  - Initial query: `SELECT category, COUNT(*), AVG(price)\nFROM products\nGROUP BY category\nHAVING COUNT(*) > 2;`
  - Exercises:
    - `per-category`: "Number of products in each category." → `SELECT category, COUNT(*) FROM products GROUP BY category;`
    - `pricey-categories`: "Categories whose average price is above 30." → `SELECT category FROM products GROUP BY category HAVING AVG(price) > 30;`
    - `repeat-customers`: "Customer ids with more than one order, and how many." → `SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 1;`

  **`inner-join`** (prerequisites: `select-from`, `where`)
  - Initial query: `SELECT o.id, c.name\nFROM orders o\nJOIN customers c ON o.customer_id = c.id;`
  - Exercises:
    - `order-names`: "Each order id with its customer's name." → `SELECT orders.id, customers.name FROM orders JOIN customers ON orders.customer_id = customers.id;`
    - `order-1-items`: "Product names and quantities in order 1." → `SELECT p.name, oi.quantity FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = 1;`

  **`left-join`** (prerequisites: `inner-join`, `null-values`)
  - Initial query: `SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id;`
  - Exercises:
    - `all-customers`: "Every customer with their order ids, including customers with none." → `SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;`
    - `never-ordered`: "Customers who have never ordered." → `SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;`
    - `qty-per-product`: "Every product with its total quantity ordered, including products never ordered." → `SELECT p.name, SUM(oi.quantity) FROM products p LEFT JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name;`

  **`subqueries`** (prerequisites: `where`, `aggregates`)
  - Initial query: `SELECT title, credits\nFROM courses\nWHERE credits > (SELECT AVG(credits) FROM courses);`
  - Exercises:
    - `in-course-1`: "Students enrolled in course 1." → `SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments WHERE course_id = 1);`
    - `above-avg`: "Courses with more credits than the average course." → `SELECT title FROM courses WHERE credits > (SELECT AVG(credits) FROM courses);`
    - `not-enrolled`: "Students not enrolled in any course." → `SELECT name FROM students WHERE id NOT IN (SELECT student_id FROM enrollments);`

- [ ] **Step 1: Write the failing tests.** Append the 5 ids to `EXPECTED_IDS` and expect `lessonsIn('sql')` to have length 10. Expected: FAIL.

- [ ] **Step 2: Write the five lessons and register them** in this order after `distinct`.
  - In `subqueries`, cover the `NOT IN` + NULL pitfall in `commonMistakes`.
  - In `group-by-having`, explain the bare-column rule and note that SQLite and MySQL may allow it.

- [ ] **Step 3: Run the checks.** Run `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 4: Commit** with `git commit -m "Add SQL lessons on aggregates, grouping, joins and subqueries"`.

### Task 16: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`.**
  - Features: the lesson count becomes 39, with a SQL bullet listing the 10 lessons, the query editor and the exercises.
  - Architecture tree: add `sql/` (engine and datasets).
  - Visualization: add the `table` view kind.
  - Add a "How to add a SQL lesson" section: the config fields, the dataset rules, that `code` must equal `initialQuery`, and that `sql.js` is test-only.
  - Testing: add the differential tests.

- [ ] **Step 2: Run the full checks.** Run `npm test && npm run build`. Expected: all tests pass and the build succeeds. Then run `grep -rl "sql-wasm" dist/ || echo "not bundled"`. Expected: `not bundled`.

- [ ] **Step 3: Check in the browser.** Run `npm run dev` and drive it with Playwright at desktop (1280px) and phone (390px) widths, in light and dark themes:
  1. The header shows SQL; `/sql` lists 10 live lessons and 18 "Coming soon".
  2. On `/sql/where`: play runs through the steps, the WHERE line is highlighted during the row checks, and the table colours and marks match the legend.
  3. Edit the query to `SELECT name FROM customers WHERE city = 'Hanoi'` and press Ctrl+Enter; the visualization updates.
  4. Type `SELECT nme FROM customers`; the error suggests `name`, and the previous visualization stays.
  5. Solve an exercise; "Correct!" and "Solved" appear, and both persist after a reload.
  6. At 390px there is no horizontal page scroll; wide tables scroll inside their own card.
  7. The console has no errors.

- [ ] **Step 4: Commit** with `git commit -m "Document the SQL track"`.
