# AI Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 Building with LLMs lessons live: four on the real tiny model (KV cache, context window, constrained decoding, dense vs. TF-IDF search) and four on a deterministic rule-based stand-in (chat templates, RAG, function calling, evals).

**Architecture:** New engine modules in `src/ai/` (`vectors.ts`, `kvcache.ts`, `constrain.ts`, `standin.ts`, no React), then one scenario module per lesson in `src/ai/scenarios/` (`fooCode`, `fooSteps(values)`) used by the existing `form` input. No new view kind: `array`, `grid`, `distribution` and `panels` only.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint. Node 24.

**Spec:** `docs/superpowers/specs/2026-10-29-ai-track-phase-2-design.md`

## Global Constraints

- Branch `ai-phase-2` in the `stepwise` folder (already created; spec committed). No worktrees.
- `src/ai/` contains no React. All lesson text lives in `src/lessons/`.
- Entry points never throw on learner input. Unusable values return one step through `refusal(title, why, EMPTY)` (`src/algorithms/form.ts`, `src/ai/steps.ts`), read with `readInt` / `readChoice` / `readPrompt`. A garbage value in a number or choice field gives exactly one step (the contract test checks this).
- Deterministic: no randomness in phase 2.
- Limits: prompts 1–6 known words; context-window text 1–20 known words; window 3–5; generation 1–8 tokens, stopping at `<end>` or `CONTEXT = 6`; k 1–5; `MAX_STEPS = 200`.
- Numbers shown to the learner use `fmt` (2 decimals).
- Code lines via `lineOf(code, snippet)`, never hard-coded.
- Lessons: no `complexity`, `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types (`multiple-choice`, `code`, `predict-next`), with at least one `predict-next` whose `view` comes from a real step. They have the same sections as phase 1 lessons (overview, concept, howItWorks, visualization, code, prosCons, applications, commonMistakes, quiz, summary).
- Stand-in lessons say "rule-based stand-in" in the overview and in the first step's `why`, and say that real models learn this behaviour from training.
- Copy: plain, short sentences for beginners, with the run's actual values.
- Commit messages, PR titles and PR bodies contain no AI attribution.
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`.

## Rulings (where this plan narrows the spec)

- **`readPrompt` gets an optional `max` (default `CONTEXT`).** With `max !== CONTEXT` the refusal reads `${label} must be 1 to ${max} words.` Context Window uses `max = 20`.
- **`forward`'s per-position tail is extracted** as `positionOut(x, attn, w)` in `model.ts` (resid1 → norm1 → mlp → resid2 → norm2 → logits), so `extend` reuses it instead of copying it. `forward`'s output is unchanged (the model tests guard it).
- **Retriever knob values:** `RETRIEVERS = ['tfidf', 'dense', 'none']` for RAG and Evals, and `VECTOR_KINDS = ['dense', 'tfidf']` for Vector Search. `none` means no retrieval.
- **Each RAG question carries its query words** (`query: 'dog ate'`). The lesson calls this "rewriting the question into search words", a real technique; the stand-in never parses the question text.
- **The stand-in's RAG answer is the words after the verb** in the first context document that contains both the question's subject and verb ("the dog ate the bone" → "the bone"), cited by its 1-based corpus number. With no match it answers "The documents don't say." With no context it answers "the mat" with `madeUp: true`.
- **Evals cases** are the questions `dog-ate`, `bird-flew`, `fish-swam`, `cat-likes`, `dog-played` and `dog-chased`. Their expected answers are `bone`, `to the tree`, `in the pond`, `fish`, `in the park` and `the ball`. So with TF-IDF and k = 2, contains scores 6/6 and exact scores 4/6. With k = 1, `dog-chased` fails, because *the cat chased the bird* ranks first.
- **Lessons register in curriculum order** (chat-templates → evals), because `lessons.test.ts` checks that live AI lessons are a prefix of the topic list. The test "has the 7 How LLMs Work lessons live" is updated in each lesson task to the new count, and ends as "has the 15 How LLMs Work and Building with LLMs lessons live".

