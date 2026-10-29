# AI track, phase 2: building with LLMs

Date: 2026-10-29
Status: approved design, awaiting spec review

## Goal

Make the 8 **Building with LLMs** topics (intermediate) of the AI category live. Phase 1 built the tiny transparent model; phase 2 uses it where the lesson is the math, and adds a scripted, rule-based stand-in model for the app-level flows. Phase 3 (AI Agents) builds on the same stand-in.

## Decisions

- **Hybrid engine** (the user's choice). The real tiny model drives KV Cache, The Context Window, Structured Output and Vector Search, so their numbers are computed live. A deterministic rule-based stand-in drives Chat Templates & Roles, Function Calling, and the answering half of RAG and Evals. Every lesson that uses the stand-in labels it "rule-based stand-in" and says that real models learn this behaviour. Three details were revised after probing the trained model (2026-10-29): see Vector search, Context window and Constrained decoding below.
- **No free-text parsing for the stand-in.** Its questions, requests and messages are `choice` fields (about 6 options each), so the rules stay small and every path is tested. Real-model lessons keep text prompts over the corpus vocabulary, read with `readPrompt`.
- **No new view kind.** Token streams use `array`; messages, schemas, caches and eval results use `grid`; next-word choices and search scores use `distribution`; `panels` combines them. The view count stays at 18.
- **The existing `form` input** drives every lesson (knobs = fields, scenarios = presets).
- One spec, one plan, one PR on branch `ai-phase-2`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

No change to `curriculum.ts`: the 8 intermediate topics are already listed (`chat-templates`, `context-window`, `kv-cache`, `structured-output`, `vector-search`, `rag`, `function-calling`, `evals`). Phase 2 registers their lessons, so 15 of the 23 AI topics are live.

## 1. Engine (`src/ai/`)

No React, same layering as phase 1. Entry points never throw.

### KV cache (`kvcache.ts`)

- `extend(cache, token)` computes Q, K and V for the new position only, appends that position's K and V to the cache, attends over the cached rows, and runs the rest of the block for that one position. It returns the new cache, the position's logits and probabilities, and the number of K/V rows computed.
- Without the cache, every step re-runs `forward()` over the whole prefix. Generating n tokens computes n K/V rows with the cache and 1 + 2 + … + n = n(n+1)/2 rows without it.
- Generation is greedy and stops at `<end>` or the context length.

### Constrained decoding (`constrain.ts`)

- A schema is a list of slots, each either a fixed word or a named set of allowed words. There are two schemas:
  - animal + place: `the <animal> sat on the <place>` → `{"animal": …, "place": …}`
  - animal + food: `the <animal> ate the <food>` → `{"animal": …, "food": …}`
- Decoding starts with the schema's first word, "the", as the prompt (the toy has no start token), so there is no prompt knob.
- Constrained mode: at each step, the logits of every word outside the slot's allowed set become −∞, the rest are renormalised, and the top word is taken. A fixed-word slot allows only that word.
- Unconstrained mode is plain greedy decoding from the same prompt. The JSON is then filled from whatever words came out, and a slot that gets a word outside its set is marked invalid.
- Each step returns the raw and masked distributions and the cut ids.

### Vector search (`vectors.ts`)

Two retrievers (the user's choice, after a probe), compared in the lessons:

- **dense**: a sentence's vector is the mean of the model's `tokenEmbed` rows for its content words (filler words `the a on in to by with is` dropped; a query of only filler words keeps them all), normalised to length 1.
- **tfidf**: a vocabulary-sized vector of count × ln(N / document frequency) over the 30 corpus sentences.
- `search(queryIds, k, retriever)` takes the cosine against every document (0 for a zero vector) and returns all scores plus the top k (ties go to the lower document index).
- Why both: the probe showed the dense vectors rank noun queries well ("dog park" → *a dog is in the park*) but fail on verbs ("dog ate" → *the cat chased the bird*), because they were trained for next-word prediction, not search. TF-IDF ranks every RAG question's sentence first. The Vector Search lesson shows that failure; RAG uses TF-IDF; Evals measures the difference.

### Context window (no new module)

The text (up to 20 known words) is cut to a **window of 3–5 tokens** (a knob) by one of two strategies: **drop oldest** (the last n tokens) or **keep first 2 + latest** (the first 2 tokens, then the last n − 2). The window goes through `forward()` with positions numbered from 0, and the lesson shows the next-word distribution for the window's last position.

The window is capped at 5, not `CONTEXT = 6`: the probe showed the toy predicts `<end>` (≈ 0.97) after any 6 tokens, because every training sentence ends by then. The lesson says so. Probed outcomes the presets use: "the cat sat on the" at 5 → mat (0.90), at 3 → the (0.62, the subject is gone); "the fish saw the bird sat on the" at 5 → tree (drop oldest) vs. pond (keep first 2).

### Rule-based stand-in (`standin.ts`)

- `Message = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }`.
- `reply(messages, { tools?, context? })` is deterministic and works on the choice ids behind the messages, not on parsed text. Rules, in order:
  1. The last message is a tool result: write the final answer from it. An error result gives an apology that names the error.
  2. Tools are offered and the request fits one: emit a tool call `{ name, args }`.
  3. Context documents are given: answer from the document that matches the question's subject and verb, and cite it as `[doc n]`. If no document matches, say the documents don't say.
  4. Otherwise: a confident guess, marked "made up" in the step text (the hallucination case).
- Chat templates: `render(messages, { generationPrompt })` flattens messages into one token stream with `<|system|>`, `<|user|>`, `<|assistant|>` and `<|end|>` markers (ChatML-style; the lesson says real models each have their own markers). With the generation prompt off, the stream ends after the user's `<|end|>`, and the stand-in continues the user's turn instead of answering.
- Toy tools, each with an argument schema (names, types, required):
  - `get_weather(city: string)`: a fixed table of 3 cities; an unknown city gives an error result.
  - `add(a: number, b: number)`.
- The runtime checks a tool call's args against the schema before running the tool. A failed check becomes an error result.

### Evals (inside `scenarios/evals.ts`)

- 6 test cases: a RAG question and its expected answer each.
- The system under test is the RAG pipeline (vector search + stand-in) with its retriever and k knobs.
- Graders: **exact** (the answer equals the expected text after trimming and lowercasing) and **contains** (the answer contains the expected text).
- The run grades each case in turn and reports passes / total.

### Steps and scenarios

The same as phase 1: each `scenarios/<id>.ts` exports its knob options, pseudocode and `<id>Steps(values)`. Titles carry real values, plus `why`, `next`, `codeLine` via `lineOf`, and `variables`. Numbers are shown to 2 decimals with `fmt`.

### Invalid input

Out-of-range knobs return one explanatory step through `refuse`, and nothing runs:

- A prompt outside the vocabulary or longer than 6 words (the `readPrompt` rules). Context-window text is 1–20 known words.
- More than 8 tokens to generate.
- k outside 1–5.
- An unknown choice value.

Steps are capped at 200.

## 2. Lessons

| Lesson | Engine | Knobs; presets | What the learner watches |
|---|---|---|---|
| Chat Templates & Roles | stand-in | system prompt (choice), user message (choice), generation prompt (on/off); presets: plain, with system, forgot generation prompt | The messages (`grid`: role \| content) flatten into one token stream with role markers (`array`). With the generation prompt off, the stand-in continues the user's turn |
| The Context Window | real | text (≤ 20 words), window (3–5), strategy (drop oldest / keep first 2 + latest); presets: fits, too small, overflows, keep the subject | The window over the tokens, with dropped tokens greyed out (`array`). The next-word `distribution` changes once the subject falls out |
| KV Cache | real | prompt, tokens to generate, cache (on/off); presets: cached, uncached | The K and V `grid`s gain one row per step, the new row highlighted and old rows reused. A variable counts K/V rows (n vs. n(n+1)/2). The output is the same either way |
| Structured Output | real | schema, constrained (on/off); presets: constrained, free (breaks the shape) | For each slot, a `distribution` with the disallowed words cut and the rest renormalised. The JSON fills in slot by slot (`grid`), with invalid slots marked |
| Vector Search | real | query (≤ 6 known words), k, vectors (dense / TF-IDF); presets: dog park, fish pond, dog ate (dense fails), dog ate (TF-IDF) | The query vector (`grid` with heat), then cosine scores for the documents (`distribution`, top k marked `found`) |
| Retrieval-Augmented Generation | real search + stand-in | question (choice), k, retriever (TF-IDF / dense / none); presets: grounded, no retrieval (made up), k too small | Question → top-k documents → a prompt with the documents pasted in (`grid`) → an answer citing `[doc n]`. With retrieval off, a confident wrong answer |
| Function Calling | stand-in | request (choice), tools offered (all / none); presets: weather, add, no tool needed, unknown city, no tools offered | Tool schemas → tool call → schema check → tool runs → result message → final answer, as a growing message `grid` |
| Evals | real search + stand-in | retriever (TF-IDF / dense / none), k, grader (exact / contains); presets: baseline, dense, no retrieval, strict grader | The 6 cases graded one by one (`grid`: question \| expected \| got \| pass), with the score as a variable |

Each lesson has the usual content: overview, concept, how it works, pros and cons, applications, common mistakes, and a 4-question quiz with at least one `predict-next` question built from a real step. The lesson text says where the toy differs from real systems: trained sentence encoders and approximate nearest-neighbour indexes for search, each model's own chat markers, real models learning tool use and grounding instead of following rules, and LLM-as-judge graders.

## 3. Testing

Vitest, as in phase 1:

- `kvcache`: the cached logits equal `forward()`'s last row within 1e-9 at every step; the row counts are n and n(n+1)/2.
- `constrain`: constrained output always fits the schema; masked ids are exactly the disallowed ones; the kept probabilities sum to 1.
- `vectors`: TF-IDF ranks each RAG question's sentence first (except "dog chased", which needs k = 2); dense ranks the noun presets right and "dog ate" wrong; every score is in [−1, 1]; top k has k entries.
- `standin`: every choice × setting gives the expected reply kind; tool calls pass their schema check; an unknown city gives an error result; with the generation prompt off, the reply continues the user turn.
- Evals: baseline scores higher than dense and than no retrieval; exact scores ≤ contains for the same system.
- `src/ai/contract.test.ts` covers the 8 new lessons, with their number fields in `RANGES`: runs stay within 200 steps, code lines are valid, runs repeat exactly, and out-of-range knobs give exactly one refusal step.
- Curriculum tests: 15 AI lessons live.
- Renderers are unchanged. The new grids and arrays are checked by hand in a browser at 375px and in dark mode.
- `npm run check:bundle` stays under 600 kB.

## Touch points

`src/ai/{kvcache,constrain,vectors,standin}.ts` and their tests, `src/ai/scenarios/<8 ids>.ts` and tests, `src/lessons/ai/<8 ids>.ts`, `src/lessons/meta/ai.ts`, `src/lessons/lessons.test.ts`, `src/ai/contract.test.ts`, and README.md and CLAUDE.md (lesson counts, the new `src/ai/` modules). `registry.ts` and the glob lists already include `ai`.

## Out of scope

- Real model calls and API keys.
- Approximate nearest-neighbour indexes (search is brute force).
- LLM-as-judge grading.
- Multi-step tool loops, memory and planning (phase 3).
