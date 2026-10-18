# SQL track, phase 3: advanced querying

Date: 2026-10-18
Status: approved design, awaiting spec review

## Goal

Turn the seven "Advanced querying" and join topics of the SQL menu into live lessons: **Self Join**, **Many-to-Many Joins**, **CASE Expressions**, **UNION, INTERSECT, EXCEPT**, **Common Table Expressions**, **Recursive CTEs** and **Window Functions**. SQL goes from 15 to 22 live lessons.

This is phase 3 of 4 (see `2026-10-15-sql-track-phase-1-design.md`, "Phasing"). Phase 4 (database internals) gets its own spec later.

## Decisions

- **Our own interpreter, extended**, as in phases 1 and 2. sql.js stays a test-only reference.
- **A new `company` dataset** supplies a hierarchy for recursive CTEs, the classic employee–manager self join, and salaries for window functions.
- Self Join and Many-to-Many already run in the engine; they need lessons and one labelling fix only.
- **One spec, one plan, one PR** on branch `sql-phase-3`; when built: commit, PR, merge.

## 1. Engine (`src/sql/`)

### CASE

- Searched `CASE WHEN cond THEN a [WHEN …] [ELSE b] END` and simple `CASE x WHEN v THEN a … END`. Without ELSE the result is NULL. Simple CASE compares with `=` (NULL never matches).
- Allowed wherever an expression is: SELECT, WHERE, GROUP BY, HAVING, ORDER BY, inside aggregates, UPDATE … SET, CHECK.

### SELECT without FROM

- `SELECT 1, 'a'` returns one row, as in SQLite. WHERE on it keeps or drops that row. Needed for recursive CTE anchors such as `SELECT 1`.

### Set operations

- `select (UNION | UNION ALL | INTERSECT | EXCEPT) select …`, evaluated left to right.
- Every SELECT must return the same number of columns (error: "Each SELECT in a UNION must return the same number of columns: the first returns 2, this one returns 3."). The result takes the first SELECT's column names.
- UNION, INTERSECT and EXCEPT remove duplicate rows (NULLs count as equal); UNION ALL keeps them. Without ORDER BY, no row order is promised (the interpreter keeps first-seen order, left side first); tests compare such results as multisets.
- A trailing ORDER BY and LIMIT apply to the whole compound. ORDER BY may use the first SELECT's column names or positions; other expressions give "ORDER BY after UNION can only name a result column or its position."
- ORDER BY or LIMIT inside a non-final SELECT is a syntax error, as in SQLite.

### CTEs