## Review Focus

- **KV Cache with a 6-word prompt and 8 tokens to generate:** generation must stop with a "context is full" step before `extend` ever reads `posEmbed[6]` (undefined → NaN). Pinned in Task 6.
- **A vector-search query of only filler words** ("the on"): dense keeps all the words (no empty mean, no NaN); every score is finite and in [−1, 1]. Pinned in Task 1.
- **Context-window text no longer than the window:** nothing is dropped, both strategies give the same window, and the step says the text fits. Pinned in Task 6.
- **Unconstrained decoding that fills a named slot with a word outside its set** (food schema, free: slot `food` gets `the`): the JSON shows the word, the slot is marked invalid, and there's no throw. Pinned in Task 3.
- **RAG with the dense retriever at k = 5 for "dog ate":** no retrieved document matches, so the answer is "The documents don't say", not a made-up answer and not a wrong citation. Pinned in Task 4.

---

## File map

| File | Responsibility |
|---|---|
| `src/ai/vectors.ts` | `FILLER`, `DOCS`, `denseVector`, `tfidfVector`, `search` |
| `src/ai/kvcache.ts` | `KvCache`, `EMPTY_CACHE`, `extend` |
| `src/ai/constrain.ts` | `ANIMALS`, `PLACES`, `FOODS`, `SCHEMAS`, `decode` |
| `src/ai/standin.ts` | message tables, `MARKERS`, `render`, `TOOLS`, `checkArgs`, `runTool`, `reply` |
| `src/ai/model.ts` | + `positionOut` |
| `src/ai/steps.ts` | `readPrompt` gets `max` |
| `src/ai/scenarios/<id>.ts` (+ `.test.ts`) | one per lesson |
| `src/lessons/meta/ai.ts`, `src/lessons/ai/<id>.ts` | metadata and content |

## Lesson metadata (Tasks 5–12 append these to `aiMeta`, in this order)

All have `category: 'ai'`, `difficulty: 'intermediate'`, `group: 'Building with LLMs'`.

| id | title (from curriculum) | prerequisites | keywords |
|---|---|---|---|
| `chat-templates` | Chat Templates & Roles | `next-token-prediction` | chat template, system prompt, roles, special tokens, generation prompt, chatml |
| `context-window` | The Context Window | `next-token-prediction` | context window, context length, truncation, sliding window, tokens |
| `kv-cache` | KV Cache | `self-attention` | kv cache, keys, values, inference, generation speed, attention |
| `structured-output` | Structured Output | `sampling` | structured output, json, constrained decoding, grammar, schema, logit mask |
| `vector-search` | Vector Search | `embeddings` | vector search, embeddings, cosine similarity, tf-idf, dense retrieval, sparse retrieval |
| `rag` | Retrieval-Augmented Generation | `vector-search`, `chat-templates` | rag, retrieval, grounding, citations, hallucination, context |
| `function-calling` | Function Calling | `chat-templates` | function calling, tool use, tools, json schema, arguments |
| `evals` | Evals | `rag` | evals, evaluation, test set, grader, exact match, accuracy |

Descriptions are one sentence in the phase 1 style ("Do X with the tiny model: …").

---

### Task 1: Vector search engine

**Files:**
- Create: `src/ai/vectors.ts`, `src/ai/vectors.test.ts`

**Interfaces:**
- Consumes: `CORPUS`, `VOCAB`, `tokenize`, `tokenId` (`corpus.ts`); `WEIGHTS`; `Vec`, `dot`.
- Produces:
  ```ts
  export type VectorKind = 'dense' | 'tfidf';
  export const FILLER: ReadonlySet<string>;            // the a on in to by with is
  export const DOCS: readonly number[][];               // tokenize(s) for each CORPUS sentence
  export function denseVector(ids: number[]): Vec;     // mean tokenEmbed of non-filler ids (all ids if none left), unit length
  export function tfidfVector(ids: number[]): Vec;     // VOCAB.length; count × ln(N / df), df over DOCS
  export interface SearchResult { scores: number[]; top: number[] } // scores in DOCS order; top = k doc indexes, best first, ties → lower index
  export function search(queryIds: number[], k: number, kind: VectorKind): SearchResult;
  ```
  The cosine of a zero vector is 0.

