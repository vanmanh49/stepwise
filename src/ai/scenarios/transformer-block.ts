import { refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { VOCAB } from '../corpus';
import { forward } from '../model';
import { distributionView, EMPTY, fmt, readPrompt, vectorGrid } from '../steps';
import { argmax } from '../tensor';
import { WEIGHTS } from '../weights';

export const transformerBlockCode = `x = embed[token] + position[i]
a = attention(x)                   // the Self-Attention lesson
x = x + a                          // residual: keep x, add what attention found
x = layerNorm(x)                   // rescale: mean 0, spread 1
m = W2 · relu(W1 · x + b1) + b2    // MLP: each token on its own
x = x + m                          // residual again
x = layerNorm(x)                   // once more, before scoring
logits = embed · x + b             // score every word with the same table`;

const line = (snippet: string) => lineOf(transformerBlockCode, snippet);

export function transformerBlockSteps(values: Record<string, string>): Step[] {
  const prompt = readPrompt(values, 'prompt', 'Prompt');
  if (!prompt.ok) return refusal("Can't run the model on this prompt", prompt.why, EMPTY);
  const tokens = prompt.value;
  const f = forward(tokens);
  const i = tokens.length - 1;
  const word = VOCAB[tokens[i]!]!;
  const at = (m: number[][]) => m[i]!;
  const grid = (columns: [string, number[]][]) => vectorGrid(columns.map(([label, column]) => ({ label, values: column })), 'stage');
  const probs = at(f.probs);
  const next = argmax(probs);

  return [
    {
      title: `Start: ${word}'s embedding plus the vector for position ${i + 1}`,
      why: `The block follows the last token, ${word}, because its output predicts the next word. The position vector tells the model where in the text it is.`,
      codeLine: line('x = embed[token] + position[i]'),
      view: grid([['embed', WEIGHTS.tokenEmbed[tokens[i]!]!], ['position', WEIGHTS.posEmbed[i]!], ['x', at(f.x)]]),
    },
    {
      title: `Attention: ${word} gathers information from the tokens before it`,
      why: 'This is the Self-Attention lesson in one step: a weighted blend of the earlier tokens\' values, passed through one more matrix.',
      codeLine: line('a = attention(x)'),
      view: grid([['x', at(f.x)], ['attention', at(f.attn)]]),
    },
    {
      title: 'Add the attention output back onto x (a residual connection)',
      why: 'Adding instead of replacing keeps what the token already knew. It also lets training signals flow straight through, which is why deep models stack dozens of these blocks.',
      codeLine: line('x = x + a'),
      view: grid([['x', at(f.x)], ['attention', at(f.attn)], ['sum', at(f.resid1)]]),
    },
    {
      title: 'Layer norm: rescale the vector to mean 0 and spread 1',
      why: 'Normalising keeps the numbers in the same range at every stage, whatever was added. (Real models also learn a gain and a bias here; this one does not.)',
      codeLine: line('rescale: mean 0'),
      view: grid([['before', at(f.resid1)], ['after', at(f.norm1)]]),
    },
    {
      title: 'MLP: two small layers with a ReLU in between, for this token alone',
      why: 'Attention mixes tokens; the MLP then works on each token by itself (8 → 16 → 8 numbers). Much of what a model "knows" is stored in these weights.',
      codeLine: line('m = W2'),
      view: grid([['x', at(f.norm1)], ['MLP', at(f.mlp)]]),
    },
    {
      title: 'Add the MLP output back onto x (residual again)',
      why: 'The same trick as after attention: keep the vector and add the MLP\'s change to it.',
      codeLine: line('x = x + m'),
      view: grid([['x', at(f.norm1)], ['MLP', at(f.mlp)], ['sum', at(f.resid2)]]),
    },
    {
      title: 'Layer norm again',
      why: 'The vector is rescaled once more before the model turns it into word scores.',
      codeLine: line('once more, before scoring'),
      view: grid([['before', at(f.resid2)], ['after', at(f.norm2)]]),
    },
    {
      title: `Score every word with the embedding table: ${VOCAB[next]} wins with ${fmt(probs[next]!)}`,
      why: 'Each word\'s score is the dot product of its embedding with the final vector, so words whose vectors point the same way score high. softmax turns the scores into probabilities.',
      next: 'A real model repeats the block many times (GPT-2 small has 12) before this last step.',
      codeLine: line('logits = embed'),
      variables: { next: VOCAB[next]!, p: fmt(probs[next]!) },
      view: distributionView(probs, { title: `P(next word | ${tokens.map((t) => VOCAB[t]).join(' ')})`, chosen: next }),
    },
  ];
}
