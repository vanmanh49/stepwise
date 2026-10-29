import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ArrayView, Role, Step } from '../../types/visualization';
import { VOCAB } from '../corpus';
import { forward } from '../model';
import { distributionView, EMPTY, fmt, readPrompt } from '../steps';
import { argmax } from '../tensor';

export const contextWindowCode = `tokens = tokenize(text)
if (tokens.length > window) {
  if (strategy === 'oldest') kept = tokens.slice(-window)   // drop the oldest
  else kept = [...tokens.slice(0, 2), ...tokens.slice(-(window - 2))]   // keep the start
} else kept = tokens
probs = model(kept)   // positions numbered from 0 again
next = argmax(probs)`;

export const MAX_WORDS = 20;
export const STRATEGIES = ['oldest', 'first'];
/** The toy predicts <end> after any 6 tokens (every training sentence ends by then), so windows stop at 5. */
export const WINDOW = { min: 3, max: 5 };
const KEEP_FIRST = 2;

const line = (snippet: string) => lineOf(contextWindowCode, snippet);
const words = (ids: number[]) => ids.map((t) => VOCAB[t]!).join(' ');

function tokenRow(tokens: number[], role: (i: number) => Role): ArrayView {
  return { kind: 'array', cells: tokens.map((t, i) => ({ id: `t-${i}`, value: VOCAB[t]!, role: role(i) })) };
}

/** Indexes of the tokens the window keeps. */
function keptIndexes(n: number, window: number, strategy: string): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (n <= window) return all;
  return strategy === 'oldest' ? all.slice(-window) : [...all.slice(0, KEEP_FIRST), ...all.slice(-(window - KEEP_FIRST))];
}

export function contextWindowSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't fit this text into the window", why, EMPTY);
  const text = readPrompt(values, 'text', 'Text', MAX_WORDS);
  if (!text.ok) return fail(text.why);
  const window = readInt(values, 'window', 'Window', WINDOW);
  if (!window.ok) return fail(window.why);
  const strategy = readChoice(values, 'strategy', 'Strategy', STRATEGIES);
  if (!strategy.ok) return fail(strategy.why);

  const tokens = text.value;
  const fits = tokens.length <= window.value;
  const kept = keptIndexes(tokens.length, window.value, strategy.value);
  const keptSet = new Set(kept);
  const windowIds = kept.map((i) => tokens[i]!);
  const steps: Step[] = [
    {
      title: `The text is ${tokens.length} tokens; the window holds ${window.value}`,
      why: `A model reads a fixed number of tokens at a time: its context window. This toy model was trained on sentences of up to 6 words and predicts the end of a sentence after 6 tokens, so this lesson uses windows of 3 to 5. Real models have windows of thousands to millions of tokens, with the same rule: what is outside the window does not exist for the model.`,
      codeLine: line('tokens = tokenize(text)'),
      variables: { tokens: tokens.length, window: window.value },
      view: tokenRow(tokens, () => 'default'),
    },
    fits
      ? {
          title: `The text fits: all ${tokens.length} tokens go to the model`,
          why: 'Nothing has to be dropped, so the strategy makes no difference.',
          codeLine: line('} else kept = tokens'),
          variables: { kept: tokens.length },
          view: tokenRow(tokens, () => 'active'),
        }
      : {
          title:
            strategy.value === 'oldest'
              ? `Drop the ${tokens.length - window.value} oldest tokens; keep "${words(windowIds)}"`
              : `Keep the first ${KEEP_FIRST} tokens and the latest ${window.value - KEEP_FIRST}: "${words(windowIds)}"`,
          why:
            strategy.value === 'oldest'
              ? 'A sliding window keeps the newest tokens. It is simple, but whatever came first, such as who the sentence is about, can fall out.'
              : 'Keeping the start protects what came first, as chat apps keep the system message. The tokens in the middle are dropped instead.',
          codeLine: strategy.value === 'oldest' ? line("kept = tokens.slice(-window)") : line('kept = [...tokens.slice(0, 2)'),
          variables: { kept: kept.length, dropped: tokens.length - kept.length },
          view: tokenRow(tokens, (i) => (keptSet.has(i) ? 'active' : 'discarded')),
        },
  ];
  const probs = forward(windowIds).probs.at(-1)!;
  const next = argmax(probs);
  steps.push({
    title: `From "${words(windowIds)}" the model predicts ${VOCAB[next]} (${fmt(probs[next]!)})`,
    why: fits
      ? 'The model saw every word, so the prediction can use all of them.'
      : 'The model only sees the window. The dropped words cannot change this prediction at all.',
    next: 'Each new token means re-reading the whole window. The KV Cache lesson shows how models avoid redoing that work.',
    codeLine: line('next = argmax(probs)'),
    variables: { next: VOCAB[next]!, p: fmt(probs[next]!) },
    view: distributionView(probs, { title: `P(next word | ${words(windowIds)})`, chosen: next }),
  });
  return steps;
}