- [ ] **Step 1: Write the failing tests** in `vectors.test.ts`, using a helper `topSentence(q, kind, k = 1) = search(ids(q), k, kind).top.map((i) => CORPUS[i])`:
  - `tfidf ranks each RAG sentence first`: `dog ate` → `the dog ate the bone`; `bird flew` → `the bird flew to the tree`; `fish swam` → `the fish swam in the pond`; `cat likes` → `the cat likes the fish`; `dog played` → `the dog played in the park`; `bird ate` → `the bird ate the seed`.
  - `tfidf needs k = 2 for dog chased`: top 1 is `the cat chased the bird`, and top 2 contains `the dog chased the ball`.
  - `dense ranks noun queries well`: `dog park` → `a dog is in the park`; `fish pond` → `a fish is in the pond`; `cat mat` → `a cat is on the mat`.
  - `dense fails on a verb query`: `dog ate` → `the cat chased the bird`.
  - `keeps scores finite for filler-only queries`: for `the on`, both kinds give 30 scores, all finite and in [−1, 1].
  - `returns k results`: for k in 1..5, `top.length === k`, and `top` is sorted by score.

- [ ] **Step 2:** Run `npx vitest run src/ai/vectors.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `vectors.ts`.
- [ ] **Step 4:** Run the test again. Expected: PASS. Then run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `AI engine: dense and TF-IDF vector search`.

### Task 2: KV cache engine

**Files:**
- Modify: `src/ai/model.ts` (extract `positionOut`)
- Create: `src/ai/kvcache.ts`, `src/ai/kvcache.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // model.ts
  export interface PositionOut { resid1: Vec; norm1: Vec; mlp: Vec; resid2: Vec; norm2: Vec; logits: Vec }
  export function positionOut(x: Vec, attn: Vec, w?: Weights): PositionOut; // forward maps it over rows
  // kvcache.ts
  export interface KvCache { tokens: number[]; k: Mat; v: Mat }
  export const EMPTY_CACHE: KvCache;
  export interface Extended { cache: KvCache; q: Vec; weights: Vec; logits: Vec; probs: Vec }
  /** One new position: Q, K, V for it only; K and V appended; attends over the cache. Caller keeps tokens.length < CONTEXT. */
  export function extend(cache: KvCache, token: number, w?: Weights): Extended;
  ```
  `extend` returns a new cache and never mutates its input.

- [ ] **Step 1: Write the failing tests** in `kvcache.test.ts`:
  - `matches forward at every step`: extend through `the cat sat on the` token by token. At step i, `logits` equals `forward(prefix).logits.at(-1)` within 1e-9 per entry, and `weights` equals `forward(prefix).weights.at(-1)` (first i + 1 entries) within 1e-9.
  - `caches K and V rows equal to forward`: after all 5 tokens, `cache.k` / `cache.v` equal `forward(tokens).k` / `.v` within 1e-9.
  - `does not mutate the cache`: `deepFreeze` the cache, then extend it without throwing.
- [ ] **Step 2:** Run `npx vitest run src/ai/kvcache.test.ts src/ai/model.test.ts`. Expected: kvcache FAILs.
- [ ] **Step 3:** Extract `positionOut` and rewrite `forward` to use it, then implement `extend`.
- [ ] **Step 4:** Run the same command. Expected: both PASS. Run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `AI engine: KV cache with incremental attention`.

### Task 3: Constrained decoding engine

**Files:**
- Create: `src/ai/constrain.ts`, `src/ai/constrain.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ANIMALS = ['cat', 'dog', 'bird', 'fish'] as const;
  export const PLACES = ['mat', 'rug', 'tree', 'park', 'door', 'pond'] as const;
  export const FOODS = ['fish', 'bone', 'seed'] as const;
  export type Slot = { word: string } | { name: string; allowed: readonly string[] };
  export interface Schema { id: 'place' | 'food'; pattern: string; slots: readonly Slot[] }
  // place: "the <animal> sat on the <place>"; food: "the <animal> ate the <food>"
  export const SCHEMAS: readonly Schema[];
  export interface DecodeStep { slot: number; raw: Vec; probs: Vec; cut: number[]; chosen: number; valid: boolean }
  export interface Decoded { steps: DecodeStep[]; words: string[]; json: Record<string, string>; valid: boolean }
  /** Starts from the schema's first word ("the") as the prompt; one step per remaining slot. */
  export function decode(schema: Schema, constrained: boolean): Decoded;
  ```
  Constrained: ids outside the slot's allowed set (a fixed word allows only itself) are cut, the kept probabilities are renormalised (cut ids get probability 0), and the argmax is taken. Free: plain greedy on the raw probabilities, stopping early at `<end>`. A step is `valid` when the chosen word fits its slot. `json` maps each named slot that was reached to its word. `Decoded.valid` means every slot was reached and every step is valid.

- [ ] **Step 1: Write the failing tests** in `constrain.test.ts`:
  - `place, constrained` → words `the dog sat on the rug`, json `{ animal: 'dog', place: 'rug' }`, valid.
  - `food, constrained` → `the dog ate the bone`, json `{ animal: 'dog', food: 'bone' }`, valid.
  - `place, free` → `the dog sat on the rug`, valid (free decoding can fit by luck).
  - `food, free breaks the shape`: step for slot 2 chose `sat`, invalid; `json.food === 'the'`; `valid === false`.
  - `masks exactly the disallowed ids`: for every constrained step, `cut` equals the ids not allowed, those probs are 0, and the kept probs sum to 1 within 1e-9.
- [ ] **Step 2:** Run `npx vitest run src/ai/constrain.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `constrain.ts`.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `AI engine: constrained decoding to a schema`.

