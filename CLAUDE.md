# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Stepwise is a static React app that teaches data structures, algorithms and SQL with step-by-step visualizations. It has no backend; progress is saved in LocalStorage. The live site is https://vanmanh49.github.io/stepwise/.

## Commands

```bash
npm run dev                              # Vite dev server
npm test                                 # whole Vitest suite (src/**/*.test.ts), about 2,900 tests
npx vitest run src/sql/parse.test.ts     # one file
npx vitest run -t "rotates left"         # tests whose name matches
npm run typecheck                        # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run lint                             # oxlint --deny-warnings (config: .oxlintrc.json)
npm run bench                            # SQL engine timings (src/sql/*.bench.ts, Vitest bench fixture)
npm run build                            # typecheck + production build
npm run build:pages                      # build under /stepwise/ and copy index.html to 404.html
```

CI runs `npm run lint`, `npm test`, `build:pages` and then `check:bundle`. The linter is Oxlint rather than ESLint because typescript-eslint does not support TypeScript 7. Its `correctness` and `suspicious` categories are errors, plus the React hooks rules. A few rules are switched off in `.oxlintrc.json` because they don't fit this code (the automatic JSX runtime, narrowing `{ok}` results inside tests, helpers kept next to their only caller). For a deliberate exception, use `// oxlint-disable-next-line <rule> -- <reason>`.

Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`), and a failing test blocks the deploy.

## Architecture

The core pipeline is `generator(input) → Step[] → usePlayer(steps) → <Visualizer> → renderer for step.view.kind`.

- **Steps are data.** Each `Step` (`src/types/visualization.ts`) carries a `title`, a `why`, an optional `next`, a 1-based `codeLine` into the lesson's code string, `variables`, and a complete `View` snapshot. The player (`src/engine/`) is a pure reducer that only moves an index. The renderer for a view kind can therefore draw any step on its own.
- **`View` is a discriminated union** of 15 kinds, including `array`, `tree`, `heap`, `graph`, `table`, `grid`, `panels`, `buckets`, `btree`, `trie`, `calls` and `sessions`. Every element has a `Role`. Role colours, border cues, marks and legend labels are defined only in `components/visualization/roles.ts`, and `rolesInView` there must handle every view kind. Elements keep stable ids across steps, so renderers can animate a value as it moves.
- **Lessons are data**, in two parts, so pages can list lessons without downloading their content:
  - **Metadata** (`LessonMeta`: title, keywords, complexity…) lives in `src/lessons/meta/<category>.ts`, in learning order. These modules import only types.
  - **Content** (`LessonContent`: text, visualization, code, quiz) is the default export of `src/lessons/<category>/<id>.ts`, and the file name is the id.
  - `registry.ts` serves metadata synchronously (`lessons`, `getLesson`, `lessonsIn`, `adjacentLessons`). `loadLesson(id)` imports the content through `import.meta.glob`, which gives one chunk per lesson. `LessonPage` suspends on it.
  - Tests that need content use `allLessons` / `fullLesson` from `lessons/all.testutil.ts`.
  - `main.tsx` starts `loadLesson` from the address (`lessonIdFromPath`) so a lesson opened directly downloads its content alongside the lesson page's code. A failed download rejects with `LessonLoadError`; the page's boundary tells it apart from render errors, and retrying reloads the page (browsers won't refetch a failed chunk).
  - The visualization's current step goes to `store/liveStep.ts`, read only by the "Now running" panel, so a step doesn't re-render the whole lesson page.
  - `npm run check:bundle` (run in CI) fails if the first-load JavaScript passes 600 kB or contains lesson text.
  - `curriculum.ts` lists every topic. A topic becomes a live link only when a lesson with the same id is registered.
  - `lesson.visualization.kind` (`sort`, `search`, `structure`, `text`, `graph`, `form`, `sql`) picks the input component in `components/visualization/inputs/`.
- **Data structures** (`src/data-structures/`) export a `StructureDef<S>` with `initial`, `view(state)`, `code` and `ops`. `op.run(state, args, words)` returns `{ steps, state }`. It must never mutate `state`, and an operation that cannot run returns a single explanatory step with the state unchanged (`refuse` in `shared.ts`). Arguments are numbers, or words when the arg has `text: true`; they are validated by `parseOpFields`.
- **Algorithms** (`src/algorithms/<group>/`) export three things: the code shown to learners as a string (`fooCode`), the plain algorithm (`foo`), and the step generator (`fooSteps`).
- **SQL** (`src/sql/`) is an interpreter written for this project:
  - tokenizer → parser (`ast.ts`) → `execute.ts`, which emits trace events → `steps.ts` turns them into steps;
  - also supports scripts and writes, schema and constraints, indexes (`btree.ts`), query plans (`plan.ts`), transactions and sessions;
  - it follows SQLite semantics, but deliberately rejects a column that is neither grouped nor aggregated;
  - entry points return `{ok, error}` with line and column instead of throwing;
  - runs are capped at `MAX_STEPS = 400` steps, and longer runs are summarised;
  - sample datasets live in `sql/datasets/`.
- `algorithms/`, `data-structures/` and `sql/` contain no React. All lesson text lives in `lessons/`, not in components. Colours come from CSS variables in `src/index.css`, defined for both `:root` and `.dark`.
- Progress (`store/progress.ts`, key `dsa-progress`) runs stored data through `sanitizeProgress` on load. The theme is stored as `dsa-theme` and applied in `index.html` before first paint.

## Tests that guard the whole codebase

- `src/lessons/lessons.test.ts` runs every registered lesson. It checks that references resolve, quizzes are valid, the default visualization runs, and every `codeLine` points inside the lesson's code. For SQL lessons it also checks that each example runs and each exercise's solution passes its own check.
- `src/data-structures/contract.test.ts` runs random operations against every structure lesson. It checks that no operation mutates its input, every operation yields at least one step, and every step's code line is valid. Seeded randomness comes from `random.testutil.ts`.
- SQL differential tests (`differential*.test.ts`, `scriptDifferential*.test.ts`) run query corpora (`*Corpus*.testutil.ts`) through both the interpreter and real SQLite via `sql.js`. New SQL features add their queries to a corpus. `sql.js` is a dev dependency and is never bundled.
- Look up code lines with `lineOf(code, snippet)` (`data-structures/shared.ts`) rather than hard-coding numbers. It throws if the snippet is missing.
- Renderers and components have no DOM tests; UI changes are checked by hand in a browser, including at phone width (375px) and in dark mode.

The README's "How to add a lesson / SQL lesson / algorithm / visualization" sections walk through each kind of change. Adding a new view kind means extending the `View` union, adding a renderer, and adding cases in `renderers/index.tsx` and `rolesInView`. TypeScript then reports any other place that is missing.

## Workflow conventions

- Each phase of work has a design spec in `docs/superpowers/specs/` and an implementation plan in `docs/superpowers/plans/` (superpowers plugin; the shared plugin setup is in `.claude/settings.json`). `.superpowers/` holds working files, and its `sdd/` folder is git-ignored.
- Work happens on a branch, goes through a PR and is merged into `main`, and the merge deploys the site.
- Commit messages, PR titles and PR descriptions contain no AI attribution: no `Co-Authored-By` trailer for an AI, and no "Generated with" line.
- The copy style for lessons and step text is plain, short sentences for beginners, explaining what happened and why with the actual values.
