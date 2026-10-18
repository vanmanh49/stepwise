# Lesson Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pages load only lesson metadata. A lesson's content and generators download when it is opened, cutting first-load JavaScript from 1,274 kB to about 470 kB.

**Architecture:**
- Metadata fields move from the 86 lesson files into three data-only modules.
- Each lesson file default-exports its content.
- The registry serves metadata synchronously and loads content through `import.meta.glob`, giving one chunk per lesson.
- `LessonPage` suspends on `use(loadLesson(id))`.
- A bundle-budget script in CI stops lesson content from creeping back into the first load.

**Tech Stack:** React 19 (`use`, `Suspense`), Vite 8 / Rolldown (`import.meta.glob`), TypeScript strict, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-18-lesson-code-splitting-design.md`

## Global Constraints

- **No visible change** except a brief loading state on the lesson page.
- **Every existing test keeps checking every lesson.** No test coverage is lost in the move.
- **Metadata modules import only types.**
- `lessons` and every `LessonMeta[]` in `src/lessons/meta/` keep the current learning order (`EXPECTED_IDS` in `lessons.test.ts`).
- Branch `perf/lesson-splitting`. When built: commit, PR, merge.

## Review Focus

1. **Navigating between two lessons whose content isn't loaded yet.** Expect the new lesson's header and a loading state, never the old lesson's content under the new title. Covered in Task 3 by keying the page per lesson, and checked in the browser.
2. **A content chunk that fails to load** (offline). Expect an inline message with "Try again", and the retry must request the chunk again rather than reuse the failed promise. Covered in Task 2 by the `loadLesson` test where a rejection is not cached.
3. **Old URLs and wrong categories** (`/algorithms/array`). Expect the same redirect as today, decided from metadata before anything loads. Covered by the existing route behaviour in Task 3.
4. **Lesson content that now references a metadata field** (for example a quiz that reads `lesson.title`). Expect a type error during the move, not a runtime `undefined`. Covered in Task 2 by typecheck, since `LessonContent` has no metadata fields.
5. **The first-load budget regressing silently.** Expect CI to fail. Covered in Task 4.

---

### Task 1: Types

**Files:** `src/types/lesson.ts`

**Produces:**
- `LessonMeta = Pick<Lesson, 'id' | 'title' | 'category' | 'difficulty' | 'group' | 'description' | 'keywords' | 'prerequisites' | 'complexity' | 'compareWith'>`
- `LessonContent = Omit<Lesson, keyof LessonMeta>`

`Lesson` keeps its current definition, so nothing else changes in this task.

- [ ] Add the two types; `npm run typecheck` is clean; commit.

### Task 2: Move metadata, load content on demand

**Files:**
- Create: `src/lessons/meta/{data-structures,algorithms,sql}.ts`, `src/lessons/all.testutil.ts`, `src/lessons/split.test.ts`.
- Modify:
  - all 86 `src/lessons/<category>/<id>.ts`;
  - `src/lessons/registry.ts`;
  - `src/pages/LessonPage.tsx` (only the minimal loading needed to typecheck; the polish is Task 3);
  - components that receive registry results: `ComplexityTable`, `PrerequisiteNotice`, `LessonCard`, `Roadmap`, `CourseSidebar`, `BigO`, `Dashboard`, `Home`, `search.ts`;
  - tests that read lesson content: `lessons.test.ts`, `data-structures/contract.test.ts`, `algorithms/dp/dp.test.ts`, `sql/review3.test.ts`, `lessons/sql/exercises.test.ts`.

**Interfaces:**
- `registry.ts` exports:
  - `lessons: LessonMeta[]`, `getLesson(id): LessonMeta | undefined`, `lessonsIn(category): LessonMeta[]`;
  - `adjacentLessons(id): { prev?: LessonMeta; next?: LessonMeta }`, `lessonPath(lesson)`;
  - `loadLesson(id: string): Promise<Lesson>`.
- `all.testutil.ts` exports:
  - `allLessons: Lesson[]`, eager, in `lessons` order;
  - `fullLesson(id): Lesson`, which throws for unknown ids.

- [ ] **Write `split.test.ts` first:**
  - every `lessons` entry has exactly one content module at `./<category>/<id>.ts`, and every content module has a metadata entry;
  - `lessons` order equals the curriculum's order of live topics;
  - the source of each `src/lessons/meta/*.ts` has no `import` lines other than `import type`;
  - `await loadLesson('bubble-sort')` has its metadata fields and its `quiz`, and calling it twice returns the same promise;
  - `loadLesson('nope')` rejects with "Unknown lesson: nope";
  - a load that rejects is not cached: a second call retries. To test this, inject the loader by exporting `createLessonLoader(metas, importers)` from the registry and testing that directly.
- [ ] Run it; expect failures because the meta modules and `loadLesson` don't exist.
- [ ] **Generate the metadata modules.** A one-off script in the scratchpad, run through a temporary Vitest file, evaluates the current lessons and writes each category's `LessonMeta[]` as a TypeScript literal (single quotes, unquoted keys, registry order) typed `LessonMeta[]`.
- [ ] **Rewrite each lesson file.** Another one-off text transform:
  - delete the top-level properties `id`, `title`, `category`, `difficulty`, `group`, `description`, `keywords`, `prerequisites`, `complexity` and `compareWith` (top-level properties are at two-space indent, and each runs until the next one or `};`);
  - turn `export const X: Lesson = {` into `const content: LessonContent = {`, with `export default content;` at the end;
  - change the type import from `Lesson` to `LessonContent`.

  Fix any imports that become unused, as reported by typecheck.
- [ ] **Registry:** build `lessons` from the three meta arrays. `loadLesson` uses `import.meta.glob<{ default: LessonContent }>(['./{data-structures,algorithms,sql}/*.ts', '!./**/*.test.ts'])`, merges content with its metadata, caches the promise per id, and drops the cache entry on rejection.
- [ ] **Test util and tests:** `allLessons` uses the same glob with `{ eager: true }`. Tests that read content use `allLessons` / `fullLesson` in place of `lessons` / `getLesson`. Tests of order, adjacency and paths keep using the registry.
- [ ] **Components:** type props that come from the registry as `LessonMeta`. `LessonPage` takes the route's metadata, renders `<Suspense>` around a child that calls `use(loadLesson(id))`, and passes the full lesson to the existing page body.
- [ ] `npm run typecheck`, `npm test` (every lesson still checked: the same counts as before plus the new tests), and `npm run lint`; commit.

