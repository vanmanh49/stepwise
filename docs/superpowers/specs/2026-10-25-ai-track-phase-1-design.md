# AI track, phase 1: how LLMs work

Date: 2026-10-25
Status: approved design, awaiting spec review

## Goal

Add a sixth category, **AI**, that takes learners from how a large language model works, through building apps with LLMs, to how AI agents work. Phase 1 builds a tiny transparent language model whose every number can be shown, adds one new view kind (`distribution`) and heat shading for `grid`, and makes the 7 **How LLMs Work** topics live. The other 16 topics show as Coming soon.

## Decisions

- **One category from LLM basics to agents** (the user's choice), in three phases: How LLMs Work (beginner), Building with LLMs (intermediate), AI Agents (advanced). Each phase has its own spec, plan and PR.
- **Understand the mechanism, not an SDK.** No API calls and no keys: the site is static. Lesson code is short pseudocode for the step being taught.
- **A tiny real model with real math** (the user's choice). Attention, softmax and sampling are computed live, so changing the prompt or the temperature changes the output. Weights come from a seeded offline training script and are committed. Phases 2 and 3 will drive a real agent runtime with a scripted, rule-based stand-in for the model, labelled as such in the lessons.
- **The existing `form` input** drives every lesson (knobs = fields, scenarios = presets). There is no new input kind.
- **One new view kind, `distribution`**, plus an optional `heat` value on `grid` cells. Everything else reuses `array`, `grid` and `panels`.
- One spec, one plan, one PR on branch `ai-phase-1`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

All 23 topics go into `curriculum.ts` under category `ai` (title "AI"), with a group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | How LLMs Work | `tokenization`: Tokenization (BPE) · `embeddings`: Embeddings & Similarity · `next-token-prediction`: Next-Token Prediction · `self-attention`: Self-Attention · `transformer-block`: The Transformer Block · `sampling`: Sampling: Temperature, Top-k & Top-p · `training-loss`: Training & Loss |
| intermediate | Building with LLMs | `chat-templates`: Chat Templates & Roles · `context-window`: The Context Window · `kv-cache`: KV Cache · `structured-output`: Structured Output · `vector-search`: Vector Search · `rag`: Retrieval-Augmented Generation · `function-calling`: Function Calling · `evals`: Evals |
| advanced | AI Agents | `agent-loop`: The Agent Loop (ReAct) · `agent-memory`: Agent Memory · `planning-decomposition`: Planning & Decomposition · `reflection`: Reflection & Self-Correction · `multi-agent`: Multi-Agent Orchestration · `mcp`: MCP & Tool Protocols · `prompt-injection-guardrails`: Prompt Injection & Guardrails · `human-in-the-loop`: Human-in-the-Loop |

None of these ids is used by another category. Only the 7 How LLMs Work topics are registered in phase 1.

## 1. Engine (`src/ai/`)

No React, the same layering as `kubernetes/`. Entry points never throw.

### Corpus (`corpus.ts`)

About 30 short toy sentences over a small world ("the cat sat on the mat", "the dog chased the ball", "a bird sang in the tree", …). The word vocabulary is every word in the corpus plus `<end>`, about 40 entries, in a fixed order. The corpus is plain data; every other module derives from it.

### Byte-pair encoding (`bpe.ts`)

- `learnMerges(corpus, n)`: real BPE. It starts from characters (a space marks a word start), counts adjacent pairs across the corpus, and merges the most frequent pair, n times. Ties go to the pair that comes first in a fixed order (first by count, then alphabetically). It returns the merge list, with the count of each pair when it was merged.
- `encode(text, merges)`: applies the merges in learned order and records one trace entry per merge that changed something. Characters never seen in the corpus stay single tokens. `decode(encode(x)) === x`.
- The model itself works on **word tokens** (the vocabulary above), so later lessons stay readable. The tokenization lesson says so: real models run BPE over bytes, with vocabularies of tens of thousands of tokens.

### Tensors and autograd (`tensor.ts`)

- Plain `number[]` and `number[][]` helpers: matmul, add, scale, transpose, softmax (max-subtracted, so large logits are stable), layer norm, cosine similarity, ReLU.
- A tiny reverse-mode autograd (`Value` nodes with `backward()`), about 150 lines, used by the offline weight script and the live training lesson. It has no other users.

### Model (`model.ts`, `weights.ts`)

- A decoder-only transformer with **1 layer, 1 head, d = 8, MLP width 16, context length 6**: token embedding + learned position embedding → causal self-attention → residual add → layer norm → MLP (ReLU) → residual add → layer norm → unembedding to logits over the vocabulary.
- `forward(tokens)` returns every intermediate the lessons show: the input vectors, Q, K, V, raw scores, scaled scores, masked scores, attention weights, the attention output, the vector after each stage, the logits and the probabilities. It returns these values rather than logging them, so lessons and tests read the same numbers.
- `weights.ts` is generated by `scripts/train-ai-model.ts` and committed (a few KB of rounded numbers). The script trains the model on next-word prediction over the corpus with the autograd and plain gradient descent, seeded through `seeded` (`src/utils/random.ts`), and writes the file. The site never trains the transformer at load time. Running the script twice writes the same file.

### Sampling (`sample.ts`)

`reshape(logits, { temperature, topK, topP })` divides the logits by the temperature, applies softmax, keeps the top k, keeps the smallest set whose probability reaches p, and renormalises. It returns each stage's distribution and which tokens were cut. `draw(probs, rng)` picks one token with the seeded generator. Ties in ranking go to the lower vocabulary index.

### Bigram trainer (`bigram.ts`)

The training lesson trains a **bigram model** live (a vocabulary × vocabulary table of logits, starting at zero), not the transformer: it is small enough to show every number. Each step takes one (previous word, next word) pair from the chosen sentence, computes the cross-entropy loss −log p(target), the gradient p − one-hot(target) for that row, and updates the row by the learning rate times the gradient. The table, loss and gradient are recorded for every step.

### Steps and scenarios (`steps.ts`, `scenarios/<id>.ts`)

- Each scenario module exports its knob options, its pseudocode, and a `<id>Steps(values)` generator for the lesson's `form` input, as the Kubernetes scenarios do.
- Step `title`s say what happened, with real values ("softmax turns logit 3.1 for `mat` into 0.62"); `why` says why; `next` says what comes next.
- `codeLine` points into the lesson's pseudocode through `lineOf` (`src/data-structures/shared.ts`).
- `variables` show the numbers in focus (the current token, a score, the temperature, the loss).
- Numbers shown to the learner are rounded to 2 decimals; the engine keeps full precision.

### Invalid input

Out-of-range knobs return one explanatory step through `refuse` (`src/data-structures/shared.ts`), and nothing runs:

- BPE text longer than 40 characters, or more than 30 merges.
- A prompt word outside the vocabulary (the step lists the known words), an empty prompt, a prompt longer than 6 tokens, or more than 8 tokens to generate. Generation also stops at `<end>` or at the context length.
- Temperature outside 0.1–2, top-k outside 1–vocabulary size, top-p outside 0.05–1.
- Learning rate outside 0.01–2, or more than 50 training steps.

Steps are capped at 200, as in the other tracks.

## 2. Views

### `distribution` (new)

```ts
export interface DistributionView {
  kind: 'distribution';
  /** e.g. "P(next word | the cat sat on the)". */
  title?: string;
  bars: { id: string; label: string; value: number; role: Role }[];
  /** Bars below this line were cut (top-k / top-p); drawn as a marker between bars. */
  cutoff?: number;
  /** Index of the training target, marked with a label. */
  target?: number;
}
```

`DistributionRenderer.tsx` draws one labelled horizontal bar per entry, with the value printed beside it. The chosen bar uses the `found` role and cut bars use `discarded`. It is added to the `View` union, `renderers/index.tsx` and `rolesInView` (`components/visualization/roles.ts`). Bars are listed in the order given; scenarios sort by probability and show at most 12 (the rest are summed into one "others" bar).

### `grid` heat

`GridView` cells may carry `heat?: number` (0–1). The renderer shades the cell's background by it, on top of the role styling, for attention weights, embedding values and similarity tables. Grids without `heat` render exactly as before.

## 3. Lessons

| Lesson | Knobs (fields; presets) | What the learner watches |
|---|---|---|
| Tokenization (BPE) | text, number of merges; presets: a corpus sentence, an unseen word, a misspelling | Character tokens merge pair by pair (`array`); the merge table with the applied merge highlighted (`grid`), in `panels` |
| Embeddings & Similarity | mode (compare two words, or nearest neighbours), word(s) | Each word's 8 numbers (`grid` with heat), the cosine worked out (dot product, lengths), neighbours ranked |
| Next-Token Prediction | prompt, tokens to generate (greedy) | Logits → softmax → `distribution`; the top word is appended to the prompt; repeat until `<end>` or the limit |
| Self-Attention | prompt (≤ 6 tokens), token in focus | Q·Kᵀ scores → ÷√d → causal mask → softmax (`grid` with heat) → weighted sum of V |
| The Transformer Block | prompt, token in focus | One token's vector through each stage (embed + position, attention, + residual, norm, MLP, + residual, norm, unembed), stage by stage in `panels` |
| Sampling | prompt, temperature, top-k, top-p, seed | The distribution reshaped by temperature, the cutoff marker, renormalised bars, then the seeded draw |
| Training & Loss | sentence, learning rate, steps | One context's bigram `distribution` moving toward the target word; loss and gradient as variables each step |

Each lesson has the usual content: overview, concept, how it works, pros and cons, applications, common mistakes, and a 4-question quiz with at least one `predict-next` question built from a real step, as in the Kubernetes lessons. Lesson text states where the toy differs from real models (word tokens, d = 8, one layer, one head, a bigram trainer).

## 4. Testing

Vitest, the same pattern as the other tracks:

- `bpe`: merges are deterministic for a fixed corpus; `decode(encode(x)) === x` for corpus text, unseen words and unseen characters.
- `tensor`: softmax sums to 1 and is stable for logits around 1000; autograd gradients match finite differences on a small expression.
- `model`: with the committed weights, `mat` has probability ≥ 0.5 after "the cat sat on the"; masked (future) positions get attention weight 0; every attention row sums to 1.
- `sample`: top-k keeps exactly k tokens; top-p keeps the smallest set reaching p; temperature 0.1 picks the argmax; the same seed always draws the same token.
- `bigram`: the loss after the default run is lower than at the start, and each step's gradient row sums to 0.
- `src/ai/contract.test.ts`, as `src/kubernetes/contract.test.ts` does: every AI lesson runs with random and garbage settings (number fields' ranges in its `RANGES`); runs stay within 200 steps, code lines are valid, runs repeat exactly, and out-of-range knobs give exactly one refusal step.
- Curriculum tests: `ai` has 23 topics in the order above, with the three groups, and the 7 How LLMs Work lessons are live.
- Renderers have no DOM tests in this repo: `DistributionRenderer` and grid `heat` are checked by hand in a browser, at phone width (375px) and in dark mode.
- `npm run check:bundle` stays under 600 kB: lesson content loads per lesson, and the weights live in the lesson chunks.

## Touch points

`src/types/lesson.ts` (`Category` gets `'ai'`), `src/types/visualization.ts` (`DistributionView`, grid `heat`), `src/lessons/curriculum.ts`, `src/lessons/labels.ts`, `src/lessons/meta/ai.ts`, `src/lessons/registry.ts`, the glob lists in `src/lessons/all.testutil.ts`, `src/lessons/split.test.ts` and `registry.ts`, `src/lessons/lessons.test.ts`, `renderers/index.tsx`, `rolesInView` in `components/visualization/roles.ts`, `src/lessons/ai/*.ts`, `src/ai/**`, `scripts/train-ai-model.ts`, and README.md and CLAUDE.md (the track list, the `View` kind count going from 17 to 18, and an `src/ai/` architecture entry).

## Out of scope

- Real model calls, multi-head attention, more than one layer, and byte-level BPE in the model.
- Training the transformer in the browser.
- A 2-D embedding scatter plot (similarity is shown as numbers and rankings).
- Phases 2 and 3 (their own specs).
