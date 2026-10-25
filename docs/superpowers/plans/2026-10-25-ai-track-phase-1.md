# AI Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth category, AI, with a tiny transparent language model (real BPE, a 1-layer transformer with committed weights, sampling, a live bigram trainer), a new `distribution` view and `grid` heat shading, and the 7 How LLMs Work lessons live (16 more topics as Coming soon).

**Architecture:** `src/ai/` (no React) holds the corpus, BPE, number helpers, a scalar autograd used only for training, the model's `forward` (which returns every intermediate), sampling and the bigram trainer. Each lesson is a scenario module in `src/ai/scenarios/` (`fooCode`, `fooSteps(values)`) used by the existing `form` input, as in the Kubernetes track. Weights are produced by an on-demand Vitest script and committed.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Tailwind 4, lucide-react, Oxlint. Node 24.

**Spec:** `docs/superpowers/specs/2026-10-25-ai-track-phase-1-design.md`

## Global Constraints

- Branch `ai-phase-1` in the `stepwise` folder (already created; the spec is committed as 30bdf54). No worktrees.
- `src/ai/` contains no React. All lesson text lives in `src/lessons/`.
- Entry points never throw on learner input. Unusable form values return one step through `refusal(title, why, view)` (`src/algorithms/form.ts`), read with `readInt` / `readChoice` / `readText`. The refusal view is `EMPTY` (an empty `distribution`, Task 8).
- Deterministic: the only randomness is `seeded(SEED)` from `src/utils/random.ts`, with `SEED = 7` for training and the learner's seed for sampling.
- Model: word tokens, 1 layer, 1 head, `D = 8`, `HIDDEN = 16`, `CONTEXT = 6`. Prompts are 1–6 known words; generation is 1–8 tokens and stops at `<end>` or the context length.
- Limits: BPE text 1–40 characters and 0–30 merges; top-k 1–`VOCAB.length`; at most 50 training steps; `MAX_STEPS = 200` steps per run.
- Numbers shown to the learner are rounded to 2 decimals (`fmt`); the engine keeps full precision.
- Code lines via `lineOf(code, snippet)` (`src/data-structures/shared.ts`), never hard-coded.
- AI lessons have no `complexity`, use `codeLabel: 'Pseudocode'`, and have 4–5 quiz questions of at least 3 types (`multiple-choice`, `code`, `predict-next`), at least one with a `view` taken from a real step.
- Lesson text says where the toy differs from real models: word tokens, d = 8, one layer, one head, a bigram trainer.
- Copy: plain, short sentences for beginners, explaining what happened and why with the run's actual values.
- Colours come only from CSS variables; roles only from `roles.ts`. Repeated UI becomes a component; component files export only components.
- Commit messages, PR titles and PR bodies contain no AI attribution (no `Co-Authored-By` trailer for an AI, no "Generated with" line).
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`.

## Rulings (where this plan narrows the spec)

- **Decimal knobs are `choice` fields.** `readInt` only reads whole numbers, and adding a decimal parser buys nothing. Temperature `['0.1', '0.5', '1', '1.5', '2']`, top-p `['0.5', '0.75', '0.9', '1']`, learning rate `['0.1', '0.5', '1', '2']`. So out-of-range decimals are refused by `readChoice`.
- **No "token in focus" knob.** Self-Attention shows the whole attention matrix and follows the **last** token for the weighted sum; the Transformer Block follows the last token, the one that predicts the next word.
- **Embedding words are `choice` fields over `VOCAB`**, so they can't be unknown. Prompts are `text` fields, read by `readPrompt`.
- **The training script is an on-demand Vitest file**, `scripts/train-ai-model.test.ts`, skipped unless `AI_TRAIN=1` (`npm run train:ai`). Node can't run `src/` directly because its imports have no extensions; Vitest resolves them.
- **The transformer trains with Adam** (lr 0.01), not plain gradient descent: the lesson never teaches the transformer's training, and Adam converges in far fewer epochs. The bigram trainer, which *is* taught, stays plain gradient descent.
- **The bigram gradient is closed-form** (p − one-hot), so the browser never loads the autograd; a test checks it against the autograd.
- **Layer norm has no gain or bias** (eps 1e-5).
- **Vectors are drawn as columns** (one column per word or stage, 8 rows), so grids fit a 375 px phone.
- **Extra touch points the spec missed:** `Header.tsx`, `SearchPalette.tsx` (`CATEGORY_ICON`), `Dashboard.tsx`, `Home.tsx`, `App.tsx` routes, `Catalog.tsx` blurb, `LessonPage.tsx` `CODE_COPY`, `roles.test.ts`.

## Review Focus

- **A prompt with capitals, extra spaces or punctuation** ("The  cat sat."): words are lowercased, and runs of spaces are allowed, but punctuation is refused with the known-word list. A trailing period must not throw. Pinned in Task 8 (`readPrompt`).
- **A prompt that is already 6 tokens long, asking for 8 more:** generation stops at the context length with a step saying why, not an index error. Pinned in Task 10.
- **BPE text with spaces at the ends, doubled spaces, or characters outside the corpus** (`"  zebra!  "`): `decode(encode(x)) === x` and no throw. Text containing `▁` is refused, because `▁` stands for a space. Pinned in Task 3.
- **Huge logits** (temperature 0.1 multiplies them by 10): softmax stays finite and sums to 1. Pinned in Task 4 and Task 6.
- **Top-p 1 with top-k = vocabulary size:** nothing is cut, no cutoff marker, and the draw still works. Pinned in Task 6.

---

## File map

| File | Responsibility |
|---|---|
| `src/ai/corpus.ts` | `CORPUS`, `VOCAB`, `END`, `tokenId`, `tokenize` |
| `src/ai/bpe.ts` | `learnMerges`, `encode`, `decode` |
| `src/ai/tensor.ts` | plain number helpers |
| `src/ai/autograd.ts` | `Value` (training only) |
| `src/ai/model.ts` | constants, `Weights`, `Forward`, `forward` |
| `src/ai/weights.ts` | generated, committed `WEIGHTS` |
| `src/ai/sample.ts` | `reshape`, `draw` |
| `src/ai/bigram.ts` | `trainBigram` |
| `src/ai/steps.ts` | `MAX_STEPS`, `EMPTY`, `fmt`, `readPrompt`, `distributionView`, `vectorGrid`, `matrixGrid` |
| `src/ai/scenarios/<id>.ts` (+ `.test.ts`) | one per lesson: `fooCode`, knob options, `fooSteps` |
| `src/ai/contract.test.ts` | every AI lesson over random and garbage settings |
| `scripts/train-ai-model.test.ts` | writes `src/ai/weights.ts` when `AI_TRAIN=1` |
| `src/components/visualization/renderers/DistributionRenderer.tsx` | the `distribution` view |
| `src/lessons/meta/ai.ts`, `src/lessons/ai/<id>.ts` | lesson metadata and content |

---

### Task 1: The `ai` category

**Files:**
- Modify: `src/types/lesson.ts:53` (`Category` gets `'ai'`), `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/registry.ts` (meta import + glob), `src/lessons/all.testutil.ts` (glob), `src/lessons/split.test.ts`, `src/lessons/lessons.test.ts`, `src/components/layout/Header.tsx`, `src/components/navigation/SearchPalette.tsx`, `src/pages/Dashboard.tsx:82`, `src/pages/Home.tsx:79`, `src/App.tsx:27-28`, `src/pages/Catalog.tsx`, `src/pages/LessonPage.tsx` (`CODE_COPY`)
- Create: `src/lessons/meta/ai.ts` (`export const aiMeta: LessonMeta[] = []`)

**Interfaces:**
- Produces: `Category` includes `'ai'`; `CATEGORY_TITLE.ai === 'AI'`; route `/ai` and `/ai/:lessonId`; `aiMeta` in `meta/ai.ts`, which later tasks append to.

- [ ] **Step 1: Write the failing tests** in `src/lessons/lessons.test.ts`, next to the Kubernetes ones:

```ts
it('lists the AI course in order', () => {
  expect(topicsIn('ai').map((t) => t.id)).toEqual([
    'tokenization', 'embeddings', 'next-token-prediction', 'self-attention', 'transformer-block', 'sampling', 'training-loss',
    'chat-templates', 'context-window', 'kv-cache', 'structured-output', 'vector-search', 'rag', 'function-calling', 'evals',
    'agent-loop', 'agent-memory', 'planning-decomposition', 'reflection', 'multi-agent', 'mcp', 'prompt-injection-guardrails', 'human-in-the-loop',
  ]);
  expect(topicsIn('ai').map((t) => t.group)).toEqual([
    ...Array(7).fill('How LLMs Work'), ...Array(8).fill('Building with LLMs'), ...Array(8).fill('AI Agents'),
  ]);
});
```

Titles come from the spec's curriculum table, word for word. Also update `split.test.ts`'s `meta/` file list (it now includes `ai.ts`) and the `complexity` condition in `lessons.test.ts:215` (add `'ai'`).

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lessons` → FAIL (`ai` has no topics; split test lists 5 files).

