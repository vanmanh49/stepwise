# SQL track, phase 1: foundation and core querying

Date: 2026-10-15
Status: approved design, awaiting spec review

## Goal

Add a **SQL** menu to Stepwise so learners can learn SQL the same way they learn algorithms here: by watching it run, one step at a time, and by writing it themselves.

A SQL lesson lets the learner:

1. **Watch** a query execute clause by clause in SQL's logical order, with the rows that each clause keeps, removes, groups, joins or sorts highlighted.
2. **Write** their own queries against a sample database and step through those too.
3. **Practise** with exercises that check their query's result.

## Phasing

The full SQL course is split into four phases. Each phase gets its own spec, plan and implementation. This spec covers **phase 1 only**.

| Phase | Contents |
|---|---|
| **1. Foundation and core querying** (this spec) | menu, routes, curriculum, SQL engine, table visualization, query editor, exercises, 10 lessons |
| 2. Modifying data | INSERT, UPDATE, DELETE, CREATE TABLE, constraints; the engine gains mutable state |
| 3. Advanced querying | CASE, set operations, self join, many-to-many, CTEs, recursive CTEs, window functions |
| 4. Database internals | indexes, query plans, transactions, isolation levels, normalization, views |

The full curriculum is added in phase 1. Topics from phases 2–4 show as "Coming soon".

## Decisions

- **Learner experience:** watch and write (step-through plus an editable query and exercises).
- **Engine:** our own SQL interpreter in TypeScript that emits `Step`s. It is the only engine shipped to the browser. SQLite (via `sql.js`) is a **devDependency** used only as a reference in differential tests.
- **Semantics:** match SQLite exactly for the supported subset. Lesson text notes where PostgreSQL or MySQL differ.

Alternatives considered and rejected:

- A real engine in the browser (sql.js or PGlite) with a hand-written step generator per lesson: only the lesson's own query could be stepped through, and the app would grow by 1–3 MB.
- A hybrid of our interpreter and a shipped real engine as a fallback: two engines to maintain, the largest download, and the risk of two engines disagreeing in front of the learner.

## 1. App integration

### Category, routes and menu

- `Category` in `src/types/lesson.ts` becomes `'data-structures' | 'algorithms' | 'sql'`.
- `src/App.tsx` adds `sql` (`<Catalog category="sql" />`) and `sql/:lessonId` (`<LessonPage category="sql" />`).
- `src/components/layout/Header.tsx` adds `{ to: '/sql', label: 'SQL' }` after Algorithms, in both the desktop and mobile navs (both read the same `links` array).
- `CATEGORY_TITLE` in `CourseSidebar.tsx` gets `sql: 'SQL'`.
- `INTRO` in `pages/Catalog.tsx` gets a SQL intro.
- `pages/Home.tsx` and `pages/Dashboard.tsx` add a SQL progress bar next to the existing two.
- `SearchPalette.tsx` uses the lucide `Database` icon for SQL results.
- `ComplexityTable.tsx` and `pages/BigO.tsx` are unaffected (BigO lists only algorithms).

### Lesson type

- `Lesson.complexity` becomes optional. When it is absent, `LessonPage` hides the Complexity section, the side panel's complexity block, and the "Complexity" entry in "On this page".
- For SQL lessons, `Lesson.code` holds the lesson's example SQL query. `LessonPage` titles the code section "Example query" for `category === 'sql'` and changes the intro sentence accordingly.
- `VisualizationConfig` gains:

  ```ts
  | {
      kind: 'sql';
      dataset: DatasetId;          // 'shop' | 'school'
      initialQuery: string;        // shown and run on load
      examples: { label: string; query: string }[];  // "Try" chips
      exercises: SqlExercise[];
    }
  ```

  ```ts
  interface SqlExercise {
    id: string;              // unique within the lesson
    prompt: string;          // "List customers who have never ordered."
    solution: string;        // reference query
    orderMatters: boolean;   // true only when the task asks for an order
    hint?: string;
  }
  ```

- `LessonVisualization.tsx` routes `kind: 'sql'` to a new `SqlInput`.

### Ids and progress

- Lesson ids share one namespace across categories (progress and `getLesson` key by id). `lessons.test.ts` asserts that ids are unique across the whole curriculum.
- The progress store (`src/store/progress.ts`) gains `exercises: string[]`, holding entries of the form `"<lessonId>/<exerciseId>"`. Loading validates it like the other fields; missing or invalid data becomes `[]`. Solving every exercise of a lesson marks that lesson complete, the same way a perfect quiz score does.

## 2. SQL engine (`src/sql/`)

No React in this folder, the same rule as `algorithms/`.