### Task 4: Rule-based stand-in

**Files:**
- Create: `src/ai/standin.ts`, `src/ai/standin.test.ts`

**Interfaces:**
- Consumes: `DOCS` / `CORPUS` (for answers), `search` (Task 1) in tests only.
- Produces:
  ```ts
  export type Speaker = 'system' | 'user' | 'assistant' | 'tool';
  export interface Message { speaker: Speaker; content: string; key?: string }
  export interface Choice { id: string; text: string }
  export const SYSTEMS: readonly Choice[];        // none (''), helpful ('You are a helpful assistant.'), pirate ('Talk like a pirate.')
  export const USER_MESSAGES: readonly Choice[];  // hello ('Hi there!'), sum ('What is 2 + 2?')
  export interface Question extends Choice { query: string; subject: string; verb: string; expected: string }
  export const QUESTIONS: readonly Question[];    // dog-ate, bird-ate, bird-flew, fish-swam, cat-likes, dog-played, dog-chased
  export const REQUESTS: readonly Choice[];       // weather-paris, weather-mars, add, add-words ('What is 17 + twenty?'), hello ('Say hello!')
  export const MARKERS: Record<'system' | 'user' | 'assistant' | 'end', string>; // <|system|> <|user|> <|assistant|> <|end|>
  /** Marker and word tokens; ends with "<|assistant|>" when generationPrompt is on. Empty system messages are skipped. */
  export function render(messages: Message[], generationPrompt: boolean): string[];
  export interface Tool { name: string; description: string; params: { name: string; type: 'string' | 'number' }[] }
  export const TOOLS: readonly Tool[];            // get_weather(city: string), add(a: number, b: number)
  export const WEATHER: Readonly<Record<string, string>>; // Paris '18°C and cloudy', Tokyo '24°C and sunny', Hanoi '31°C and rainy'
  export interface ToolCall { name: string; args: Record<string, unknown> }
  /** The first problem, e.g. "b must be a number", or undefined when the args fit. */
  export function checkArgs(tool: Tool, args: Record<string, unknown>): string | undefined;
  export function runTool(call: ToolCall): { ok: true; result: string } | { ok: false; error: string };
  export type Reply =
    | { kind: 'text'; text: string; madeUp?: boolean; cites?: number[] }
    | { kind: 'tool-call'; call: ToolCall }
    | { kind: 'continue-user'; text: string };
  export function reply(messages: Message[], o?: { tools?: readonly Tool[]; context?: number[]; generationPrompt?: boolean }): Reply;
  ```
  Rules, in order: generation prompt off → `continue-user`; last message is a tool result → final text; tools offered and the request fits a tool → tool call; a question with context → grounded answer per the Rulings; a question without context → `the mat`, `madeUp`; otherwise a canned chat reply by user key, in pirate style when the system key is `pirate`. Without tools, weather requests say there is no tool for live weather, and `add` is answered directly. The rules read `Message.key`, never `content`. Unknown city → `runTool` error `No weather for Mars`. Failed `checkArgs` → `runTool` error naming the problem, and the tool does not run. `cites` are 1-based corpus numbers.