- [ ] **Step 3: Add the category everywhere in the Files list.** Copy:
  - Header link `{ to: '/ai', label: 'AI' }`, after Kubernetes.
  - Search icon: lucide `Brain`.
  - Catalog blurb: `'How large language models work, from the first token to AI agents. Each lesson runs a tiny model on your input, so you can see every number it computes.'`
  - `CODE_COPY.ai`: `{ title: 'Pseudocode', label: 'Pseudocode', intro: 'The steps the tiny model takes, as short pseudocode. In the visualization above, the highlighted line follows the step that is running.' }`
  - Home progress bar `label="AI"`.
  - Glob patterns become `{data-structures,algorithms,sql,microservices,kubernetes,ai}`.

- [ ] **Step 4: Run the checks.** `npm run typecheck && npm run lint && npm test` → PASS. The `/ai` catalog shows 23 Coming-soon topics in `npm run dev`.

- [ ] **Step 5: Commit** `git commit -m "AI category: curriculum, routes and navigation"`

### Task 2: `distribution` view and grid heat

**Files:**
- Modify: `src/types/visualization.ts` (`DistributionView`, `GridCell`, `View` union), `src/components/visualization/renderers/GridRenderer.tsx`, `src/components/visualization/renderers/index.tsx`, `src/components/visualization/roles.ts` (`rolesInView`), `src/components/visualization/roles.test.ts`
- Create: `src/components/visualization/renderers/DistributionRenderer.tsx`

