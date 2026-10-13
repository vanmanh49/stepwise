# Stepwise

An interactive platform for learning data structures and algorithms by watching them run.

Every lesson has a visualization you control: play, pause, step forward and back, change the speed, and run it on your own data. Each step explains what happened and why, and highlights the line of code responsible.

## Features

- **29 interactive lessons**
  - Data structures: Array, String, Linked List, Stack, Queue, Binary Tree, Binary Search Tree, Heap, Priority Queue, Graph
  - Algorithms: Linear Search, Binary Search, Bubble Sort, Selection Sort, Insertion Sort, Two Pointers, Sliding Window, Prefix Sum, Merge Sort, Quick Sort, Heap Sort, BFS, DFS, Topological Sort, Tree Traversal, Dijkstra, Bellman-Ford, Kruskal, Prim
- **One visualization engine** for all of them: play, pause, next, previous, restart, 0.5x–2x speed, timeline scrubber, keyboard control (Space, ←, →)
- **Code and visualization in sync**: the running line is highlighted on every step
- **Your own data**: custom arrays, random data, operations on structures you build up, a choice of example graphs and start nodes
- **Quizzes** in four styles (multiple choice, complexity, code, predict the next step) with explanations and retry
- **Big O explorer**: toggle curves, change the input size, read exact operation counts, compare the course's algorithms
- **Progress tracking**: completed lessons, quiz scores, current lesson and a daily streak, saved in LocalStorage
- **Roadmap and full curriculum**: about 60 planned topics, shown as "Coming soon" until their lesson is written
- **Global search** with Ctrl+K (Cmd+K on macOS)
- **Light and dark themes**, responsive layout, reduced-motion support, and state cues that do not rely on colour

## Tech stack