- [ ] **Step 1: Write the failing tests** in `standin.test.ts`:
  - `render`: helpful + hello + generation prompt → `['<|system|>', 'You', 'are', …, '<|end|>', '<|user|>', 'Hi', 'there!', '<|end|>', '<|assistant|>']`; with the prompt off, the last token is `<|end|>`; system `none` adds no system tokens.
  - `continues the user turn without a generation prompt`: `reply(…, { generationPrompt: false }).kind === 'continue-user'`.
  - `answers in pirate style`: pirate + hello → text contains `Ahoy`.
  - `grounded answers`: for each question except dog-chased, with `context = search(ids(q.query), 2, 'tfidf').top`, the text is the expected phrase or contains it, and `cites` has 1 entry.
  - `dog-chased with k = 1` → `The documents don't say.`; with k = 2 → `the ball`.
  - `dense at k = 5 for dog-ate` → `The documents don't say.` (Review Focus).
  - `no context` → `the mat`, `madeUp: true`.
  - `tool calls`: weather-paris + TOOLS → `get_weather({ city: 'Paris' })`; add → `add({ a: 17, b: 25 })`; add-words → `add({ a: 17, b: 'twenty' })`; hello + TOOLS → text.
  - `runTool`: Paris → `18°C and cloudy`; Mars → error `No weather for Mars`; add-words args → error `b must be a number`; add → `42`.
  - `after a tool result` → final text containing the result.
- [ ] **Step 2:** Run `npx vitest run src/ai/standin.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `standin.ts`.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `AI engine: rule-based stand-in model with toy tools`.

### Tasks 5–12: one lesson each

Every lesson task touches the same files and runs the same cycle:

**Files:**
- Create: `src/ai/scenarios/<id>.ts`, `src/ai/scenarios/<id>.test.ts`, `src/lessons/ai/<id>.ts`
- Modify: `src/lessons/meta/ai.ts` (append the row from the metadata table), `src/lessons/lessons.test.ts` (bump the live AI count), and `src/ai/contract.test.ts` (`RANGES`, where listed)

- [ ] **Step 1:** Write the scenario test with the assertions listed for the task.
- [ ] **Step 2:** Run `npx vitest run src/ai/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the scenario (`<id>Code`, option lists, `<id>Steps(values)`), then the lesson content and metadata.
- [ ] **Step 4:** Run `npx vitest run src/ai src/lessons` and expect PASS. If it reports "No content module", delete `node_modules/.vitest-cache` and rerun. Then run `npm run typecheck && npm run lint`.
- [ ] **Step 5:** Commit: `AI lesson: <title>`.

#### Task 5: Chat Templates & Roles (`chatTemplatesSteps`)

