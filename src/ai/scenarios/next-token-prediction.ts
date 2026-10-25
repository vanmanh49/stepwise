import { readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ArrayView, Step } from '../../types/visualization';
import { END, tokenId, VOCAB } from '../corpus';
import { CONTEXT, forward } from '../model';
import { distributionView, EMPTY, fmt, matrixGrid, readPrompt } from '../steps';
import { argmax } from '../tensor';

export const nextTokenPredictionCode = `function generate(prompt, count) {
  tokens = tokenize(prompt)
  for (let n = 0; n < count; n++) {
    if (tokens.length > 6) break      // the model sees 6 tokens at most
    logits = model(tokens)            // one score per word in the vocabulary
    probs = softmax(logits)           // scores → probabilities that sum to 1
    next = argmax(probs)              // greedy: take the most likely word
    tokens.push(next)
    if (next === END) break
  }
  return tokens
}`;

export const MAX_NEW = 8;
const SHOWN_LOGITS = 8;
const line = (snippet: string) => lineOf(nextTokenPredictionCode, snippet);
const words = (tokens: number[]) => tokens.map((t) => VOCAB[t]!).join(' ');

function tokenRow(tokens: number[], promptLength: number): ArrayView {
  return { kind: 'array', cells: tokens.map((t, i) => ({ id: `t-${i}`, value: VOCAB[t]!, role: i >= promptLength ? 'found' : 'default' })) };
}

export function nextTokenPredictionSteps(values: Record<string, string>): Step[] {
  const prompt = readPrompt(values, 'prompt', 'Prompt');
  if (!prompt.ok) return refusal("Can't run the model on this prompt", prompt.why, EMPTY);
  const count = readInt(values, 'count', 'Words to generate', { min: 1, max: MAX_NEW });
  if (!count.ok) return refusal("Can't run the model on this prompt", count.why, EMPTY);

  const tokens = [...prompt.value];
  const promptLength = tokens.length;
  const steps: Step[] = [
    {
      title: `Turn "${words(tokens)}" into ${tokens.length} token ids`,
      why: `Each word is looked up in the vocabulary of ${VOCAB.length} tokens. The model will now predict one word at a time and add it to the end.`,
      codeLine: line('tokens = tokenize(prompt)'),
      variables: { tokens: tokens.length },
      view: tokenRow(tokens, promptLength),
    },
  ];
  for (let n = 0; n < count.value; n++) {
    if (tokens.length > CONTEXT) {
      steps.push({
        title: `Stop: the text is ${tokens.length} tokens, more than the ${CONTEXT} the model can see`,
        why: `This model has ${CONTEXT} positions. Real models have much larger context windows (thousands to millions of tokens), but they have a limit too.`,
        codeLine: line('if (tokens.length > 6) break'),
        variables: { tokens: tokens.length },
        view: tokenRow(tokens, promptLength),
      });
      return steps;
    }
    const { logits, probs } = forward(tokens);
    const last = logits.at(-1)!;
    const p = probs.at(-1)!;
    const next = argmax(p);
    const top = last.map((_, i) => i).toSorted((a, b) => last[b]! - last[a]! || a - b).slice(0, SHOWN_LOGITS);
    steps.push({
      title: `The model scores all ${VOCAB.length} words; ${VOCAB[top[0]!]} scores highest (${fmt(last[top[0]!]!)})`,
      why: 'These scores are called logits. They can be any number, positive or negative; only their order and gaps matter. The highest ones are shown.',
      codeLine: line('logits = model(tokens)'),
      variables: { context: words(tokens) },
      view: matrixGrid(top.map((i) => [last[i]!]), top.map((i) => VOCAB[i]!), ['logit'], `logit-${n}`, 'abs'),
    });
    tokens.push(next);
    steps.push({
      title: `softmax gives ${VOCAB[next]} ${fmt(p[next]!)}, the most likely word: append ${VOCAB[next]}`,
      why: `softmax makes every score positive (e to the power of the score) and divides by the total, so the ${VOCAB.length} probabilities add up to 1. Greedy decoding always takes the top word.`,
      codeLine: line('next = argmax(probs)'),
      variables: { next: VOCAB[next]!, p: fmt(p[next]!) },
      view: distributionView(p, { title: `P(next word | ${words(tokens.slice(0, -1))})`, chosen: next }),
    });
    if (next === tokenId(END)) {
      steps.push({
        title: `Stop: the model predicted ${END}`,
        why: `In training, every sentence ended with ${END}, so the model learned when a sentence is finished.`,
        codeLine: line('if (next === END) break'),
        variables: { tokens: tokens.length },
        view: tokenRow(tokens, promptLength),
      });
      return steps;
    }
  }
  steps.push({
    title: `Generated "${words(tokens.slice(promptLength))}"`,
    why: `The model added ${tokens.length - promptLength} word${tokens.length - promptLength === 1 ? '' : 's'}, each from one pass over everything before it.`,
    next: 'Taking the top word every time always gives the same text. The Sampling lesson picks words at random by their probabilities instead.',
    codeLine: line('return tokens'),
    variables: { tokens: tokens.length },
    view: tokenRow(tokens, promptLength),
  });
  return steps;
}