| File | Responsibility |
|---|---|
| `tokenize.ts` | SQL text → tokens with line and column |
| `ast.ts` | AST types |
| `parse.ts` | tokens → `SelectStatement` AST; every clause records its source line |
| `values.ts` | SQL values (`number`, `string`, `null`), SQLite-compatible comparison, arithmetic, truthiness and three-valued logic |
| `evaluate.ts` | expression evaluation against a row (including aggregates over a group and subqueries) |
| `execute.ts` | `runQuery(db, sql): QueryResult`, the pure result |
| `steps.ts` | `querySteps(db, sql): Step[]` |
| `errors.ts` | `SqlError { message, line, column, kind: 'syntax' \| 'name' \| 'unsupported' \| 'limit' }` |
| `check.ts` | the exercise checker |
| `datasets/` | `shop.ts`, `school.ts`, `index.ts` |

`runQuery` and `querySteps` never throw. They return `{ ok: true, ... } | { ok: false, error: SqlError }`.

### Logical execution order

FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT/OFFSET.

`querySteps` emits steps in this order. Each step has:

- a `title` using real values, e.g. "Row 3: total > 20 → NULL > 20 is unknown, row removed"
- a `why` explaining the rule, e.g. "WHERE keeps a row only when the condition is true; unknown counts as false"
- `codeLine` set to the line of the clause in the learner's query
- `variables` showing the current clause, the rows kept so far, and the current group where relevant
- a `table` view (section 3)

Each query begins with an overview step and ends with a final result step.

### Supported subset

- `SELECT [DISTINCT]` with `*`, `t.*`, expressions, and `AS` aliases
- `FROM table [AS] alias`
- `[INNER] JOIN` and `LEFT [OUTER] JOIN` with `ON`
- `WHERE` and `HAVING` expressions:
  - comparison operators `= <> != < <= > >=`
  - `AND`, `OR`, `NOT`
  - `+ - * / %`
  - `IN (list)` and `IN (subquery)`, both with `NOT`
  - `BETWEEN`, `LIKE` (`%` and `_`), `IS [NOT] NULL`
  - scalar subqueries; correlated subqueries are allowed
- aggregates `COUNT(*)`, `COUNT(x)`, `COUNT(DISTINCT x)`, `SUM`, `AVG`, `MIN`, `MAX`
- `GROUP BY` expressions, and `HAVING`
- `ORDER BY` on several keys, each `ASC` or `DESC`, by expression, alias or column position
- `LIMIT n [OFFSET m]`
- numeric, single-quoted string and `NULL` literals, plus `--` comments
- keywords are case-insensitive; identifiers are case-insensitive, and double-quoted identifiers are accepted

Anything else gives an `unsupported` error that names the feature and, when one exists, the lesson where it is planned. Example: "Window functions arrive in a later lesson."

### SQLite semantics to match

- three-valued logic; `NULL = NULL` is unknown
- integer division for two integers; `AVG` returns a real number
- `NULL` sorts first in `ASC` and last in `DESC`
- `LIKE` is case-insensitive for ASCII letters
- `SUM` of no rows is `NULL`, `COUNT` of no rows is `0`
- an aggregate without `GROUP BY` returns one row
- columns that are not aggregated or grouped are **rejected** with a teaching error ("`name` must appear in GROUP BY or be used in an aggregate"), even though SQLite accepts them. Differential tests do not include such queries.

### Errors

- Syntax errors include the line and column, e.g. "Expected FROM after the column list (line 2, col 8)".
- An unknown table or column suggests the closest name (edit distance ≤ 2), e.g. "No column `cutomer_id`. Did you mean `customer_id`?"
- An ambiguous column lists the tables that have it.
- Query text is capped at 2,000 characters.

### Limits

- Datasets have at most 20 rows per table.
- `querySteps` emits at most 400 steps. When a query would exceed that, stretches of same-outcome row checks are merged into one summary step ("…12 more rows checked, 4 kept"), and the overview, clause-transition and final steps are always kept.

### Datasets (read-only)

- `shop`: `customers(id, name, city, joined)`, `products(id, name, category, price)`, `orders(id, customer_id, ordered_on, status)`, `order_items(order_id, product_id, quantity)`
- `school`: `students(id, name, year, email)`, `courses(id, title, credits)`, `enrollments(student_id, course_id, grade)`

They deliberately contain NULLs (a missing city or grade), duplicate values, ties for ORDER BY, a customer with no orders, a course with no students, and an order whose items reference a cheap product. Each dataset is defined once as `{ tables: { name, columns: { name, type }[], rows }[] }`, the same input `sql.js` is loaded with in tests.

## 3. Visualization and editor

### `table` view

Added to `View` in `src/types/visualization.ts`:

```ts
interface SqlRow {
  id: string;                         // stable across steps
  cells: (number | string | null)[];
  role: Role;
  /** Column indexes to highlight in this row. */
  focus?: number[];
  /** Group number while GROUP BY is shown. */
  group?: number;
  /** Short mark shown at the end of the row, e.g. "kept", "removed", "no match". */
  note?: string;
}

interface SqlTable {
  label: string;      // "orders", "after WHERE", "result"
  columns: string[];
  rows: SqlRow[];
}

interface TableView {
  kind: 'table';
  clauses: string[];   // clauses this query uses, in logical order
  current?: string;    // the clause being run
  tables: SqlTable[];  // 1–3: inputs, then the working or result table
}
```

