# Performance polish

Date: 2026-10-18
Status: approved ("plan and start implement for remaining performance work")

## Goal

Finish the performance work from the review on 2026-10-18 (PRs #14 and #15):

1. **Lesson pages show content sooner.** After code splitting, a lesson opened directly waits for three downloads one after another: the entry chunk, the lesson-page code, then the lesson's content. Its first paint stayed at about 1.4 s on the throttled profile (4× CPU, Fast 4G).
2. **Each animation step re-renders only what changes.** Today, every step re-renders the whole lesson page: sidebar, all text sections, a second code panel, the Big O chart and the quiz.
3. **The home preview stops working when nobody can see it**, whether it is scrolled away or the tab is hidden.
4. **The five minor issues deferred in PR #15 are fixed.**

## Changes

### 1. Start loading the lesson at startup

- `src/main.tsx` reads the address before rendering. If it is a lesson path (`<base><category>/<id>`) with a known id, it calls `loadLesson(id)` and ignores errors. The content download then runs alongside the lesson-page code instead of after it.
- The parsing is a pure helper, `lessonIdFromPath(pathname, base)` in `src/lessons/registry.ts`. It returns the id when the path is `<base><category>/<id>` with a registered id in that category, and `undefined` otherwise. That includes the wrong category, extra segments, a trailing slash after the id, and non-lesson pages.

### 2. Keep the live step out of the lesson page's state

- `LessonPage` keeps the current step (shown in the right-hand "Now running" panel) in its own `useState`, so every step re-renders the whole page. Instead, the step goes into a tiny store, `src/store/liveStep.ts`. It has the shape `{ step, index, total } | undefined`, with `setLiveStep` and `useLiveStep`, built on Zustand like the other stores.
- Only the "Now running" panel subscribes to the store. The store is reset when a lesson mounts, so a new lesson never shows the previous lesson's step.
- `CodePanel` colours its lines once per code string (`useMemo`) instead of on every render.

### 3. Pause the home preview when it can't be seen

- `MiniPlayer` pauses its autoplay while it is out of view (an `IntersectionObserver` on its card) or while the tab is hidden (`visibilitychange`), and resumes when it is visible again.
- It never resumes a preview the visitor paused with the button. Reduced-motion visitors keep a paused preview, as today.

### 4. The five minors from PR #15

1. **Load errors are told apart from other errors.** Importer failures are wrapped in `LessonLoadError`, which keeps the original as its `cause`.
   - For a `LessonLoadError`, `LessonLoadBoundary` shows "This lesson couldn't be downloaded." with "Try again" (reload).
   - Any other error shows "Something went wrong while showing this lesson." with a "Reload page" button.
2. **`check-bundle.mjs` can no longer pass without checking anything.**
   - It fails unless it finds exactly one entry `<script type="module">`, whatever the order of its attributes.
   - It fails unless the marker text appears in at least one file in `dist/assets/*.js`, which proves the content was built and the marker is spelled the way the build writes it.
   - The checks move into an exported function, `checkBundle(dist, marker)`, tested from `scripts/check-bundle.test.ts`. Vitest's include gains `scripts/**/*.test.ts`.
3. **The loading and failed states match the loaded page on phones.**
   - The placeholder gets the same mobile "Lessons" button and drawer as the loaded page, so the header doesn't shift when content arrives.
   - "Loading lesson…" gets `role="status"`.
4. **The lesson-page component `LessonContent` is renamed `LessonBody`**, so it no longer shares a name with the type.
5. **The failure message no longer blames the connection.** It now reads "This lesson couldn't be downloaded." This also covers a failed prefetch that is opened later, when the visitor is back online.

## Measurements

These run on the production build with the throttled profile, before and after the change:
- **Lesson-page LCP** for `/algorithms/bubble-sort` and `/sql/many-to-many`, median of 3.
- **Scripting time per step:** Chrome's `ScriptDuration` metric (DevTools protocol) summed over 20 "Next step" clicks on `/algorithms/bubble-sort` and `/sql/many-to-many`, divided by 20.
- **The home preview off-screen:** the step counter must stop advancing while the preview is scrolled away, and run again when it is back in view.

## Testing

- **Unit tests:**
  - `lessonIdFromPath`: a lesson path, the base path, the wrong category, an unknown id, extra segments, a trailing slash, and the dev base `/`;
  - the `liveStep` store: set, read and reset;
  - `LessonLoadError`: importer failures are wrapped with the original as `cause`, and an unknown id is a plain `Error`;
  - `checkBundle` against fixture `dist` folders: under budget passes; over budget fails; lesson text in the first load fails; no entry script fails; two entry scripts fail; a marker missing from every asset fails; the entry's attributes in either order work.
- **Browser** (no DOM test setup, as in earlier phases), at desktop and 375 px, in light and dark:
  - "Now running" updates;
  - a new lesson starts with "Press play to begin";
  - the placeholder's mobile "Lessons" button works;
  - offline shows the new message;
  - a deliberately broken lesson shows the generic error, checked in a throwaway local build only;
  - the home preview pauses off-screen.

## Not in this phase

- The Motion library's lazy-loading mode (`LazyMotion`). The renderers rely on layout animations, and the expected saving (about 25–30 kB gzipped) is small.
- The minor items deferred in PR #14:
  - the benchmark's module-getter warning;
  - asserting that `scriptSteps` succeeds before timing it;
  - `readonly` typing for the arrays the engine caches;
  - a direct test of a correlated subquery that repeats the outer column's name.