**Interfaces:**
- Produces: `DistributionView` exactly as in the spec (§2); `GridCell = Cell & { heat?: number }`, and `GridView.rows[].cells: (GridCell | null)[]`.

- [ ] **Step 1: Write the failing test** in `roles.test.ts`: `rolesInView({ kind: 'distribution', bars: [{ id: 'a', label: 'a', value: 0.6, role: 'found' }, { id: 'b', label: 'b', value: 0.4, role: 'discarded' }] })` equals `['found', 'discarded']`.

- [ ] **Step 2: Run it to see it fail.** `npx vitest run src/components/visualization/roles.test.ts` → FAIL (type error / unhandled kind).

- [ ] **Step 3: Implement.**
  - `rolesInView` case: `view.bars.map((b) => b.role)`.
  - `DistributionRenderer`: optional title, then one row per bar with a fixed-width label column, a bar whose width is `value / max` of the bars (role fill via `roleBoxStyle`), and the value as `fmt`-style 2 decimals. A dashed rule with the text "cut below" goes before bar `cutoff` when it is set and is less than `bars.length`. A "target" tag goes beside bar `target`. Plain HTML, no motion.
  - Grid heat: when `cell.heat` is set and the role is `default`, the background is `color-mix(in oklab, var(--accent) ${Math.round(heat * 70)}%, var(--surface))` and the text is `var(--accent-fg)` once heat ≥ 0.5. The style still keeps `boxShadow`, as `gridCellStyle` requires.

- [ ] **Step 4: Run the checks.** `npm run typecheck && npm run lint && npm test` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Distribution view and heat-shaded grid cells"`

### Task 3: Corpus and BPE

**Files:**
- Create: `src/ai/corpus.ts`, `src/ai/bpe.ts`, `src/ai/bpe.test.ts`

**Interfaces:**
- Produces:
  - `CORPUS: readonly string[]`, `END = '<end>'`, `VOCAB: readonly string[]` (corpus words in order of first appearance, then `END`).
  - `tokenId(word: string): number | undefined`.
  - `tokenize(sentence: string): number[]` (corpus sentences only; used by training).
  - `interface Merge { pair: [string, string]; count: number }`, `learnMerges(corpus: readonly string[], n: number): Merge[]`.
  - `encode(text: string, merges: readonly Merge[]): { tokens: string[]; trace: { merge: number; tokens: string[] }[] }`, `decode(tokens: readonly string[]): string`.
  - `SPACE = '▁'`.

- [ ] **Step 1: Write `corpus.ts`.** `CORPUS` is exactly these 30 sentences, in this order:

```
the cat sat on the mat · the dog sat on the rug · a cat slept on the mat · a dog slept on the rug · the cat napped on the mat · the dog napped on the rug ·
the cat chased the bird · the dog chased the ball · the bird sang in the tree · a bird sat in the tree · the cat ate the fish · the dog ate the bone ·
the cat saw the dog · the dog saw the cat · a cat ran to the mat · a dog ran to the park · the bird flew to the tree · the dog played in the park ·
the cat played with the ball · the bird ate the seed · the cat sat by the door · the dog sat by the door · a cat is on the mat · a dog is in the park ·
the bird is in the tree · the cat likes the fish · the dog likes the bone · the bird likes the seed · the fish swam in the pond · a fish is in the pond
```

- [ ] **Step 2: Write the failing tests** in `bpe.test.ts`:
  - `VOCAB` has 34 entries, starts with `'the', 'cat', 'sat'` and ends with `END`.
  - `learnMerges(CORPUS, 10)` is the same twice. Its first merge is the most frequent pair in the corpus (count it in the test with a direct pair count). Counts never increase from one merge to the next.
  - No merge's right half starts with `SPACE`.
  - Round trip: for each of `'the cat'`, `'  zebra!  '`, `'a  b'`, `'catdog'`, `decode(encode(x, learnMerges(CORPUS, 30)).tokens) === x`.
  - `encode('the cat', merges).trace` has one entry per merge that changed the tokens, and each entry's `tokens` is shorter than the one before.
  - `encode('the cat', learnMerges(CORPUS, 0)).tokens` is the characters `['t','h','e','▁','c','a','t']`.

- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/ai/bpe.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement `bpe.ts`.** Spaces become `SPACE` and stay their own symbols. A pair can merge only when its right half does not start with `SPACE`, so `SPACE` only ever starts a token. Pairs are counted within each sentence (sentences are not joined). Ties go to the higher count, then the lower `left + '\u0000' + right` in JS string order. `decode` joins the tokens and turns `SPACE` back into `' '`.

- [ ] **Step 5: Run the checks.** `npx vitest run src/ai` → PASS, then typecheck and lint.

- [ ] **Step 6: Commit** `git commit -m "AI engine: toy corpus and byte-pair encoding"`

### Task 4: Number helpers and autograd

**Files:**
- Create: `src/ai/tensor.ts`, `src/ai/autograd.ts`, `src/ai/tensor.test.ts`

**Interfaces:**
- Produces:
  - `tensor.ts`: `type Vec = number[]`, `type Mat = number[][]` (rows). `dot(a, b)`, `add(a, b)`, `scale(a, k)`, `matVec(m: Mat, v: Vec): Vec` (m has `out` rows of `in` numbers), `transpose(m)`, `softmax(v: Vec): Vec` (max-subtracted; `-Infinity` entries give 0), `layerNorm(v: Vec): Vec` (no gain or bias, eps 1e-5), `relu(v)`, `cosine(a, b)`, `argmax(v)` (lowest index on ties).
  - `autograd.ts`: `class Value { data: number; grad: number; constructor(data: number); add(o: Value | number); mul(o: Value | number); neg(); sub(o); div(o); exp(); log(); relu(); pow(k: number); backward(): void }`. `backward` runs over a topological order without recursion (graphs get deep).

- [ ] **Step 1: Write the failing tests:**
  - `softmax([1000, 1000, 999])` is finite, sums to 1 within 1e-12, and `[0]` equals `[1]`.
  - `softmax([0, -Infinity])` is `[1, 0]`.
  - `cosine([1, 0], [0, 1]) === 0` and `cosine([2, 2], [1, 1]) ≈ 1`.
  - `layerNorm([1, 2, 3])` has mean ≈ 0 and variance ≈ 1.
  - Autograd vs finite differences: for `f(a, b) = log(exp(a·b) + relu(a − b)) / b²` at `a = 0.7, b = −1.3` (relu is 0 there; also check at `a = 1.5, b = 0.4`), `a.grad` and `b.grad` after `backward()` match central differences with h = 1e-6 within 1e-5.
  - `backward` on a chain of 20,000 `add`s does not overflow the stack.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/ai/tensor.test.ts` → FAIL.

- [ ] **Step 3: Implement** both files to the signatures above.

- [ ] **Step 4: Run the checks.** `npx vitest run src/ai` → PASS, then typecheck and lint.

- [ ] **Step 5: Commit** `git commit -m "AI engine: number helpers and a scalar autograd"`

### Task 5: The model, the training script and the committed weights

**Files:**
- Create: `src/ai/model.ts`, `src/ai/weights.ts` (generated), `src/ai/model.test.ts`, `scripts/train-ai-model.test.ts`
- Modify: `package.json` (`"train:ai": "AI_TRAIN=1 vitest run scripts/train-ai-model.test.ts"`)

**Interfaces:**
- Consumes: Task 3 `VOCAB`, `END`, `tokenize`, `CORPUS`; Task 4 helpers and `Value`; `seeded` from `src/utils/random.ts`.
- Produces:
  - `D = 8`, `HIDDEN = 16`, `CONTEXT = 6`, `SEED = 7`.
  - `interface Weights { tokenEmbed: Mat /* VOCAB×D */; posEmbed: Mat /* CONTEXT×D */; wq: Mat; wk: Mat; wv: Mat; wo: Mat /* D×D */; w1: Mat /* HIDDEN×D */; b1: Vec; w2: Mat /* D×HIDDEN */; b2: Vec; unembed: Mat /* VOCAB×D */; bUnembed: Vec }`.
  - `interface Forward { tokens: number[]; x: Mat /* embed + pos */; q: Mat; k: Mat; v: Mat; scores: Mat /* q·k */; scaled: Mat /* ÷√D */; masked: Mat /* -Infinity above the diagonal */; weights: Mat /* softmax rows */; attn: Mat /* (weights·v)·woᵀ */; resid1: Mat; norm1: Mat; mlp: Mat; resid2: Mat; norm2: Mat; logits: Mat; probs: Mat }`. Every `Mat` here has one row per position.
  - `forward(tokens: number[], w: Weights = WEIGHTS): Forward` (1 ≤ tokens.length ≤ CONTEXT; callers validate).
  - `WEIGHTS: Weights` from `weights.ts`.

- [ ] **Step 1: Write the training script** `scripts/train-ai-model.test.ts`, as `it.skipIf(!process.env.AI_TRAIN)('trains the tiny model and writes src/ai/weights.ts', …, 300_000)`:
  - Initialise every weight uniformly in ±0.3 from `seeded(SEED)`, in the field order of `Weights`, and biases at 0.
  - The forward pass is in `Value`s and mirrors `forward` stage for stage.
  - Data: each corpus sentence's tokens plus `END`. Inputs are the first ≤ `CONTEXT` tokens and targets the next ones. The loss is the mean cross-entropy over every position of every sentence.
  - Adam (lr 0.01, β1 0.9, β2 0.999), 400 full-batch epochs, or fewer if the loss is below 0.6.
  - Round every weight to 3 decimals and write `src/ai/weights.ts` (`// Generated by npm run train:ai. Do not edit.` header, `export const WEIGHTS: Weights = {…}`).
  - Parity check: the plain `forward` on the rounded weights gives the same mean loss as the `Value` forward on the rounded weights, within 1e-6.
  - Print the final loss and elapsed seconds. It must finish in under 5 minutes; if it doesn't, lower the epoch count and say so in the commit.