### Task 3: Lesson page loading state, prefetch, retry

**Files:** `src/pages/LessonPage.tsx`, and a small `LessonLoadBoundary` class in that file, following the `VisualizationBoundary` pattern.

- [ ] **While loading:** show the sidebar plus a header built from metadata (category link, title, difficulty badge), with a muted "Loading lesson…" line where the overview goes. The page is keyed by lesson id, so moving between lessons resets it.
- [ ] **Prefetch:** once the content has rendered, an effect calls `loadLesson(next.id)` (fire and forget, errors ignored).
- [ ] **Load failure:** `LessonLoadBoundary` shows "This lesson couldn't load. Check your connection." and a "Try again" button. Retrying resets the boundary; because rejections are not cached, it re-imports.
- [ ] **Browser check** at desktop and 375px, light and dark:
  - opening a lesson directly, moving with next and previous, and using the sidebar all work;
  - search opens a lesson;
  - with the network offline, a not-yet-loaded lesson shows the retry message, and after going back online "Try again" loads it.
- [ ] Commit.

### Task 4: First-load budget in CI

**Files:** create `scripts/check-bundle.mjs`; modify `package.json` (`"check:bundle": "node scripts/check-bundle.mjs"`) and `.github/workflows/deploy.yml` (run it after `build:pages`).

- [ ] **The script:**
  - reads `dist/index.html`, collects the entry script and its `modulepreload` links (the first-load JavaScript), and sums their sizes;
  - fails if the total is over **600 kB** (target about 470 kB, leaving headroom);
  - fails if any first-load file contains the text of a lesson quiz question (pick a stable one, for example the Bubble Sort lesson's first quiz prompt, read from `src/lessons/algorithms/bubble-sort.ts` at run time).
- [ ] Check that it fails against the `main` build and passes against this branch. Commit.

### Task 5: Verify and ship

- [ ] Measure on the 4× CPU / Fast 4G profile, the same as the baseline: JavaScript transferred and LCP for `/`, `/algorithms/bubble-sort` and `/sql/many-to-many`.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:pages`, `npm run check:bundle`.
- [ ] Update the README ("How to add a lesson") and `CLAUDE.md` for the metadata/content split.
- [ ] Final whole-branch review on Opus; PR; merge.