- `WITH name [(col, …)] AS (select), … main` where `main` is a SELECT, INSERT, UPDATE or DELETE. A CTE is visible to later CTEs and to the main statement, and shadows a table of the same name.
- A CTE's column list must match its SELECT's column count.
- `WITH RECURSIVE name [(cols)] AS (anchor (UNION | UNION ALL) step)`:
  - the anchor is evaluated once; the step is evaluated repeatedly, each time seeing only the rows added in the previous round as `name`;
  - with UNION, rows already in the result are not added again (this also ends cycles); with UNION ALL, every row is added;
  - it stops when a round adds no rows;
  - the step may reference `name` once, in FROM or JOIN, not inside a subquery or aggregate (SQLite's restrictions; anything else gives an error naming the rule);
  - **guard**: more than 100 rounds or 1,000 rows gives a `limit` error: "This recursion never stops on its own. Add a condition that ends it, such as WHERE n < 10."
- `WITH` without `RECURSIVE` referencing itself gives "Add RECURSIVE to let a CTE refer to itself."

### Window functions

- Functions: `ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`, `LAG(x [, offset [, default]])`, `LEAD(x [, offset [, default]])`, and `COUNT(*|x)`, `SUM`, `AVG`, `MIN`, `MAX` followed by `OVER`.
- `OVER ([PARTITION BY expr, …] [ORDER BY expr [ASC|DESC], …])`.
- Default frame (SQLite's): with ORDER BY, from the partition start to the current row **including its peers** (rows equal on the ORDER BY keys); without ORDER BY, the whole partition.
- Evaluated after WHERE, GROUP BY and HAVING, before DISTINCT, ORDER BY and LIMIT. Allowed in the SELECT list and ORDER BY only; elsewhere: "Window functions can only be used in SELECT and ORDER BY." A window function's arguments may use aggregates when the query is grouped (e.g. `RANK() OVER (ORDER BY SUM(salary) DESC)`).
- Unsupported, with the usual message: frame clauses (`ROWS`, `RANGE`, `GROUPS`), named windows (`WINDOW w AS …`), `FILTER`, and the functions `NTILE`, `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE`, `PERCENT_RANK`, `CUME_DIST`.

### Parser

- The `LATER` entries for CASE, UNION, INTERSECT, EXCEPT, WITH and OVER are removed. New words (`RECURSIVE`, `ROW_NUMBER` …) are recognised by position, as in phase 2, so they stay usable as names.

## 2. Steps and visualization

No new view kinds. The `table` view's clause bar gains `WITH`, `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT` and `WINDOW` where a query uses them.

- **CASE in SELECT**: the SELECT step expands into one step per row, e.g. "Row 3: price 42 → WHEN price >= 40 is true → 'premium'". The columns the CASE read are in `focus`, the branch taken is named; rows with the same branch are merged by the existing summarising. CASE in WHERE, ORDER BY or elsewhere shows within the existing row checks.
- **Set operations**: each side's result as one step ("Left SELECT: 7 rows", "Right SELECT: 4 rows"); then a combine step showing both inputs and the result: UNION marks repeats `duplicate, dropped`; INTERSECT marks `in both` (found) and `only in left` (discarded); EXCEPT marks `also in right, removed` (discarded); UNION ALL marks every row `kept`. Then the shared ORDER BY / LIMIT steps. With more than two SELECTs, one combine step per operator, left to right.
- **CTEs**: one step per CTE, "WITH dept_pay: 3 rows", showing its result as a table labelled with the CTE's name. Then the main statement's usual steps; its FROM reads the CTE like a table.
- **Recursive CTEs**: an anchor step ("Start: 1 row (Lan)"), one step per round ("Round 2: 3 new rows, reached from the 2 rows found in round 1") showing the CTE table so far with the rows that round read in `compare` and its new rows in `found`, and a final "Round 5 finds nothing, so the recursion stops". Rounds are merged by the existing summarising when a run is long.
- **Window functions**: a `WINDOW` clause in the bar between HAVING and SELECT. One step sorts the rows into partitions (the existing `SqlRow.group` numbers, in PARTITION BY order, then ORDER BY); then one step per row fills the new column(s), e.g. "Engineering, row 2: RANK() = 2, tied with Tuan on 5200", with the rows the value depends on (the frame, or the peers for ranking, or the LAG/LEAD target) in `compare` and the current row `active`. Several window columns are filled in the same per-row step.
- **Self join labels**: when one table appears more than once, step tables are labelled by alias with the table in brackets, `e (employees)` and `m (employees)`.
- The 400-step cap and summarising apply to every new kind of step.

## 3. Data and lessons

### `company` dataset

`departments(id INTEGER PRIMARY KEY, name TEXT NOT NULL)`:

| id | name |
|---|---|
| 1 | Management |
| 2 | Engineering |
| 3 | Sales |
| 4 | Support |

`employees(id INTEGER PRIMARY KEY, name TEXT NOT NULL, manager_id INTEGER REFERENCES employees(id), department_id INTEGER REFERENCES departments(id), salary INTEGER NOT NULL, hired TEXT)`:

| id | name | manager_id | department_id | salary | hired |
|---|---|---|---|---|---|
| 1 | Lan | NULL | 1 | 9000 | 2015-02-01 |
| 2 | Minh | 1 | 2 | 7000 | 2016-05-10 |
| 3 | Hoa | 1 | 3 | 6500 | 2016-09-01 |
| 4 | Tuan | 2 | 2 | 5200 | 2018-03-15 |
| 5 | Vy | 2 | 2 | 5200 | 2019-01-20 |
| 6 | Khoa | 4 | 2 | 5400 | 2020-06-01 |
| 7 | Nam | 4 | 2 | 4100 | 2021-02-11 |
| 8 | Linh | 3 | 3 | 4800 | 2015-08-01 |
| 9 | Quang | 3 | 3 | 4800 | 2019-04-22 |
| 10 | Mai | 8 | 3 | 3900 | 2022-01-05 |
| 11 | Bao | 6 | 2 | 3600 | 2023-03-01 |
| 12 | Thu | 1 | NULL | 3000 | 2020-10-10 |

Properties the lessons rely on: a 5-level chain (Lan → Minh → Tuan → Khoa → Bao); salary ties within Engineering (Tuan, Vy) and Sales (Linh, Quang); Khoa earns more than his manager Tuan; Linh was hired before her manager Hoa; Thu has no department; Support has no employees. The dataset is added to `DatasetId`, `datasets`, the dataset tests and the schema panel.

### Lessons

Ids, titles, difficulty and group come from the curriculum. Each has 3–4 examples, 2–3 exercises (result-compared SELECTs, as in phase 1), the standard content, and 4–5 quiz questions with at least one showing a `table` view.

| Lesson | Data | Opening query | Examples | Exercises | Prerequisites |
|---|---|---|---|---|---|
| Self Join | company | Each employee with their manager's name (LEFT JOIN of employees to itself) | INNER version (Lan disappears); colleagues in the same department (`a.id < b.id`); employees earning more than their manager | Employee and manager names, including Lan; employees hired before their manager | `inner-join`, `left-join` |
| Many-to-Many Joins | school | Students with their course titles through enrollments | Courses per student; who takes Databases; courses with no students | Mai's course titles; students per course including zero | `inner-join`, `group-by-having` |
| CASE Expressions | shop | Price tier per product: premium (≥ 40), standard (≥ 15), budget | Simple CASE on category; CASE in ORDER BY; `SUM(CASE …)` counts; no ELSE → NULL | Label each order shipped / not shipped; pending and shipped counts in one row | `where` |
| UNION, INTERSECT, EXCEPT | shop | Customers with a shipped order UNION customers with a pending order | UNION ALL keeps repeats; INTERSECT; EXCEPT; ORDER BY over the whole result | Customers who ordered but never had a cancelled order; one list of customer and product names | `distinct`, `where` |
| Common Table Expressions | company | `WITH dept_pay AS (…)` → employees paid above their department's average | Two chained CTEs; a column list; one CTE used twice | Departments whose total salary is above 10,000; employees in the department with the highest average salary | `subqueries`, `group-by-having` |
| Recursive CTEs | company | Org chart from Lan down with a level column | Numbers 1 to 10; the managers above one employee; UNION vs UNION ALL | Everyone under Minh, directly or not; the chain of managers above Bao | `ctes`, `self-join` |
| Window Functions | company | `RANK() OVER (PARTITION BY department_id ORDER BY salary DESC)` | ROW_NUMBER vs RANK vs DENSE_RANK; running payroll ordered by hire date; LAG of the previous hire's salary; department average beside each row | Top earner(s) per department (rank 1, via a CTE); each salary minus the department average | `group-by-having`, `ctes` |

`registry.ts` places them in curriculum order; `lessons.test.ts` counts 22 SQL lessons.

## 4. Testing

- **Differential (sql.js)**: at least 90 new queries over all three datasets: CASE (both forms, no ELSE, NULL comparisons, inside aggregates and ORDER BY); set operations (duplicates, NULLs, three operands, ORDER BY by name and position, LIMIT); CTEs (chained, used twice, column lists, before INSERT/UPDATE/DELETE, shadowing a table); recursive CTEs (down a tree, up a chain, number series, UNION ending a cycle, UNION ALL); window functions (each function, with and without PARTITION BY and ORDER BY, ties, running sums, LAG/LEAD offsets and defaults, window over aggregates, window in ORDER BY); SELECT without FROM.
- **Parser**: every new form parses with positions; mismatched column counts, ORDER BY inside a non-final SELECT, frames and unsupported functions give the specified messages.
- **Engine**: the recursion guard fires with its message; self-reference without RECURSIVE gives its message.
- **Steps**: `codeLine` in range; at most 400 steps; final result equals `runQuery`; recursion ends with the "stops" step; combine and window steps carry the specified notes and roles.
- **Lessons**: the existing lesson tests apply (examples run, exercises pass, quiz has a table view); 22 SQL lessons.
- **Before the PR**: `npm test`, typecheck, `build:pages`, and a browser pass over the seven lessons (light and dark, 375px).

## Out of scope for phase 3

- Window frames (`ROWS`/`RANGE`/`GROUPS BETWEEN`), named windows, `FILTER`, `NTILE`, `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE`, `PERCENT_RANK`, `CUME_DIST`
- `EXISTS`, `MATERIALIZED` hints, recursive CTEs with more than one recursive step
- Phase 4 topics (indexes, query plans, transactions, isolation levels, normalization, views)