- [ ] **Step 2: Write the failing model tests** in `model.test.ts`:
  - `forward(ids('the cat sat on the'))` gives `probs.at(-1)[tokenId('mat')] ≥ 0.5`.
  - For every prompt in `['the cat sat on the', 'the dog', 'a bird sat in the tree']` (the last is 6 tokens): every row of `weights` sums to 1 within 1e-9, and `weights[i][j] === 0` for every j > i.
  - `resid1[i] === x[i] + attn[i]` (elementwise, within 1e-12).
  - Embeddings carry meaning: `cosine(E.cat, E.dog) > cosine(E.cat, E.on)`, where `E.word = WEIGHTS.tokenEmbed[tokenId(word)]`.
  - Running the training script twice writes the same file. Check this by hand in Step 4 with `git diff --exit-code src/ai/weights.ts`; it doesn't run in the default suite.

- [ ] **Step 3: Implement `model.ts`**, then run `npm run train:ai` to generate `weights.ts`.

- [ ] **Step 4: Run the checks.** `npx vitest run src/ai/model.test.ts` → PASS. Run `npm run train:ai` again → `git diff --exit-code src/ai/weights.ts` exits 0. If the `mat` or `cat/dog` bar fails, change only the epoch count or the init range, retrain, and record the change in the commit. Then typecheck, lint and `npm test` (the script shows as one skipped test).

- [ ] **Step 5: Commit** `git commit -m "AI engine: 1-layer transformer, training script and committed weights"`

### Task 6: Sampling

**Files:**
- Create: `src/ai/sample.ts`, `src/ai/sample.test.ts`

**Interfaces:**
- Produces:
  - `interface Reshaped { scaled: Vec /* softmax(logits / T) */; order: number[] /* ids by scaled prob, desc, ties → lower id */; topKCut: number[]; topPCut: number[]; final: Vec /* renormalised, 0 for cut ids */ }`.
  - `reshape(logits: Vec, o: { temperature: number; topK: number; topP: number }): Reshaped`. Top-k runs first; top-p then keeps the smallest prefix of the remaining order whose `scaled` sum reaches p, and always keeps at least 1.
  - `draw(probs: Vec, rng: () => number): number`: cumulative sum in id order; the first id whose cumulative sum is above `rng()`; falls back to the last non-zero id.

