# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Stepwise is a static React app that teaches data structures, algorithms, SQL, microservices, Kubernetes, AI and security with step-by-step visualizations. It has no backend; progress is saved in LocalStorage. The live site is https://vanmanh49.github.io/stepwise/.

## Commands

```bash
npm run dev                              # Vite dev server
npm test                                 # whole Vitest suite (src/**/*.test.{ts,tsx}, scripts/**/*.test.ts), about 4,900 tests
npx vitest run src/sql/parse.test.ts     # one file
npx vitest run -t "rotates left"         # tests whose name matches
npm run typecheck                        # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run lint                             # oxlint --deny-warnings (config: .oxlintrc.json)
npm run bench                            # SQL engine timings (src/sql/*.bench.ts, Vitest bench fixture)
npm run train:ai                         # retrain the tiny AI model and rewrite src/ai/weights.ts (seeded; ~45 s)
npm run build                            # typecheck + production build
npm run build:pages                      # build under /stepwise/ with a page per address, and copy index.html to 404.html
```

CI runs `npm run lint`, `npm test`, `build:pages` and then `check:bundle`, on every pull request (`.github/workflows/ci.yml`) and again before each deploy from `main`. The linter is Oxlint rather than ESLint because typescript-eslint does not support TypeScript 7. Its `correctness` and `suspicious` categories are errors, plus the React hooks rules. A few rules are switched off in `.oxlintrc.json` because they don't fit this code (the automatic JSX runtime, narrowing `{ok}` results inside tests, helpers kept next to their only caller). For a deliberate exception, use `// oxlint-disable-next-line <rule> -- <reason>`.

Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`), and a failing test blocks the deploy.

## Architecture

The core pipeline is `generator(input) → Step[] → usePlayer(steps) → <Visualizer> → renderer for step.view.kind`.

- **Steps are data.** Each `Step` (`src/types/visualization.ts`) carries a `title`, a `why`, an optional `next`, a 1-based `codeLine` into the lesson's code string, `variables`, and a complete `View` snapshot. The player (`src/engine/`) is a pure reducer that only moves an index. The renderer for a view kind can therefore draw any step on its own.
- **`View` is a discriminated union** of 18 kinds, including `array`, `tree`, `heap`, `graph`, `table`, `grid` (cells may carry `heat` 0–1; a grid with text longer than 6 characters and no arrows renders as a wrapping table, `isTextGrid`), `panels`, `buckets`, `btree`, `trie`, `calls`, `sessions`, `services`, `cluster` and `distribution` (probability bars with an optional cut-off and target). Every element has a `Role`. Role colours, border cues, marks and legend labels are defined only in `components/visualization/roles.ts`, and `rolesInView` there must handle every view kind. Elements keep stable ids across steps, so renderers can animate a value as it moves.
- **Lessons are data**, in two parts, so pages can list lessons without downloading their content:
  - **Metadata** (`LessonMeta`: title, keywords, complexity…) lives in `src/lessons/meta/<category>.ts`, in learning order, and `lessonList.ts` joins them. These modules import only types, so the build can read them too.
  - **Content** (`LessonContent`: text, visualization, code, quiz) is the default export of `src/lessons/<category>/<id>.ts`, and the file name is the id.
  - `registry.ts` serves metadata synchronously (`lessons`, `getLesson`, `lessonsIn`, `adjacentLessons`). `loadLesson(id)` imports the content through `import.meta.glob`, which gives one chunk per lesson. `LessonPage` suspends on it.
  - Tests that need content use `allLessons` / `fullLesson` from `lessons/all.testutil.ts`.
  - `main.tsx` starts `loadLesson` from the address (`lessonIdFromPath`) so a lesson opened directly downloads its content alongside the lesson page's code. A failed download rejects with `LessonLoadError`; the page's boundary tells it apart from render errors, and retrying reloads the page (browsers won't refetch a failed chunk).
  - The visualization's current step goes to `store/liveStep.ts`, read only by the "Now running" panel, so a step doesn't re-render the whole lesson page.
  - Every address gets its own HTML file at build time (`scripts/static-pages.ts`, run by the plugin in `vite.config.ts`): the built `index.html` with that page's title, description and canonical link, plus `sitemap.xml`. Without them GitHub Pages answers deep links with its 404 page, which search engines skip. Pages load with a trailing slash, so `lessonIdFromPath` accepts one.
  - `AppShell` wraps the route in `Suspense` and `RouteBoundary`, so a page whose code can't be fetched (a tab left open across a deploy) offers a reload and keeps the header. The boundary is keyed by address, so moving away clears the failure.
  - The home page's preview (`MiniPlayer`) is lazy, which keeps every renderer and Motion out of the first load.
  - `npm run check:bundle` (run in CI) fails if the first-load JavaScript passes 600 kB or contains lesson text.
  - `labels.ts` holds the tracks: `CATEGORY_TITLE`, `CATEGORY_INTRO` and `CATEGORIES`. Routes, the header and the progress bars are generated from `CATEGORIES`, so a new track starts with an entry there.
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
- **Microservices** (`src/microservices/`) is a seeded discrete-event simulator:
  - `simulate(scenario)` runs nodes (client, gateway, registry, balancer, service, db, broker, relay, sidecar), links with latencies, timed requests and faults over simulated milliseconds; events are ordered by `(time, sequence)`, and faults scheduled for a time apply before anything else at that time;
  - node behaviours are per-run factories (`sim.ts` for client, service and db; `behaviours.ts` for gateway (with its rate limiter), registry and balancer; `broker.ts` for the message broker, which stores, delivers and redelivers in `queue` or `topic` mode; `relay.ts` for the outbox relay; `sidecar.ts` for mesh proxies with a call policy and optional mTLS);
  - db nodes hold records that calls read, write, delete, add to or append to (an event store replays events since its latest snapshot); a sequential service can compensate finished calls newest first (sagas); deploys, weight shifts, route changes and error rates are scheduled as faults, and a balancer can split by version weights and roll a canary back;
  - call policies (`resilience.ts`, `createCaller`) wrap client requests and service calls: bulkhead → breaker → send with timeout, then retries with backoff and equal jitter; a call without a policy is a plain send;
  - a run ends once every request is done, every stored message is acked, no outbox record is left, and nothing is still on the wire, so late answers show up as wasted work;
  - `traceSteps` (`steps.ts`) replays the trace into steps with a `services` view, folding arrivals and merging heartbeat rounds, capped at `MAX_STEPS = 200` plus one summary step; `StepOptions.extend` adds extra view data, such as the trace waterfall from `spansOf` (`tracing.ts`);
  - each lesson has a scenario module in `scenarios/` (`fooCode`, `fooScenario`, `fooSteps`) used by a `form` visualization with `codeLabel: 'Pseudocode'`;
  - `ServicesRenderer` picks columns or rows from the measured stage width (`chooseOrientation` in `servicesLayout.ts`).
- **Kubernetes** (`src/kubernetes/`) is a seeded reconciliation simulator, in simulated seconds:
  - `Store` (`store.ts`) stands in for the API server and etcd: versioned objects (Node, Pod, ReplicaSet, Deployment, Service, Endpoints, HorizontalPodAutoscaler, PodDisruptionBudget, and from phase 3 ConfigMap, Secret, StorageClass, PersistentVolume(Claim), StatefulSet, DaemonSet, Job, CronJob, Ingress, NetworkPolicy, CustomResourceDefinition and the example custom kind Database); it clones on every read and write, refuses writes while etcd is down, and validates (Job `restartPolicy: Always`, a Database without its CRD);
  - controllers (`controllers/`) are pure, level-triggered `(ctx) → Change[]` functions: ReplicaSet (deletes before creates), Deployment (rolling updates bounded by maxSurge / maxUnavailable from ReplicaSet sizes; `withImage` / `rolledBack`), scheduler (filter → score with kube-scheduler's reasons and a per-node breakdown; LeastAllocated or MostAllocated), Endpoints, HPA (`hpa.ts`, 30 s stabilisation); `autoscaler.ts` (Cluster Autoscaler over a node pool), `kubelet.ts` (pull, start, ready, exit, CrashLoopBackOff back-off, probes from `probes.ts`), `metrics.ts` (traffic share, CPU throttle, memory, OOMKill, node-pressure eviction), `evict.ts` (eviction API with PDBs, drain, NoExecute) and `nodes.ts` (heartbeats, NotReady, Lost, eviction) work through `env.ts`;
  - phase 3 adds controllers `volumes.ts` (PV binding, provisioning, reclaim, attach/detach; env-based, like the Job controller `job.ts`), `statefulset.ts`, `daemonset.ts`, `cronjob.ts` (a 10 s tick) and `operator.ts` (runs only while a `db-operator` pod is ready); `config.ts` (env frozen at start, mounted ConfigMaps refreshed on a 10 s sync), `storage.ts` (data records on volumes), and pure `ingress.ts` / `network.ts` used by the simulator's request routing; pods carry `ownerKind` (absent = ReplicaSet), and `RuleTable` draws the step's Ingress or NetworkPolicy rules;
  - phase 2 fields are optional and absent ones keep phase 1 behaviour; CPU is millicores (`cpuRequestM` falls back to phase 1 cores); periodic work (heartbeats, node checks, metrics, HPA, autoscaler, probes) never keeps a run alive, so scenarios with it set `runToEnd`, and such runs end with a summary from `SimResult.final`;
  - `simulate(scenario)` runs kubectl actions and faults (faults first at equal times), fans each accepted write out to the watching groups after a 1 s watch delay (one pending run per group), and returns one frame per event with a full snapshot; a downed component's groups catch up in one pass when it returns; a "nothing to do" note isn't repeated until something it names changes;
  - `traceSteps` (`steps.ts`) merges same-second events of one kind, actor and owner (ReplicaSet or node) into one step, hides no-op notes unless `noops`, and ends long or cut-off runs with a summary, capped at `MAX_STEPS = 200` plus one; `view.ts` builds the `cluster` view;
  - scenarios live in `scenarios/` (`fooCode`, `fooScenario`, `fooSteps`), the same contract as Microservices; `ClusterRenderer` is plain HTML (node boxes wrap in a CSS grid).
- **AI** (`src/ai/`) is a tiny transparent language model, no React:
  - `corpus.ts` (30 toy sentences, a 34-token word vocabulary ending in `<end>`), `bpe.ts` (real byte-pair encoding over characters; `▁` marks a word start and a pair never merges onto it), `tensor.ts` (plain `Vec`/`Mat` helpers), `autograd.ts` (scalar `Value`, used only by training and tests);
  - `model.ts`: 1 layer, 1 head, d = 8, MLP 16, context 6, layer norm without gain or bias, tied embeddings (`tokenEmbed` also scores the next token). `forward(tokens)` returns every intermediate per position; its per-position tail is `attend` + `positionOut`, shared with the KV cache;
  - `weights.ts` is generated by `npm run train:ai` (`scripts/train-ai-model.test.ts`, skipped unless `AI_TRAIN=1`; Adam, seed 7, with a parity check against `forward`) and committed; reruns write the same bytes;
  - `sample.ts` (temperature → top-k → top-p → renormalise, seeded `draw`), `bigram.ts` (the live trainer, closed-form gradient p − one-hot), `steps.ts` (`readPrompt`, `distributionView`, which always shows the target bar, `vectorGrid`, `matrixGrid`, `fmt`, `EMPTY`, `MAX_STEPS = 200`);
  - phase 2 (Building with LLMs): `kvcache.ts` (`extend` computes one position against cached K/V; tested equal to `forward`), `constrain.ts` (two sentence schemas; constrained decoding cuts disallowed words and renormalises), `vectors.ts` (dense = mean of non-filler `tokenEmbed` rows, TF-IDF over the corpus; `search(ids, k, kind)`; the dense vectors deliberately fail on verb queries), `standin.ts` (a rule-based stand-in chat model: chat template `render`, RAG answers with citations, toy tools `get_weather`/`add` with `checkArgs`/`runTool`; rules read each message's choice `key`, never its text); `scenarios/rag.ts` exports `runRag`, which Evals reuses; `steps.ts` adds `messageGrid` and `resultsGrid`;
  - phase 3 (AI Agents) lives in `agents/`: `office.ts` (notes + outbox state, 8 tools with schemas, `RISKY` = send_email and delete_note, a poisoned `travel-tips` note), `tasks.ts` (6 fixed tasks: goals as fixed tool calls, an answer, a guess, requirements with an `email` or `answer` stage, an allowlist), `policy.ts` (`decide`: the rule-based stand-in, reading structured `outcomes`, never text; quirks `answers-early`, `skips-step`, `wrong-unit`, `trusts-tool-output` are labelled simulated flaws), `loop.ts` (`runAgent` records every event and the office after it: memory `chat` (24-word budget) or `notes` (keyword recall), planner with plan checks, a two-stage critic, `spotlight`/`allowlist` guards, approvals, MCP transport), `mcp.ts` (stateless 2026-07-28 JSON-RPC: `server/discover`, `tools/list`, `tools/call`; -32601 unknown method, -32602 unknown tool/bad args/missing version, `isError` tool failures), `team.ts` (orchestrator + researcher + writer), `view.ts` (`eventSteps` turns a run into steps with Trace and Office panels, plus an optional lesson panel);
  - scenarios live in `scenarios/` (`fooCode`, `fooSteps`), used by `form` visualizations with `codeLabel: 'Pseudocode'`; decimal knobs are `choice` fields, and stand-in inputs (questions, requests, messages) are `choice` fields too.
- **Security** (`src/security/`) is teaching crypto, no React. Nothing reads the clock or `Math.random`, so runs repeat exactly:
  - `crypto/` holds pure functions on `Uint8Array`: `bytes.ts`, `sha256.ts` (`traceBlock` for the rounds, `resume` for length extension), `hmac.ts` (HMAC, HKDF), `aes.ts` (AES-128 encryption with `traceBlock`; no block decryption, since no lesson needs it), `modes.ts` (ECB, CBC, CTR, GCM with GHASH on BigInt), `numbers.ts` (`modPow`, extended Euclid, the Diffie-Hellman `GROUPS`), `rsa.ts` (small-number RSA; moduli stay below 2^20, so plain `number`s are exact), `tls.ts` (`runHandshake(attack)`: a shortened TLS 1.3 that returns events; certificates are plain objects, one HKDF step, one key for both directions);
  - `steps.ts` holds `MAX_STEPS = 200`, `EMPTY`, `readBytes` (text limits counted in bytes) and the view builders: `byteGrid` (rows of 6, the most a 375 px stage shows without scrolling), `stateGrid`, `imageGrid` (6×6), `compareDigests`, and `partiesView` (`panels` with a `services` view, whose nodes may be of type `attacker`, and a "who knows what" grid);
  - scenarios live in `scenarios/` (`fooCode`, `fooSteps`), used by `form` visualizations with `codeLabel: 'Pseudocode'`. Phases 2 and 3 will add a simulated web app and reuse `crypto/`.
- `seeded` (mulberry32) and `EventQueue` live in `src/utils/` and are shared by the simulators and the AI model.
- `algorithms/`, `data-structures/`, `sql/`, `microservices/`, `kubernetes/`, `ai/` and `security/` contain no React. All lesson text lives in `lessons/`, not in components. Colours come from CSS variables in `src/index.css`, defined for both `:root` and `.dark`.
- **Shared UI controls** live in `src/components/ui/`:
  - `Field` (label, help or error text, and the id and aria wiring, shared with its control through context), `FieldGrid`, `FormMessage`;
  - `Select`, `TextField`, `TextArea` (Ctrl/⌘+Enter via `onRunShortcut`), `Slider`;
  - `Button`, `IconButton`, `RunButton`, `ButtonLink` (a router link styled as a button), `PresetRow` ("Try:" chips), `SegmentedControl` (one choice), `ToggleChip` (on/off).

  Components use these instead of raw `<select>`/`<input>`/`<textarea>` or `btn`/`field` class strings. The `.btn`, `.field` and `select.field` styles in `src/index.css` are their only styling.
- Progress (`store/progress.ts`, key `dsa-progress`) runs stored data through `sanitizeProgress` on load, and reloads on another tab's `storage` event because every save writes the whole state. A failed save (full storage) is ignored, so progress lasts that session. The theme is stored as `dsa-theme` and applied in `index.html` before first paint.

## Tests that guard the whole codebase

- `src/lessons/lessons.test.ts` runs every registered lesson. It checks that references resolve, quizzes are valid, the default visualization runs, and every `codeLine` points inside the lesson's code. For SQL lessons it also checks that each example runs and each exercise's solution passes its own check.
- `src/data-structures/contract.test.ts` runs random operations against every structure lesson. It checks that no operation mutates its input, every operation yields at least one step, and every step's code line is valid. Seeded randomness comes from `random.testutil.ts`.
- SQL differential tests (`differential*.test.ts`, `scriptDifferential*.test.ts`) run query corpora (`*Corpus*.testutil.ts`) through both the interpreter and real SQLite via `sql.js`. New SQL features add their queries to a corpus. `sql.js` is a dev dependency and is never bundled.
- `src/microservices/contract.test.ts` runs every microservices lesson with random and garbage settings. It checks that every run ends with every request and delivery finished, stays within `MAX_STEPS + 1` steps, has valid code lines and view references, and repeats exactly. Each scenario's teaching moment is tested in `microservices/scenarios/*.test.ts`.
- `src/kubernetes/contract.test.ts` does the same for every Kubernetes lesson: runs end within `MAX_STEPS + 1` steps, pod names and object rows are unique in every view, requests all finish, code lines are valid, and runs repeat exactly. Number fields' ranges go in its `RANGES`.
- `src/ai/contract.test.ts` runs every AI lesson with random and garbage settings: runs stay within `MAX_STEPS`, code lines are valid, distribution bar ids are unique, heat stays in 0–1, garbage in a number or choice field gives one refusal step, and runs repeat exactly. Number fields' ranges go in its `RANGES`.
- `src/security/contract.test.ts` runs every Security lesson the same way, and checks that each lesson's last `concept` paragraph names what production systems use. `src/security/crypto/differential.test.ts` runs seeded inputs through our crypto and Node's `crypto` (`node:crypto` is imported only in tests and never bundled).
- Look up code lines with `lineOf(code, snippet)` (`data-structures/shared.ts`) rather than hard-coding numbers. It throws if the snippet is missing.
- Vitest's on-disk cache (`node_modules/.vitest-cache`) can keep a stale `import.meta.glob` after a new lesson file is added, which shows up as "No content module for <id>". Delete the folder and run again.
- `components/visualization/renderers/renderers.test.tsx` draws the first and last step and the quiz views of every lesson with `renderToString`, and fails on a crash or on `NaN`, `undefined` or `[object Object]` in the output. Beyond that, components have no DOM tests; UI changes are checked by hand in a browser, including at phone width (375px) and in dark mode.

The README's "How to add a lesson / SQL lesson / algorithm / visualization" sections walk through each kind of change. Adding a new view kind means extending the `View` union, adding a renderer, and adding cases in `renderers/index.tsx` and `rolesInView`. TypeScript then reports any other place that is missing.

## Workflow conventions

- Each phase of work has a design spec in `docs/superpowers/specs/` and an implementation plan in `docs/superpowers/plans/` (superpowers plugin; the shared plugin setup is in `.claude/settings.json`). `.superpowers/` holds working files, and its `sdd/` folder is git-ignored.
- Work happens on a branch, goes through a PR and is merged into `main`, and the merge deploys the site.
- Commit messages, PR titles and PR descriptions contain no AI attribution: no `Co-Authored-By` trailer for an AI, and no "Generated with" line.
- The copy style for lessons and step text is plain, short sentences for beginners, explaining what happened and why with the actual values.
- Follow React best practices. Anything the UI repeats becomes a reusable component: use or extend `components/ui/` before writing a control, and extract a pattern the second time it appears. Keep accessibility wiring (ids, `aria-describedby`, `aria-pressed`) inside the component, and keep component files exporting only components (hooks and helpers go in their own `.ts` files, as Oxlint's fast-refresh rule requires).
