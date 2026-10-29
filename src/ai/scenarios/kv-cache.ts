import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ArrayView, GridView, Step, View } from '../../types/visualization';
import { END, tokenId, VOCAB } from '../corpus';
import { EMPTY_CACHE, extend, type KvCache } from '../kvcache';
import { CONTEXT, forward } from '../model';
import { EMPTY, fmt, readPrompt, vectorGrid } from '../steps';
import { argmax, type Mat, type Vec } from '../tensor';

export const kvCacheCode = `cache = { K: [], V: [] }
for (const token of tokens) {   // the prompt, then each new token
  k = Wk · x(token);  v = Wv · x(token)
  cache.K.push(k); cache.V.push(v)   // only the new row is computed
  // without a cache: K = Wk · X and V = Wv · X for every token, every time
  weights = softmax(q · cache.K / √8)
  next = argmax(model.rest(weights · cache.V))
  if (next === END || tokens.length === 6) break
  tokens.push(next)
}`;

export const MAX_NEW = 8;
export const ON_OFF = ['on', 'off'];

const line = (snippet: string) => lineOf(kvCacheCode, snippet);
const words = (ids: number[]) => ids.map((t) => VOCAB[t]!).join(' ');

/** One column per position (8 rows), so the grid fits a phone; `fresh` columns were computed in this step. */
function cacheGrid(m: Mat, tokens: number[], fresh: (i: number) => boolean, idPrefix: string): GridView {
  const grid = vectorGrid(m.map((values, i) => ({ label: VOCAB[tokens[i]!]!, values })), idPrefix);
  for (const row of grid.rows) row.cells.forEach((cell, i) => cell && fresh(i) && (cell.role = 'active'));
  return grid;
}

function tokenRow(tokens: number[], promptLength: number): ArrayView {
  return { kind: 'array', cells: tokens.map((t, i) => ({ id: `t-${i}`, value: VOCAB[t]!, role: i >= promptLength ? 'found' : 'default' })) };
}

export function kvCacheSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run the model on this prompt", why, EMPTY);
  const prompt = readPrompt(values, 'prompt', 'Prompt');
  if (!prompt.ok) return fail(prompt.why);
  const count = readInt(values, 'count', 'Words to generate', { min: 1, max: MAX_NEW });
  if (!count.ok) return fail(count.why);
  const mode = readChoice(values, 'cache', 'Cache', ON_OFF);
  if (!mode.ok) return fail(mode.why);

  const cached = mode.value === 'on';
  const tokens = [...prompt.value];
  const promptLength = tokens.length;
  const steps: Step[] = [];
  let cache: KvCache = EMPTY_CACHE;
  let withCache = 0;
  let withoutCache = 0;
  let generated = 0;
  let stop: Pick<Step, 'title' | 'why'> | undefined;
  for (let fed = 0; fed < tokens.length; fed++) {
    const token = tokens[fed]!;
    const prefix = tokens.slice(0, fed + 1);
    withCache += 1;
    withoutCache += prefix.length;
    let probs: Vec;
    let k: Mat;
    let v: Mat;
    if (cached) {
      const out = extend(cache, token);
      cache = out.cache;
      ({ probs } = out);
      ({ k, v } = cache);
    } else {
      const full = forward(prefix);
      probs = full.probs.at(-1)!;
      ({ k, v } = full);
    }
    const next = argmax(probs);
    const fresh = (i: number) => !cached || i === fed;
    const view: View = {
      kind: 'panels',
      panels: [
        { label: cached ? 'K cache' : 'K, recomputed', view: cacheGrid(k, prefix, fresh, `k-${fed}`) },
        { label: cached ? 'V cache' : 'V, recomputed', view: cacheGrid(v, prefix, fresh, `v-${fed}`) },
      ],
    };
    steps.push({
      title: cached
        ? `Feed ${VOCAB[token]}: compute 1 new K and V row, reuse ${fed} cached; predicts ${VOCAB[next]} (${fmt(probs[next]!)})`
        : `Feed ${VOCAB[token]}: recompute all ${prefix.length} K and V rows; predicts ${VOCAB[next]} (${fmt(probs[next]!)})`,
      why: cached
        ? 'Earlier tokens never change, and with the causal mask they never look ahead, so their keys and values stay the same. The cache keeps them, and each new token adds one row.'
        : 'Without a cache, every step multiplies every token by Wk and Wv again, although the old rows come out exactly the same.',
      codeLine: cached ? line('cache.K.push(k)') : line('// without a cache'),
      variables: { token: VOCAB[token]!, 'rows computed': cached ? withCache : withoutCache },
      view,
    });
    if (fed < promptLength - 1) continue;
    if (next === tokenId(END)) {
      stop = { title: `Stop: the model predicted ${END}`, why: `Every training sentence ended with ${END}, so the model learned when a sentence is finished.` };
      break;
    }
    if (tokens.length === CONTEXT) {
      stop = { title: `Stop: the context is full at ${CONTEXT} tokens`, why: `This model has ${CONTEXT} positions, so there is no room to feed ${VOCAB[next]}. A real KV cache also has a limit: its memory grows with every token.` };
      break;
    }
    tokens.push(next);
    generated++;
    // The last word is predicted, never fed: nothing comes after it.
    if (generated === count.value) break;
  }
  const totals = { 'with cache': withCache, 'without cache': withoutCache };
  if (stop) steps.push({ ...stop, codeLine: line('if (next === END'), variables: totals, view: tokenRow(tokens, promptLength) });
  steps.push({
    title: `${tokens.length > promptLength ? `Generated "${words(tokens.slice(promptLength))}"` : 'Generated nothing'}: ${withCache} K/V rows with a cache, ${withoutCache} without`,
    why: `Feeding ${withCache} positions computes ${withCache} rows with the cache, but 1 + 2 + … + ${withCache} = ${withoutCache} without it. The output is the same either way; the cache only saves work, at the cost of memory for every cached row.`,
    next: 'Speed is one part of building with LLMs; getting output in an exact shape is another. The next lesson constrains the model to a schema.',
    codeLine: line('cache = { K: [], V: [] }'),
    variables: totals,
    view: tokenRow(tokens, promptLength),
  });
  return steps;
}
