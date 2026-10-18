# SQL engine performance

Date: 2026-10-18
Status: approved ("Yes, start improvement" after the performance review)

## Goal

Heavy SQL queries freeze the page, because the interpreter runs on the main thread. On a 4× CPU-throttled browser profile, a valid 4-table join on the 12-row `employees` table blocks the page for about 930 ms, and a query that hits the work budget blocks it for about 2 s. Cut that time without changing any query result, error or step.

## Measurements (before)

`npm run bench` (`src/sql/engine.bench.ts`), Node, unthrottled:

| Benchmark | Mean |
|---|---|
| Execute: 4-table join, 22,600 row checks | 54 ms |
| Execute: query that hits the 200,000-check work budget | 475 ms |
| Execute and build steps: 4-table join | 216 ms |

## Causes

1. **Step building is quadratic.** For each traced event, `buildDrafts` (`steps.ts`) and `scriptSteps.ts` find the row's position with `rows.findIndex((r) => r.id === id)`. The 4-table join emits 22,617 `join-test` events against a left relation of up to 1,728 rows, which is about 18 million comparisons, even though at most 400 steps are shown.
2. **Column resolution repeats on every row.** For every column reference on every row, `resolveColumn` (`evaluate.ts`) rebuilds a match list with `flatMap` over the scope's columns. The answer depends only on the column list and the reference, both fixed for the whole query.

## Changes

1. **`rowIndex(rows, id)`** in `src/sql/steps.ts`: returns the index of the first row with that id, or −1, exactly like the `findIndex` it replaces. It builds an id → index map once per rows array and caches it in a `WeakMap`, so later lookups are O(1). It is used at every per-event row lookup in `steps.ts` and `scriptSteps.ts`.
   - This is safe because steps are built after execution has finished, so no rows array changes after its map is built.
2. **`matchingColumns(columns, expr)`** in `src/sql/evaluate.ts`: returns the indexes of the columns a reference matches, cached per `ColumnRef[]` (in a `WeakMap`) and per column-expression node. `resolveColumn` keeps its outward walk, its ambiguity and missing-column errors, and its correlation marking. Only the per-level scan is cached.
   - This is safe because `ColumnRef[]` arrays are never mutated after they are built, and matching depends only on names.

## Not in this phase

- **Moving SQL into a Web Worker.** Re-measure first; consider it later if freezes remain.
- **Avoiding the combined row** that the join loop builds for rejected pairs.
- **Lesson code splitting and the lesson page re-render.** These are separate phases.

## Testing

- New unit tests cover `rowIndex` (first occurrence, missing id, repeated calls on the same array, separate arrays) and `matchingColumns` (agrees with a direct scan, qualified and unqualified names, case-insensitive matching, and two column lists that share a reference but resolve it differently).
- Everything that exists stays green. The differential tests against real SQLite and the step tests show that results, errors and steps are unchanged.
- `npm run bench` before and after, plus the browser freeze measured again on the throttled profile.