- [ ] **Step 1: Write the failing tests**, on logits `L = [2, 1, 0.5, 0.5, -1]`:
  - Top-k 2 cuts exactly ids `[2, 3, 4]`.
  - Top-p 0.75 at T = 1 keeps the smallest prefix whose sum reaches 0.75 (compute the expected prefix in the test from `softmax(L)`).
  - Top-k = 5 with top-p = 1 cuts nothing.
  - `final` sums to 1.
  - At T = 0.1, `scaled[0] > 0.99`.
  - At T = 2, `max(scaled)` is below `max(softmax(L))`.
  - `draw(final, seeded(3))` is the same twice, and `draw([0, 1, 0], seeded(1)) === 1`.
  - Over 2,000 draws from `seeded(9)` on `[0.5, 0.3, 0.2]`, each frequency is within 0.05 of its probability.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/ai/sample.test.ts` → FAIL.

- [ ] **Step 3: Implement** `sample.ts`.

- [ ] **Step 4: Run the checks.** `npx vitest run src/ai` → PASS, then typecheck and lint.

- [ ] **Step 5: Commit** `git commit -m "AI engine: temperature, top-k and top-p sampling"`

### Task 7: Bigram trainer

**Files:**
- Create: `src/ai/bigram.ts`, `src/ai/bigram.test.ts`

**Interfaces:**
- Produces:
  - `interface BigramStep { prev: number; next: number; before: Vec /* probs of row prev before the update */; loss: number; grad: Vec; after: Vec }`.
  - `trainBigram(sentence: number[], lr: number, steps: number): { steps: BigramStep[]; table: Mat }`. The table starts at all zeros (`VOCAB.length` square). Step i trains pair `i mod (sentence.length − 1)`. The sentence includes `END`. `grad = softmax(row) − oneHot(next)`, and `row -= lr * grad`.

- [ ] **Step 1: Write the failing tests:**
  - The first step's loss is `Math.log(VOCAB.length)` (uniform start).
  - Every `grad` sums to 0 within 1e-12.
  - The loss on the second visit to pair 0 is lower than on the first.
  - `after[next] > before[next]` on every step.
  - Cross-check: for one row, building `-log(softmax(row)[next])` with `Value` and calling `backward()` gives `grad` within 1e-9.
  - `trainBigram` never mutates its input.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/ai/bigram.test.ts` → FAIL.

- [ ] **Step 3: Implement** `bigram.ts` (uses `tensor.ts` only; the autograd is used only in the test).

- [ ] **Step 4: Run the checks.** `npx vitest run src/ai` → PASS, then typecheck and lint.

- [ ] **Step 5: Commit** `git commit -m "AI engine: live bigram trainer"`

### Task 8: Step helpers and the AI contract test

**Files:**
- Create: `src/ai/steps.ts`, `src/ai/steps.test.ts`, `src/ai/contract.test.ts`

**Interfaces:**
- Consumes: `Read`, `refusal` (`src/algorithms/form.ts`); Task 3 `VOCAB`, `tokenId`; Task 5 `CONTEXT`.
- Produces:
  - `MAX_STEPS = 200`, `EMPTY: DistributionView = { kind: 'distribution', bars: [] }`.
  - `fmt(n: number): string`: 2 decimals, `-Infinity` → `'−∞'`, and `-0.00` → `'0.00'`.
  - `readPrompt(values, name, label): Read<number[]>`: lowercases and splits on runs of whitespace. 1–`CONTEXT` words are allowed. An unknown word is refused with `` `"${word}" is not in this model's vocabulary. It knows: ${VOCAB.join(', ')}.` ``.
  - `distributionView(probs: Vec, o?: { title?: string; chosen?: number; cut?: ReadonlySet<number>; target?: number }): DistributionView`:
    - kept ids first, then cut ids, each by probability desc (ties → lower id);
    - the first 12 bars, plus one `others` bar (id `'others'`, the sum of the rest) when there are more;
    - roles: `found` for `chosen`, `discarded` for cut ids, else `default`;
    - `cutoff` = the number of kept bars shown, set only when `cut` has entries;
    - `target` = the bar index of `o.target`, when it is shown.
  - `vectorGrid(columns: { label: string; values: Vec }[], idPrefix: string): GridView`: one row per dimension (`d0`…`d7`), one column per entry, values via `fmt`, heat `|v| / max|v|` over the whole grid.
  - `matrixGrid(m: Mat, rowLabels: string[], colLabels: string[], idPrefix: string, heat: 'abs' | 'value'): GridView`. `-Infinity` cells show `'−∞'` with heat 0.

- [ ] **Step 1: Write the failing tests** in `steps.test.ts`:
  - `readPrompt({ p: 'The  cat ' }, 'p', 'Prompt')` → ok, `[tokenId('the'), tokenId('cat')]`.
  - `'the cat.'` → not ok, and the why names `"cat."`.
  - `''` and a 7-word prompt → not ok.
  - `distributionView` on 34 probabilities gives 13 bars, with `others` last.
  - `cut` of the last 30 ids gives `cutoff === 4` and roles `discarded` after it.
  - `fmt(-0.001) === '0.00'`.

  Write `contract.test.ts` on the shape of `src/kubernetes/contract.test.ts`:
  - over `allLessons.filter((l) => l.category === 'ai')`, with the same `valueFor`, `GARBAGE`, `RANGES` and seeds;
  - `checkSteps`: 1 ≤ steps ≤ `MAX_STEPS`, every `codeLine` in range, every `distribution` view's bar ids unique, and every `grid` heat within 0–1;
  - garbage in a non-text field gives exactly 1 step;
  - the same values give equal steps;
  - `labels its code as pseudocode`.

  Start `RANGES` empty; each lesson task adds its entry. With no AI lessons yet, guard `describe.each` with `if (lessons.length)`; Task 9 removes the guard.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/ai/steps.test.ts` → FAIL.

- [ ] **Step 3: Implement** `steps.ts`.

- [ ] **Step 4: Run the checks.** `npx vitest run src/ai` → PASS, then typecheck and lint.

- [ ] **Step 5: Commit** `git commit -m "AI engine: step helpers and lesson contract test"`

### Tasks 9–15: the seven lessons

Each lesson task has the same shape. The table below gives what is specific to each one.

**Files (per lesson `<id>`):**
- Create: `src/ai/scenarios/<id>.ts`, `src/ai/scenarios/<id>.test.ts`, `src/lessons/ai/<id>.ts`
- Modify: `src/lessons/meta/ai.ts` (append the entry, in curriculum order), `src/ai/contract.test.ts` (`RANGES`)

**Steps (per lesson):**

- [ ] **Step 1: Write the failing scenario test(s)** from the table's "Teaching moment" column, using the scenario's exported `fooSteps`.
- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/ai/scenarios/<id>.test.ts` → FAIL.
- [ ] **Step 3: Write the scenario module.** It exports `<camelId>Code` (short pseudocode), its option lists, and `<camelId>Steps(values): Step[]`. Each step:
  - has a `title` with real values, a `why`, a `next` where useful, and `variables`;
  - gets its `codeLine` from `lineOf`;
  - stays within `MAX_STEPS`.

  Unusable values return `refusal(<"Can't …" title>, why, EMPTY)`.