- Fields: `system` (choice of SYSTEMS ids, sample `helpful`), `user` (choice of USER_MESSAGES ids, sample `hello`), `generationPrompt` (choice `on` / `off`). Presets: Plain (`none`, `hello`, `on`), With system (`helpful`, `sum`, `on`), Pirate (`pirate`, `hello`, `on`), Forgot generation prompt (`helpful`, `hello`, `off`).
- Steps: the messages (`grid`, rows labelled by speaker, one text cell) → one step per message appended to the token stream (`array`; markers role `active`, words `default`) → the generation prompt added (or the step saying it's missing) → the stand-in's reply (`panels`: stream + reply; with the prompt off, the reply is shown as more user text).
- Tests: the default run's last view shows the reply after `<|assistant|>`; with `off`, the final step title says the model kept writing the user's message; garbage `system` gives 1 step.
- Live count 8.

#### Task 6: The Context Window (`contextWindowSteps`)

- Fields: `text` (text, sample `the fish saw the bird sat on the`), `window` (number 3–5, sample `5`), `strategy` (choice `oldest` / `first`). Presets: Fits (`the cat sat on the`, 5, `oldest`), Too small (`the cat sat on the`, 3, `oldest`), Overflows (default, `oldest`), Keep the subject (default, `first`). `RANGES['context-window'] = { window: [3, 5] }`.
- Steps: all tokens (`array`) → the window chosen, dropped tokens role `discarded`, kept tokens `active` → the next-word `distribution` for the window (chosen = argmax).
- Tests: Fits → `mat`; Too small → `the`; Overflows → `tree`; Keep the subject → `pond`; text no longer than the window → no `discarded` cells and both strategies give the same steps (Review Focus); 21 words → 1 refusal step.
- Live count 9.

#### Task 7: KV Cache (`kvCacheSteps`)

- Fields: `prompt` (text, sample `the cat`), `count` (number 1–8, sample `4`), `cache` (choice `on` / `off`). Presets: Cached, Uncached, Prompt fills the context (`the cat sat on the mat`, 8, `on`). `RANGES['kv-cache'] = { count: [1, 8] }`.
- Steps: with the cache on, one step per prompt token and per generated token, each showing `panels` with K and V (`matrixGrid`, the new row `active`) and the variables `rows computed` (cumulative) and `token`. With it off, each generated token recomputes every row, shown as a new grid, all rows `active`. A final step compares the totals (n vs. n(n+1)/2 for n positions fed). Generation stops at `<end>` or once `CONTEXT` positions are filled, with a step saying why.
- Tests: cache on and off generate the same words (`sat on the mat` for the default); the cumulative rows are 5 vs. 15 (positions fed: `the cat sat on the`; the last word is predicted, never fed); a 6-word prompt with count 8 ends with a "context is full" step and has no NaN values in any grid (Review Focus).
- Live count 10.

#### Task 8: Structured Output (`structuredOutputSteps`)

- Fields: `schema` (choice `place` / `food`), `constrained` (choice `on` / `off`). Presets: Constrained place, Constrained food, Free place (fits by luck), Free food (breaks the shape).
- Steps: the schema (`grid`: slot \| allowed words) → per decode step, `panels` with the `distribution` (`cut` from the decode step, chosen bar `found`) and the JSON so far (`grid`: key \| value, an invalid value role `discarded`) → the final verdict.
- Tests: Free food's last step title says the output does not match the schema, and its JSON grid has `food` → `the` marked `discarded`; Constrained food ends with `{"animal": "dog", "food": "bone"}` in its title.
- Live count 11.

#### Task 9: Vector Search (`vectorSearchSteps`)

- Fields: `query` (text, sample `dog park`), `k` (number 1–5, sample `3`), `vectors` (choice `dense` / `tfidf`). Presets: Dog park (dense), Fish pond (dense), Dog ate (dense fails), Dog ate (TF-IDF). `RANGES['vector-search'] = { k: [1, 5] }`.
- Steps: the query's content words (dense) or weights (TF-IDF) → the query vector (`vectorGrid` for dense, a one-column `matrixGrid` over the query's words for TF-IDF) → all 30 scores as a `distribution` (bars labelled `doc n`, the top k role `found`; `distributionView` is for the vocabulary, so build this view inline) → the top k sentences (`grid`: rank \| doc \| sentence \| score).
- Tests: Dog park's top 1 is doc `a dog is in the park`; Dog ate (dense) ranks `the cat chased the bird` first; TF-IDF fixes it; the distribution's bar ids are unique.
- Live count 12.

