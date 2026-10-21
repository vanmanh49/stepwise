# Deferred Minors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine minor findings deferred from PRs #14 and #16.

**Architecture:** Small, independent edits to the SQL benchmark and types, the lesson loader, the home preview, the live-step store test and the bundle check. No new dependencies.

**Tech Stack:** TypeScript strict, Vitest 5, Zustand 5, Node scripts.

**Spec:** `docs/superpowers/specs/2026-10-21-deferred-minors-design.md`

## Global Constraints

- No new dependencies.
- Commit messages contain no AI attribution.
- `npm run lint`, `npm run typecheck` and `npm test` stay clean.

## Review Focus

- A real chunk download failure in each major browser must still show "This lesson couldn't be downloaded." (message patterns in Task 2).
- An exception thrown by a lesson module must not be cached as anything other than one rejected promise per id.
- Readonly typing must not need casts that hide a real mutation.
- The bundle check must still find the entry script and preloads in the real `dist/index.html`.

---

### Task 1: SQL engine minors

**Files:** Modify `src/sql/engine.bench.ts`, `vite.config.ts`, `src/sql/execute.ts` (Relation), `src/sql/evaluate.ts` (Scope), plus whatever the compiler flags; test in `src/sql/grouping.test.ts`.

- [ ] Add test `it('resolves a correlated subquery that repeats the outer column names')` in the `subqueries` area of `grouping.test.ts`, on `datasets.company`, expecting `[['Minh'], ['Hoa'], ['Tuan'], ['Vy'], ['Khoa']]`. Run it; it passes (it pins existing behaviour that only the SQLite corpus covered).
- [ ] Make `Relation.columns: readonly ColumnRef[]`, `Relation.rows: readonly Row[]`, `Scope.columns: readonly ColumnRef[]`. Run `npm run typecheck`: Expected errors at any place that mutates or passes them as mutable; fix each by copying (`[...rows]`) or widening a parameter to readonly, never by casting.
- [ ] In the "execute and build steps" bench, assert `scriptSteps(company, sql).ok` is true for every query before timing.
- [ ] Set `test.benchmark.suppressExportGetterWarnings: true` in `vite.config.ts`; extend the bench header comment with why.
- [ ] `npm run bench -- --reporter=verbose`: Expected no "Benchmark Warning", 3 passed. Full suite green. Commit.

### Task 2: Lesson load errors

**Files:** Modify `src/lessons/registry.ts`; test `src/lessons/split.test.ts`.

- [ ] Tests: `LessonLoadError` wraps each of `new TypeError('Failed to fetch dynamically imported module: https://x/a.js')`, `new TypeError('error loading dynamically imported module: https://x/a.js')`, `new TypeError('Importing a module script failed.')`, `new Error('Unable to preload CSS for /a.css')`; an importer rejecting with `new ReferenceError('quiz is not defined')` rejects with that same error (`toBe`), not a `LessonLoadError`, and the promise is still kept per id. Update the existing "keeps a failed load" test to use a download-failure message. Run: the ReferenceError test FAILS.
- [ ] Implement `isDownloadFailure(error: unknown): boolean` (module-private) with one regex over the four messages; the reject handler throws `new LessonLoadError(id, error)` only when it is true, otherwise rethrows `error`. Update the class doc comment.
- [ ] Tests pass; commit.

### Task 3: Preview, store test, spec wording

**Files:** Modify `src/components/visualization/MiniPlayer.tsx`, `src/store/liveStep.test.ts`, `docs/superpowers/specs/2026-10-18-performance-polish-design.md`.

- [ ] Show the store test is order-dependent: `npx vitest run src/store/liveStep.test.ts --sequence.shuffle --sequence.seed=<n>` for a seed where "starts empty" runs after a `set`. Expected: FAIL.
- [ ] Add `beforeEach(() => useLiveStep.setState(useLiveStep.getInitialState(), true))`; "starts empty" asserts `getInitialState().live` is undefined. Same shuffled command: PASS.
- [ ] MiniPlayer: `(entries) => setInView(entries.at(-1)!.isIntersecting)`.
- [ ] Spec line: replace "with `setLiveStep` and `useLiveStep`" by "read and written through the `useLiveStep` hook (`live` and `set`)".
- [ ] Lint, typecheck, suite; commit.

### Task 4: Bundle check

**Files:** Modify `scripts/check-bundle.mjs`; test `scripts/check-bundle.test.ts`.

- [ ] Test `it('ignores data-type and data-rel attributes')`: html = `entryTag + '<script data-type="module" src="/stepwise/assets/other.js"></script>' + '<link data-rel="modulepreload" href="/stepwise/assets/other.js">'` with assets index.js, other.js and the lesson chunk; expect no problems and files `['index.js']`. Run: FAILS (found 2).
- [ ] Test `it('runs from the command line through a symlinked path')`: build a fake dist, symlink `scripts/check-bundle.mjs` into a temp dir, `spawnSync(process.execPath, [link, dist], { cwd: repo root })`; expect status 0 and stdout containing `first load (budget 600 kB)`. Run: FAILS (no output).
- [ ] `attr` uses `(?:^|\\s)${name}="([^"]+)"`; the guard compares with `pathToFileURL(realpathSync(process.argv[1]))`; the CLI keeps `const budgetKb = 600`, passes it and prints it.
- [ ] Tests pass; `npm run build:pages && npm run check:bundle` passes with 516.6 kB; commit.