- [ ] **Step 4: Write the lesson content** `src/lessons/ai/<id>.ts`:
  - a `form` visualization with the table's fields and presets (first preset = defaults), `codeLabel: 'Pseudocode'`;
  - all content sections and a quiz per the Global Constraints, with one `predict-next` question whose `view` comes from a real step;
  - the meta entry: title from the curriculum, a one-line description, keywords, prerequisites as in the table.
- [ ] **Step 5: Run the checks.** `npx vitest run src/ai src/lessons` → PASS (the contract and `lessons.test.ts` now run this lesson), then typecheck and lint. Delete `node_modules/.vitest-cache` if a test reports "No content module for <id>".
- [ ] **Step 6: Commit** `git commit -m "AI lesson: <Title>"`

| Task | Lesson (`id`, prerequisites) | Fields (name: type, sample, options/range) · presets | Steps and views | Teaching moment (scenario tests) |
|---|---|---|---|---|
| 9 | `tokenization` · [] | `text`: text, `the cat sat`, 1–40 chars, no `▁` · `merges`: number, `20`, 0–30 · presets: "A corpus sentence" (defaults), "An unseen word" (`zebra`), "A misspelling" (`teh cta`) | Step 1: the characters. One step per merge that applied ("merge `t` + `h` → `th`, seen 41 times in the corpus"). A final step with the token count vs the character count. `panels`: token `array` (ids stable per token position) + merge-table `grid` (rows `left + right → merged`, count; the applied row `active`) | The defaults end with fewer tokens than characters. `zebra` keeps unseen letters as single tokens. `merges: 0` gives exactly 2 steps (characters + summary). The text `a▁b` is refused. Removes the contract guard from Task 8. |
| 10 | `embeddings` · [`tokenization`] | `mode`: choice, `compare`, [`compare`, `nearest`] · `a`: choice, `cat`, `VOCAB` without `END` · `b`: choice, `dog`, same · presets: "Cat vs dog" (defaults), "Cat vs on" (b = `on`), "Nearest to cat" (mode `nearest`) | Compare: both vectors (`vectorGrid`), the dot product (each dimension's product in a third column), the two lengths, then cosine = dot / (|a|·|b|). Nearest: the vector of `a`, then a `matrixGrid` ranking every other word by cosine (top 8, heat `value`), the closest `found` | Compare: the last step's `variables.cosine` equals `fmt(cosine(...))`. Nearest: the ranking is sorted desc and omits `a`. `a === b` in compare mode gives cosine `1.00`. |
| 11 | `next-token-prediction` · [`embeddings`] | `prompt`: text, `the cat sat on the`, ≤ 6 words · `count`: number, `2`, 1–8 · presets: defaults, "Start of a sentence" (`the`, 5), "A dog" (`the dog sat on the`, 1) | Per generated token: logits (`distribution` of raw logits as values, title "logits"), then softmax (`distribution` of probs, `chosen` = argmax), then "append `mat`". Then a stop step: at `<end>` ("the model predicts the end of the sentence") or at `CONTEXT` ("the prompt now fills all 6 positions of the context") | The defaults: the first appended word is `mat`. A 6-word prompt with `count: 8` gives exactly 1 stop step after its prediction steps, and no throw. Stops at `<end>` when it is chosen. |
| 12 | `self-attention` · [`next-token-prediction`] | `prompt`: text, `the cat sat on the`, ≤ 6 words · presets: defaults, "Two words" (`the dog`), "Six words" (`a bird sat in the tree`) | Steps: `x` → q, k, v for the last token (`vectorGrid`) → `scores` (`matrixGrid`, heat `abs`) → `scaled` ("÷ √8 = 2.83") → `masked` (`−∞` above the diagonal) → `weights` (heat `value`) → the weighted sum for the last token (columns: each `v` scaled by its weight, then the sum) | The masked step's grid has `'−∞'` in every cell above the diagonal. The weights step's rows sum to 1.00 (check `variables` or cell values). Its numbers equal `forward(...)` rounded with `fmt`. A one-word prompt gives a 1×1 matrix with weight `1.00`. |
| 13 | `transformer-block` · [`self-attention`] | `prompt`: text, `the cat sat on the`, ≤ 6 words · presets: defaults, "A dog" (`the dog sat on the`), "One word" (`the`) | One step per stage, following the last token, as a `vectorGrid` of [before, after] (residual steps: [x, attn, x + attn]): embed + position, attention, + residual, norm, MLP, + residual, norm, then unembed as a `distribution` with `chosen` = argmax | The residual step's third column equals the sum of the first two, cell by cell. The final `chosen` bar is `forward(...)`'s argmax (`mat` for the defaults). There are exactly 8 stage steps. |
| 14 | `sampling` · [`next-token-prediction`] | `prompt`: text, `the cat sat on the` · `temperature`: choice, `1`, ['0.1','0.5','1','1.5','2'] · `topK`: number, `34`, 1–34 · `topP`: choice, `1`, ['0.5','0.75','0.9','1'] · `seed`: number, `1`, 1–99 · presets: "No limits" (defaults), "Cold" (T 0.1), "Hot" (T 2), "Top-k 3" (topK 3), "Top-p 0.75" (topP 0.75) | Steps: raw probs (T = 1) → after temperature → top-k cut (`cut`, `cutoff`) → top-p cut → renormalised → the draw ("the seeded random number 0.42 lands in `mat`'s slice"), `chosen` | `topK: 1` always draws the argmax, for seeds 1–20. "Hot" has a lower max probability than "Cold". With no limits, no step has a `cutoff`. The same seed gives the same draw. |
| 15 | `training-loss` · [`next-token-prediction`] | `sentence`: choice, `the cat sat on the mat`, the 30 `CORPUS` sentences · `lr`: choice, `0.5`, ['0.1','0.5','1','2'] · `steps`: number, `20`, 1–50 · presets: defaults, "Small steps" (lr 0.1), "Big steps" (lr 2), "One step" (steps 1) | One step per training step: the context word's `distribution` (`before` probs, `target` = next word), then after the update (`after`, the target `found`). Variables: `loss`, `p(target)`, `grad(target)`, `lr`. Then a summary step: the loss at the first visit of each pair vs the last | The summary's last-visit loss is below the first-visit loss for the defaults. Step 1's loss shows `fmt(Math.log(34))` = `3.53`. `lr 2` has a lower final loss than `lr 0.1` over 20 steps. |

Ranges for `RANGES` in `contract.test.ts`: `tokenization: { merges: [0, 30] }`, `'next-token-prediction': { count: [1, 8] }`, `sampling: { topK: [1, 34], seed: [1, 99] }`, `'training-loss': { steps: [1, 50] }`.

The tasks follow curriculum order, so every prerequisite is already registered and `meta/ai.ts` stays in learning order. Task 9 also adds `'ai'` to `split.test.ts`'s per-category content check. Task 15 adds `it('has the 7 How LLMs Work lessons live')` to `lessons.test.ts`: `lessonsIn('ai').map((l) => l.id)` equals the first 7 `topicsIn('ai')` ids.

### Task 16: Docs and final checks

**Files:**
- Modify: `README.md` (intro sentence, the category list with "AI (23)" and its 7 live titles, a features bullet, a short "How to add an AI lesson" section modelled on the Kubernetes one, the tests list), `CLAUDE.md` (the intro sentence, `View` kinds 17 → 18 with `distribution`, an **AI** architecture bullet for `src/ai/`, the `npm run train:ai` command, the `src/ai/contract.test.ts` bullet, `ai/` in the "contain no React" line)

- [ ] **Step 1: Update both docs** as listed.
- [ ] **Step 2: Run the full gate.** `npm run lint && npm test && npm run build:pages && npm run check:bundle` → all pass, and the first-load JS is under 600 kB. Record the size.
- [ ] **Step 3: Check in the browser** (`npm run dev`), light and dark, at 375 px and desktop:
  - each of the 7 lessons runs every preset;
  - the distribution bars and the cut marker are readable;
  - heat cells are readable in both themes;
  - nothing scrolls sideways outside the stage;
  - the header's AI link sits correctly at the `lg` breakpoint.
- [ ] **Step 4: Commit** `git commit -m "Docs: AI track phase 1"`
