# Deferred minors from PRs #14 and #16

The final reviews of the SQL engine work (#14) and the performance polish (#16) left nine small findings for later. This phase fixes all of them. None changes what a learner sees, except that a lesson that crashes while its file loads now gets the right message.

## SQL engine (#14)

1. **Benchmark getter warning.** Vitest warns that the engine's cross-module calls go through Vite's export getters, so absolute Node timings include that overhead. The benchmark can't run without Vite's module runner, because the source uses extensionless and directory imports that native Node ESM rejects. The numbers are only ever read as before/after ratios on the same runner, and real timings come from the browser. So the warning is silenced with `benchmark.suppressExportGetterWarnings`, and the benchmark file's header explains why.
2. **"Build steps" benchmark doesn't check its query runs.** Like the "execute only" benchmark, it first asserts that `scriptSteps` succeeds for every query, so it can never time an early error.
3. **Readonly relations.** `Relation.columns`, `Relation.rows` and `Scope.columns` become readonly arrays, so the compiler enforces the "never changed after creation" rule that the `rowIndex` and `matchingColumns` caches rely on.
4. **Correlated subquery that repeats the outer column's name.** A direct test: `SELECT name FROM employees e WHERE salary > (SELECT AVG(salary) FROM employees x WHERE x.department_id = e.department_id)` on the company dataset returns Minh, Hoa, Tuan, Vy and Khoa (the same as SQLite). The unqualified `salary` inside must resolve to the inner table, and `e.department_id` to the outer one.

## Lessons and pages (#16)

5. **Crash while a lesson file loads.** The loader wraps a failure in `LessonLoadError` only when it looks like a download failure: an error whose message matches what browsers and Vite report for a failed chunk ("Failed to fetch dynamically imported module" in Chrome, "error loading dynamically imported module" in Firefox, "Importing a module script failed" in Safari, "Unable to preload" from Vite). Anything else, such as an exception thrown by the module's own code, is passed through unchanged, so the page says "Something went wrong while showing this lesson." Either way the loader keeps the one rejected promise per id.
6. **Home preview visibility.** The IntersectionObserver callback uses the last entry of a batch, which is the element's current state, rather than the first.
7. **Store spec and test.** The performance-polish spec describes the store as `useLiveStep` with a `set` action, matching the code. The store test resets the store before each test and checks the initial state with `getInitialState()`, so it passes in any order.

## Bundle check (#16)

8. **Attribute matching.** `attr(tag, name)` matches only a whole attribute name (preceded by whitespace), so `data-type="module"` or `data-rel="modulepreload"` no longer count as `type` or `rel`. The command line prints the budget it actually used.
9. **Symlinked path.** The command-line guard compares the module's URL with the real path of `process.argv[1]`, so running the script through a symlink still runs the check.

## Not in scope

Motion's LazyMotion (about 25–30 kB) stays set aside: it means rewriting every `motion.` element in the renderers for a small gain.