React 19, TypeScript (strict), Vite, Tailwind CSS v4, React Router, Motion, Lucide icons, Zustand, Vitest.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL that Vite prints (normally http://localhost:5173).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check, then build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests once |
| `npm run typecheck` | Type-check without building |
| `npm run build:pages` | Build for GitHub Pages under `/stepwise/` |

The app uses client-side routing. When deploying the `dist/` folder, configure the host to serve `index.html` for unknown paths.

### Publishing to GitHub Pages

The site is served from the `gh-pages` branch at https://vanmanh49.github.io/stepwise/.

`npm run build:pages` builds with the `/stepwise/` base path and copies `index.html` to `404.html`, which is how GitHub Pages serves deep links such as `/stepwise/algorithms/bfs`. To publish a new version, run it and push the contents of `dist/` to the `gh-pages` branch. If the repository is renamed, change the base path in the `build:pages` script.

## Architecture

```
src/
  types/             Step, View, Lesson and related types
  engine/            playerReducer (pure) and the usePlayer hook
  algorithms/        pure algorithms and their step generators
    sorting/  searching/  graph/
  data-structures/   step generators for structure operations
  lessons/           one data file per lesson, the registry and the curriculum
  store/             progress and theme state
  utils/             input parsing
  components/
    visualization/   Visualizer, controls, explanation, legend, renderers, inputs
    code/            CodePanel
    lesson/  quiz/  navigation/  progress/  bigo/  layout/
  pages/             Home, Catalog, LessonPage, Dashboard, BigO, NotFound
```

Rules the code follows:

- `algorithms/` and `data-structures/` contain no React. They only produce data.
- Lesson text lives in `lessons/`, never in components.
- Components read colours from CSS variables in `src/index.css`, so both themes work everywhere.

## Visualization architecture

```
generator(input)  →  Step[]  →  usePlayer(steps)  →  <Visualizer>  →  renderer for step.view.kind
```

1. **Generator.** A pure function runs the algorithm and records a `Step` at each meaningful moment.
2. **Step.** A snapshot plus its explanation:

   ```ts
   interface Step {
     title: string;      // what happened
     why: string;        // why it happened
     next?: string;      // what happens next
     codeLine?: number;  // 1-based line in the lesson's code
     variables?: Record<string, string | number>;
     view: View;         // what to draw
   }
   ```

3. **View.** A discriminated union: `array`, `linked-list`, `stack`, `queue`, `tree`, `heap`, `graph`. Every element has a `role` such as `compare`, `swap`, `sorted` or `visited`.
4. **Player.** `usePlayer` wraps a pure reducer that owns the current index, play state and speed.
5. **Visualizer.** One shell for every lesson: stage, legend, controls, timeline, explanation and code panel.
6. **Renderers.** `StepView` picks one renderer per view kind. Role colours, border cues and marks are defined once in `components/visualization/roles.ts`.

Elements carry stable ids, so when a value changes position between two steps the renderer animates it to its new place.

## How to add a lesson

A lesson needs a generator and a data file.

1. Write the generator (see the next two sections).
2. Create `src/lessons/<category>/<id>.ts` exporting a `Lesson` object. Copy an existing lesson as a starting point. Fill in the text, complexity, quiz and a `visualization` config:

   | `kind` | Use for | Provides |
   |---|---|---|
   | `sort` | algorithms over a number list | data field, Random, Reset |
   | `search` | list plus target | data and target fields; sorts the input when `needsSorted` is true |
   | `structure` | data structures | one button per operation; contents persist between operations |
   | `text` | structures holding text | a text field plus one button per operation |
   | `graph` | graph algorithms | example-graph and start-node pickers |

3. Register it in `src/lessons/registry.ts` by adding it to the `lessons` array, in learning order.
4. Make sure a topic with the same `id` exists in `src/lessons/curriculum.ts`. Planned topics are already listed there; registering a lesson turns "Coming soon" into a link.

Run `npm test`. `lessons.test.ts` checks every registered lesson: references resolve, the quiz is valid, the default visualization runs, and every `codeLine` points inside the lesson's code.

## How to add an algorithm

1. Create a file under `src/algorithms/<group>/`.
2. Export three things:
   - the code shown to learners, as a string: `export const fooCode = \`...\``
   - the pure algorithm: `export function foo(input) { ... }`
   - the step generator: `export function fooSteps(input): Step[] { ... }`
3. In the generator, push a `Step` for each comparison, move or decision. Set `codeLine` to the matching line of `fooCode`, and write `title` and `why` in plain language with the actual values.
4. Add tests next to it. Test the pure function against a trusted reference, and test that the last step shows the final result.

Helpers worth reusing: `toCells`, `arrayView` and `swapCells` in `algorithms/sorting/cells.ts`, and `graphView` and `neighbours` in `algorithms/graph/view.ts`.

For a data structure, export a `StructureDef` from `src/data-structures/`: an initial state, a `view(state)` function, the code, and a list of operations. Each operation's `run(state, args)` returns `{ steps, state }` and must not mutate its input.

## How to add a visualization

If an existing view kind fits, there is nothing to do: return that view from your generator.

For a new kind of picture:

1. Add an interface to `src/types/visualization.ts` and include it in the `View` union.
2. Write a renderer in `src/components/visualization/renderers/`.
3. Add a `case` for it in `renderers/index.tsx`, and in `rolesInView` in `roles.ts` so the legend knows which roles it uses.

TypeScript reports every place that must handle the new kind. The engine, controls, timeline, explanation panel and code sync need no changes.

## How progress tracking works

`src/store/progress.ts` is a Zustand store persisted to LocalStorage under the key `dsa-progress`. It holds:

- `completed`: ids of completed lessons
- `quizScores`: best score per lesson
- `currentLesson`: the last lesson opened
- `activeDays`: dates on which a lesson was opened, used to compute the streak

A lesson is completed with the "Mark as complete" button or by a perfect quiz score. Stored data is validated when loaded, so corrupted or outdated data falls back to empty progress.

Components only use the store's selectors and actions (`markComplete`, `recordQuiz`, `visit`, `reset`). To move progress to a backend, replace the persistence inside this one file.

The theme is stored separately under `dsa-theme`.

## Testing

```bash
npm test
```

Unit tests cover:

- every algorithm: empty, single element, normal, duplicates, negatives, sorted, reversed and large inputs
- step generation: final state is correct, element identity is preserved, code lines are valid, step counts stay bounded
- data structure operations, including invalid ones (empty, full, out of range, missing value)
- the player reducer, input parsing, tree layout, search ranking, Big O maths and the progress store
- every registered lesson's content

Tests run in Node without a browser. Component behaviour is checked manually in the browser.