`TableRenderer` (`components/visualization/renderers/TableRenderer.tsx`):

- draws the clause strip, with the current clause highlighted
- draws the tables side by side on wide screens and stacked on narrow ones; tables scroll horizontally inside their own card, so the page never scrolls sideways
- uses the existing roles: `active` (row being evaluated), `found` (kept), `discarded` (removed), `compare` (JOIN candidate), `sorted` (final position)
- draws NULL as a distinct `NULL` chip
- draws groups as banded rows
- animates row movement via stable ids

It is registered in `renderers/index.tsx` and in `rolesInView` in `roles.ts`.

### `SqlInput`

`components/visualization/inputs/SqlInput.tsx`:

- a monospace textarea; Ctrl/Cmd+Enter runs the query
- **Run** and **Reset to example** buttons, and one "Try" chip per `examples` entry
- a collapsible schema panel: each table's columns with their types, and a "peek" at its first 5 rows
- passes the **current query** as the `code` prop to `Visualizer`, so `CodePanel` highlights the clause line of the learner's own query
- on an error, shows the message under the editor with the line and column, and keeps the last good visualization

### Exercises

`components/sql/Exercises.tsx`, rendered in the lesson's Practice section above the quiz for SQL lessons.

- For each exercise: the prompt, its own query textarea, **Check**, and an optional **Show hint**.
- `check.ts` runs the learner's query and the solution through `runQuery` and compares them:
  - as multisets, or as sequences when `orderMatters` is true
  - by the number of columns, not by column names
- The feedback is one of:
  - "Correct"
  - "2 rows missing, 1 extra row"
  - "Right rows, wrong order"
  - "Expected 2 columns, got 3"
  - the learner's own SQL error
- A solved exercise is recorded in the progress store.

## 4. Lessons and curriculum

### Live in phase 1, in learning order

| Id | Title | Level |
|---|---|---|
| `select-from` | SELECT and FROM | beginner |
| `where` | Filtering with WHERE | beginner |
| `null-values` | NULL and three-valued logic | beginner |
| `order-by-limit` | Sorting and LIMIT | beginner |
| `distinct` | DISTINCT | beginner |
| `aggregates` | COUNT, SUM, AVG, MIN, MAX | beginner |
| `group-by-having` | GROUP BY and HAVING | intermediate |
| `inner-join` | INNER JOIN | intermediate |
| `left-join` | LEFT JOIN | intermediate |
| `subqueries` | Subqueries | intermediate |

Each lesson file lives in `src/lessons/sql/<id>.ts` and fills in every `Lesson` field except `complexity`:

- 3 or 4 `examples`
- 2 or 3 `exercises`
- a quiz of 4 or 5 questions, using the existing types; `predict-next` questions show a `table` view

### "Coming soon"

| Group | Topics |
|---|---|
| Modifying data | `insert`, `update`, `delete`, `create-table`, `constraints` |
| Advanced querying | `case-expressions`, `set-operations`, `self-join`, `many-to-many`, `ctes`, `recursive-ctes`, `window-functions` |
| Database internals | `indexes`, `query-plans`, `transactions`, `isolation-levels`, `normalization`, `views` |

## 5. Testing

All tests run in Node with Vitest. The new devDependency is `sql.js`.

- **Tokenizer and parser:** each supported construct produces the expected AST; malformed queries produce the expected message, line and column; unsupported constructs produce an `unsupported` error.
- **Differential:** about 120 queries across both datasets, run through `runQuery` and `sql.js`, must give equal results (compared as sequences when the query has `ORDER BY` with no ties in its keys, otherwise as multisets). The corpus covers NULL comparisons, empty results, duplicates, ORDER BY ties, LEFT JOIN with no match, GROUP BY on NULL, aggregates over empty input, correlated and nested subqueries, LIKE edge cases, and integer versus real division.
- **Steps:**
  - the final step's result table equals `runQuery`
  - every `codeLine` is within the query's line count
  - the number of steps is at most 400
  - row ids are stable
  - every step's `clauses` lists only clauses the query uses
- **Checker:** correct; missing rows; extra rows; order wrong with `orderMatters` both on and off; column count mismatch; learner query error.
- **`lessons.test.ts`:**
  - for every SQL lesson, `initialQuery` and every example run without error
  - every exercise's solution passes its own check
  - ids are unique across the whole curriculum
  - the category counts include 10 SQL lessons
- **Progress store:** the `exercises` field is validated, a missing field defaults to `[]`, and solving all of a lesson's exercises marks it complete.

## Out of scope for phase 1

- statements that change data, and a user-created database
- other SQL dialects
- syntax highlighting in the editor
- a backend of any kind
