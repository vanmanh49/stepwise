# Performance Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faster first paint on lesson pages, no whole-page re-render per animation step, a home preview that idles when unseen, and the five PR #15 minors.

**Architecture:**
- Startup kicks off `loadLesson` from the URL.
- The live step moves to a Zustand store read only by the "Now running" panel.
- `MiniPlayer` pauses through an `IntersectionObserver` and `visibilitychange`.
- Load errors get their own class.
- The bundle check becomes a tested function.

**Tech Stack:** React 19, Zustand 5, Vitest 5, Node (scripts).

**Spec:** `docs/superpowers/specs/2026-10-18-performance-polish-design.md`

## Global Constraints

- Nothing a learner sees changes, except the clearer error messages and the placeholder's mobile button.
- No new dependencies.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:pages` and `npm run check:bundle` stay clean, with first load under 600 kB.
- Branch `perf/polish`. When built: commit, PR, merge.

## Review Focus

1. **Moving between lessons.** The "Now running" panel of the new lesson must not show the previous lesson's step. Covered in Task 2: the store resets on mount, checked in the browser.
2. **Early loading.** It must never request a lesson for a non-lesson path, or for a lesson URL in the wrong category, because that would download the wrong chunk. Covered in Task 1.
3. **The home preview after the visitor pauses it**, then scrolls away and back. It must stay paused. Covered in Task 3 in the browser.
4. **A render error inside a lesson** must show the generic message, not the download message. Covered in Task 4 by unit-testing the error class, plus the throwaway browser check.
5. **The bundle check's own guards.** It must fail, not pass, when it can't find what it should check. Covered in Task 5.

---

### Task 1: Load the lesson at startup

**Files:** `src/lessons/registry.ts`, `src/main.tsx`, test `src/lessons/split.test.ts`.

**Produces:** `lessonIdFromPath(pathname: string, base: string): string | undefined`

- [x] **Tests** (`base` is `/stepwise/` unless stated):
  - `/stepwise/algorithms/bubble-sort` gives `bubble-sort`;
  - with base `/`, `/sql/ctes` gives `ctes`;
  - each of these gives `undefined`:
    - `/stepwise/` and `/stepwise/algorithms` (not lessons);
    - `/stepwise/algorithms/array` (wrong category);
    - `/stepwise/algorithms/nope` (unknown id);
    - `/stepwise/algorithms/bubble-sort/extra` and `/stepwise/algorithms/bubble-sort/` (extra or trailing segment);
    - `/other/algorithms/bubble-sort` (different base).
- [x] Run them; expect a failure because the function isn't exported.
- [x] Implement it. In `main.tsx`, before rendering: `const id = lessonIdFromPath(location.pathname, import.meta.env.BASE_URL); if (id) loadLesson(id).catch(() => {});`.
- [x] Run the tests, typecheck and lint; commit.

### Task 2: Live step store and memoized code colouring

**Files:**
- create `src/store/liveStep.ts` and `src/store/liveStep.test.ts`;
- modify `src/pages/LessonPage.tsx` and `src/components/code/CodePanel.tsx`.

**Produces:**
- `type LiveStep = { step: Step; index: number; total: number }`
- `useLiveStep`, a Zustand store `{ live?: LiveStep; set(live?: LiveStep): void }`

- [x] **Tests:** the store starts empty; `set` stores the value; `set(undefined)` clears it.
- [x] Run; expect a failure because the module is missing.
- [x] **Implement the store.** In `LessonPage`:
  - remove the `live` state;
  - `onStep` calls `useLiveStep.getState().set(...)`, a stable function, so nothing re-renders;
  - clear it when the lesson unmounts (not on mount, because the child visualization has already reported step 0 by then);
  - `ContextPanel`'s live part becomes a small `NowRunning` component that reads `useLiveStep((s) => s.live)`.
- [x] **`CodePanel`:** `const tinted = useMemo(() => code.split('\n').map(tint), [code])`.
- [x] Run the tests, typecheck and lint. In the browser, "Now running" updates while playing, and after moving to another lesson it shows that lesson's "Step 1 / N", never the previous lesson's step. Commit.

### Task 3: Pause the home preview when unseen

**Files:** `src/components/visualization/MiniPlayer.tsx`.

- [x] **Track three conditions:**
  - `visible`, from an `IntersectionObserver` on the section (threshold 0);
  - `hidden`, from `document.visibilityState`;
  - `userPaused`, set when the button pauses and cleared when it plays.
- [x] **Act on them:**
  - when not visible or hidden, pause;
  - when visible again, the tab is shown, `!userPaused` and not reduced motion, play.
- [x] **Browser check:**
  - the step counter stops while scrolled away and advances again when back;
  - a preview paused with the button stays paused after scrolling away and back;
  - reduced motion still starts paused.
- [x] Commit.

### Task 4: Load errors, placeholder, naming, wording

**Files:** `src/lessons/registry.ts`, `src/pages/LessonPage.tsx`, test `src/lessons/split.test.ts`.

**Produces:** `class LessonLoadError extends Error` (exported from the registry); `cause` is the importer's error.

- [x] **Tests:**
  - an importer failure rejects with a `LessonLoadError` whose `cause` is the original error;
  - an unknown id rejects with a plain `Error`, not a `LessonLoadError`;
  - a failed load still returns the same promise on the next call.
- [x] Run; expect a failure because the class doesn't exist.
- [x] **Implement:**
  - wrap importer rejections;
  - `LessonLoadBoundary` stores whether the error is a `LessonLoadError` and picks the message: "This lesson couldn't be downloaded." with "Try again", or "Something went wrong while showing this lesson." with "Reload page";
  - add the mobile "Lessons" button and drawer to `LessonPlaceholder`, and `role="status"` on "Loading lesson…";
  - rename the component `LessonContent` to `LessonBody`.
- [x] **Browser check:**
  - offline shows the new message;
  - in a throwaway local build with a lesson that throws during render, not committed, the generic message shows;
  - at 375 px the placeholder's "Lessons" button opens the drawer.
- [x] Commit.

### Task 5: Bundle check guards

**Files:** `scripts/check-bundle.mjs`; create `scripts/check-bundle.test.ts`; modify `vite.config.ts` (`test.include` adds `scripts/**/*.test.ts`).

**Produces:**
- `export function checkBundle(dist: string, marker: string, budgetKb = 600): { files: { file: string; size: number }[]; total: number; problems: string[] }`
- the CLI part runs only when the file is executed directly.

- [x] **Tests**, each with a temporary fixture `dist`: an `index.html` plus `assets/*.js`.
  - Passing cases:
    - under budget with the marker only in a lesson chunk passes;
    - `src` before `type` in the entry tag still finds the entry.
  - Failing cases, each with a problem message:
    - over budget;
    - the marker in a first-load file;
    - no entry script;
    - two entry scripts;
    - the marker in no asset at all.
- [x] Run; expect a failure because `checkBundle` isn't exported.
- [x] Implement it, then run the tests; `npm run check:bundle` on the real build still passes. Commit.

### Task 6: Verify and ship

- [x] Measure lesson-page LCP and scripting time per step, before (`main`) and after, as the spec describes.
- [x] Run all checks, then the final whole-branch review on Opus. Then PR and merge.
