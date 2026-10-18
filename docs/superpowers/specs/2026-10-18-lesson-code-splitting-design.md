# Load lesson content on demand

Date: 2026-10-18
Status: design, awaiting review

## Goal

Every page currently downloads every lesson. On the home page that is 1,274 kB of JavaScript, of which 871 kB is all 86 lessons' text, quizzes, code strings and step generators, plus the SQL interpreter. It happens because the search box (on every page) and the home page import `lessons/registry.ts` to read titles and keywords, and that file imports every lesson.

After this change, a page downloads only the lesson metadata it needs. A lesson's content, and the code it runs, download when that lesson is opened.

**Target:** about 470 kB of JavaScript on first load, with nothing visible changing.

## What pages need

Outside the lesson page, the app reads only these fields. These are **metadata**; together they are 56 kB raw, 14 kB gzipped, for all 86 lessons:

| Field | Read by |
|---|---|
| `id`, `title`, `category`, `difficulty`, `group` | sidebar, catalog, cards, roadmap, dashboard, home |
| `description` | lesson cards |
| `keywords` | search |
| `prerequisites` | prerequisite notice |
| `complexity` (rows, space, note, curves) | cards (first row), comparison table, Big O page |
| `compareWith` | comparison table |

Everything else is the lesson's **content**:
- `overview`, `concept`, `howItWorks`;
- `visualization`, with its generators and datasets;
- `code`, `prosCons`, `applications`, `commonMistakes`, `quiz`, `summary`.

## Design

### Metadata lives apart from content

- `LessonMeta` holds the fields in the table above. `LessonContent` holds the rest. `Lesson = LessonMeta & LessonContent`, so components that take a `Lesson` don't change.
- **Metadata modules:** `src/lessons/meta/data-structures.ts`, `algorithms.ts` and `sql.ts` each export a `LessonMeta[]` in learning order. They contain only data and import no generators.
- **Content modules:** each `src/lessons/<category>/<id>.ts` keeps one lesson's content as its default export (`export default { … } satisfies LessonContent`). The metadata fields move out of these files, so nothing is written twice.
- This is a one-time mechanical move, done by a script that runs against the current lessons and is checked by tests. It isn't committed.

### Registry

`src/lessons/registry.ts` keeps its current helpers, but they now work on metadata:
- `lessons: LessonMeta[]`;
- `getLesson(id): LessonMeta | undefined`;
- `lessonsIn(category)`, `adjacentLessons(id)`, `lessonPath(lesson)`.

It adds `loadLesson(id): Promise<Lesson>`:
- it imports the content module through `import.meta.glob('./{data-structures,algorithms,sql}/*.ts')`, which the bundler turns into one chunk per lesson;
- it merges content with metadata, caching the promise per id;
- it rejects for an unknown id, which the route already handles with Not Found.

### Lesson page

- **Loading:** `LessonPage` reads metadata synchronously, so an unknown id still shows Not Found straight away. It then loads the content with React 19's `use(loadLesson(id))` inside a `Suspense` boundary.
- **While loading:** the page shows the lesson's header (title, difficulty, overview placeholder) and the sidebar, so moving between lessons doesn't flash a blank page.
- **Prefetch:** after a lesson renders, the next lesson's content is requested with `loadLesson(next.id)`, which is cached. Pressing "Next" is then usually instant.
- **Load failures** (for example a network drop) show an inline message with a "Try again" button, through the existing error boundary pattern.

### Tests

- A test helper, `allLessons()`, loads every lesson eagerly (`import.meta.glob(…, { eager: true })`). `lessons.test.ts` and the contract tests use it instead of the old eager registry, so they still check every lesson.
- **New tests:**
  - every metadata entry has exactly one content module and the reverse, so nothing is orphaned;
  - metadata order matches the curriculum's learning order;
  - `loadLesson` returns the merged lesson, caches it (the same promise for the same id), and rejects for unknown ids;
  - no module under `src/lessons/meta/` imports a generator, which keeps the metadata light.
- **Bundle check:** a test or build check that fails if the first-load chunk again contains lesson content. For example, a lesson's quiz text appearing in the entry chunk would fail it.

## Expected result

- **Home page:** about 470 kB of JavaScript instead of 1,274 kB. That is the React and Motion runtime (about 400 kB, unchanged) plus 56 kB of metadata.
- **Lesson page:** that plus one lesson's content (typically 5–15 kB) and the generators it uses. The SQL interpreter (about 100 kB) loads only with the first SQL lesson opened.
- The result will be measured on the same throttled profile as before (4× CPU, Fast 4G): JavaScript transferred and LCP for the home page, an algorithm lesson and a SQL lesson.

## Not in this phase

- Re-rendering of the lesson page on each step, and the Motion bundle size. Each will be a separate phase if wanted.
- Prefetching on hover.

## Risks

- **Content modules are imported by path and default export.** A lesson file that keeps a named export, or has the wrong file name, would fail to load. The one-to-one test above catches this.
- **Some tests import single lesson objects by name.** Those imports change to the loader or to `allLessons()`.
