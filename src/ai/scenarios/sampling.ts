import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { seeded } from '../../utils/random';
import { VOCAB } from '../corpus';
import { forward } from '../model';
import { draw, reshape } from '../sample';
import { distributionView, EMPTY, fmt, readPrompt } from '../steps';

export const samplingCode = `probs = softmax(logits / temperature)    // < 1 sharpens, > 1 flattens
keep = mostLikely(probs, topK)           // the k most likely words
keep = smallestSetReaching(keep, topP)   // most likely first, until they sum to p
probs = renormalise(probs, keep)         // the kept words add up to 1 again
r = random()                             // seeded, so a run repeats
next = firstWhereRunningSumPasses(probs, r)`;

export const TEMPERATURES = ['0.1', '0.5', '1', '1.5', '2'];
export const TOP_PS = ['0.5', '0.75', '0.9', '1'];
const line = (snippet: string) => lineOf(samplingCode, snippet);

export function samplingSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't sample from this prompt", why, EMPTY);
  const prompt = readPrompt(values, 'prompt', 'Prompt');
  if (!prompt.ok) return fail(prompt.why);
  const temperature = readChoice(values, 'temperature', 'Temperature', TEMPERATURES);
  if (!temperature.ok) return fail(temperature.why);
  const topK = readInt(values, 'topK', 'Top-k', { min: 1, max: VOCAB.length });
  if (!topK.ok) return fail(topK.why);
  const topP = readChoice(values, 'topP', 'Top-p', TOP_PS);
  if (!topP.ok) return fail(topP.why);
  const seed = readInt(values, 'seed', 'Seed', { min: 1, max: 99 });
  if (!seed.ok) return fail(seed.why);

  const f = forward(prompt.value);
  const logits = f.logits.at(-1)!;
  const T = Number(temperature.value);
  const r = reshape(logits, { temperature: T, topK: topK.value, topP: Number(topP.value) });
  const afterK = new Set(r.topKCut);
  const afterP = new Set([...r.topKCut, ...r.topPCut]);
  const kept = VOCAB.length - afterP.size;
  const random = seeded(seed.value)();
  const next = draw(r.final, () => random);
  const context = prompt.value.map((t) => VOCAB[t]).join(' ');
  const best = r.order[0]!;
  const title = `P(next word | ${context})`;

  return [
    {
      title: `The model's probabilities at temperature 1: ${VOCAB[best]} ${fmt(f.probs.at(-1)![best]!)}`,
      why: 'Greedy decoding would always take the top word. Sampling instead draws a word at random, in proportion to these probabilities, so the same prompt can continue in different ways.',
      codeLine: line('probs = softmax(logits / temperature)'),
      view: distributionView(f.probs.at(-1)!, { title }),
    },
    {
      title: `Divide the logits by temperature ${temperature.value}: ${VOCAB[best]} now has ${fmt(r.scaled[best]!)}`,
      why:
        T < 1
          ? 'A temperature below 1 stretches the gaps between scores, so the top word takes even more of the probability.'
          : T > 1
            ? 'A temperature above 1 shrinks the gaps between scores, so unlikely words get a bigger share.'
            : 'Temperature 1 leaves the probabilities as the model gave them.',
      codeLine: line('probs = softmax(logits / temperature)'),
      variables: { temperature: temperature.value },
      view: distributionView(r.scaled, { title }),
    },
    {
      title: r.topKCut.length > 0 ? `Top-k ${topK.value}: keep the ${topK.value} most likely word${topK.value === 1 ? '' : 's'}, cut ${r.topKCut.length}` : `Top-k ${topK.value} keeps every word`,
      why: 'Top-k sets a hard limit on how many words can be drawn, so a very unlikely word can never slip in.',
      codeLine: line('keep = mostLikely'),
      variables: { 'top-k': topK.value },
      view: distributionView(r.scaled, { title, cut: afterK }),
    },
    {
      title: r.topPCut.length > 0 ? `Top-p ${topP.value}: the ${kept} most likely word${kept === 1 ? '' : 's'} reach ${topP.value}; cut ${r.topPCut.length} more` : `Top-p ${topP.value} cuts nothing more`,
      why: 'Top-p (nucleus sampling) keeps adding the most likely words until their probabilities reach p. When the model is sure, that is one or two words; when it is unsure, many.',
      codeLine: line('keep = smallestSetReaching'),
      variables: { 'top-p': topP.value, kept },
      view: distributionView(r.scaled, { title, cut: afterP }),
    },
    {
      title: `Renormalise the ${kept} kept word${kept === 1 ? '' : 's'} so they add up to 1`,
      why: 'Cut words get probability 0, and the rest are divided by their total so they add up to 1 again.',
      codeLine: line('probs = renormalise'),
      view: distributionView(r.final, { title, cut: afterP }),
    },
    {
      title: `Draw: the random number ${fmt(random)} lands in ${VOCAB[next]}'s slice`,
      why: 'Lay the kept probabilities end to end from 0 to 1. The word whose slice contains the random number is chosen. The seed fixes the random number, so the same settings always draw the same word.',
      next: 'Try another seed, or a hotter temperature, to see a different word drawn.',
      codeLine: line('next = firstWhereRunningSumPasses'),
      variables: { random: fmt(random), next: VOCAB[next]!, p: fmt(r.final[next]!) },
      view: distributionView(r.final, { title, cut: afterP, chosen: next }),
    },
  ];
}
