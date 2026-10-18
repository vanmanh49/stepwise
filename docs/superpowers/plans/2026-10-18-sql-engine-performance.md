# SQL Engine Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make heavy SQL queries much faster to execute and to step through, with identical results, errors and steps.

**Architecture:** Two caches keyed by arrays that are never mutated. Row positions are cached per rows array for the step builders, and column matches are cached per column list for expression evaluation.

**Tech Stack:** TypeScript (strict), Vitest 5 (tests and the `bench` fixture).

**Spec:** `docs/superpowers/specs/2026-10-18-sql-engine-performance-design.md`

## Global Constraints

- No change to any query result, error message or step. The differential, step and lesson tests must pass unchanged.
- No new dependencies. No React in `src/sql/`.
- Branch `perf/sql-engine`. When built: commit, PR, merge.

## Review Focus

1. **Two different column lists contain the same reference** (for example `id` in a subquery and in the outer query). Expect each to resolve within its own list, and a correlated reference to still mark the subquery as correlated. Covered in Task 3.
2. **Duplicate row ids in one relation.** Expect `rowIndex` to return the first, as `findIndex` did. Covered in Task 2.
3. **A rows array referenced by an event and changed afterwards.** None is expected, because steps are built after execution. The reviewer should confirm no event's rows array is mutated after it is traced.
4. **Ambiguous and missing columns.** Expect the same errors, at the same positions, as before. These are covered by the existing `execute.test.ts` and `parse` tests.

---

### Task 1: Benchmark

**Files:** create `src/sql/engine.bench.ts`; modify `package.json` (`"bench": "vitest bench --run"`).

- [x] Benchmark `runQuery` and `scriptSteps` on the 4-table cross join, a filtering self join, a correlated subquery, and a 10× UNION that hits the work budget. Assert first that each query succeeds (or, for the UNION, fails with a `limit` error).
- [x] Record the baseline: execute 54 ms; budget 475 ms; steps 216 ms.

### Task 2: `rowIndex` for the step builders

**Files:** `src/sql/steps.ts`, `src/sql/scriptSteps.ts`, test `src/sql/rowIndex.test.ts`

**Produces:** `export function rowIndex(rows: readonly Row[], id: string): number`

- [ ] Tests:
  - returns the same index as `findIndex` for each id;
  - returns −1 for a missing id;
  - returns the first index when ids repeat;
  - two different arrays holding the same ids at different positions each answer for themselves.
- [ ] Run; expect a failure because `rowIndex` is not exported.
- [ ] Implement with a `WeakMap<readonly Row[], Map<string, number>>`. Replace the `rows.findIndex((r) => r.id === …)` lookups in `steps.ts` and `scriptSteps.ts`, and `rows.find((r) => r.id === …)` where the row itself is needed.
- [ ] Run the SQL tests and the full suite; commit.

### Task 3: `matchingColumns` for column resolution

**Files:** `src/sql/evaluate.ts`, test `src/sql/matchingColumns.test.ts`

**Produces:** `export function matchingColumns(columns: readonly ColumnRef[], expr: { table?: string; name: string }): readonly number[]`

- [ ] Tests:
  - agrees with a direct scan for qualified, unqualified and differently-cased references;
  - repeated calls return equal results;
  - one reference node gives different answers for two different column lists.
- [ ] Run; expect a failure because the function is not exported.
- [ ] Implement with `WeakMap<readonly ColumnRef[], WeakMap<object, readonly number[]>>`, keyed by the expression node. Make `resolveColumn` use it in place of its `flatMap`.
- [ ] Run the SQL tests and the full suite; commit.

### Task 4: Verify and ship

- [ ] Run `npm run bench` again and compare with the baseline.
- [ ] Re-measure the browser freeze on the 4× throttled profile with the production build.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:pages`.
- [ ] Final whole-branch review on Opus; then PR and merge.