#### Task 10: Retrieval-Augmented Generation (`ragSteps`)

- Fields: `question` (choice of QUESTIONS ids, sample `dog-ate`), `k` (number 1–5, sample `2`), `retriever` (choice `tfidf` / `dense` / `none`). Presets: Grounded, No retrieval (made up), k too small (`dog-chased`, k 1), Dense misses (`dog-ate`, `dense`). `RANGES.rag = { k: [1, 5] }`.
- Steps: question → search words → retrieved documents (`grid`) → the prompt with the documents pasted in (`grid`: speaker \| text) → the stand-in's answer, with the citation in the title. With `none`, the retrieval steps are replaced by one step saying nothing was retrieved, and the answer step says it was made up.
- Tests: Grounded answers `the bone` citing doc 12; No retrieval → `the mat` and the title says made up; k too small → "don't say"; k 2 → `the ball`.
- Live count 13.

#### Task 11: Function Calling (`functionCallingSteps`)

- Fields: `request` (choice of REQUESTS ids, sample `weather-paris`), `tools` (choice `all` / `none`). Presets: Weather, Add, No tool needed (`hello`), Unknown city (`weather-mars`), Bad arguments (`add-words`), No tools offered (`weather-paris`, `none`).
- Steps: the tool schemas (`grid`: tool \| parameters; skipped with `none`) → the user message → the stand-in's tool call (or direct answer) → the argument check (pass, or the error) → the tool result message → the final answer. The message `grid` grows each step (speaker \| text; tool calls shown as `get_weather({"city":"Paris"})`).
- Tests: Weather ends with `18°C and cloudy`; Bad arguments shows `b must be a number` and never a `42`; Unknown city's final answer apologises; No tools offered never contains a tool call.
- Live count 14.

#### Task 12: Evals (`evalsSteps`)

- Fields: `retriever` (choice `tfidf` / `dense` / `none`), `k` (number 1–5, sample `2`), `grader` (choice `contains` / `exact`). Presets: Baseline, Dense, No retrieval, Strict grader (`exact`), k 1. `RANGES.evals = { k: [1, 5] }`.
- Steps: the test set (`grid`: question \| expected) → one step per case adding a row (question \| expected \| got \| pass; pass `found`, fail `discarded`), with `score` as a variable → the final score.
- Tests: Baseline 6/6; Strict 4/6; k 1 5/6; Dense < Baseline; No retrieval 0/6; for every retriever and k, exact ≤ contains.
- Live count 15; rename the test to "has the 15 How LLMs Work and Building with LLMs lessons live".

### Task 13: Docs, bundle and browser check

**Files:**
- Modify: `README.md` (line 17: "AI (15 of 23 live)" plus the 8 titles, with AI Agents coming soon; line 86: the `src/ai/` entry gains vector search, KV cache, constrained decoding and the rule-based stand-in), `CLAUDE.md` (the AI architecture bullet: `vectors.ts`, `kvcache.ts`, `constrain.ts`, `standin.ts` and `positionOut`)
- Create: `.superpowers/sdd/2026-10-29-ai-track-phase-2/progress.md` (rulings made during the build)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, first load < 600 kB.
- [ ] **Step 3:** Run `npm run dev` and open each of the 8 lessons at 375px and in dark mode. Check that long text cells in message grids wrap and nothing scrolls sideways. Fix any renderer overflow in a shared way (`GridRenderer`), not per lesson.
- [ ] **Step 4:** Commit: `Docs: AI track phase 2`.
