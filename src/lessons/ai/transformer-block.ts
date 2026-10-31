import { transformerBlockCode, transformerBlockSteps } from '../../ai/scenarios/transformer-block';
import type { LessonContent } from '../../types/lesson';

const defaults = { prompt: 'the cat sat on the' };

// x and the attention output, just before the residual add.
const attention = transformerBlockSteps(defaults)[1]!;

const content: LessonContent = {
  overview:
    'A transformer block is the repeating unit of every GPT-style model: attention, then a small neural network (the MLP), each wrapped in a residual connection and a normalisation. This lesson follows one token\'s 8 numbers through the tiny model\'s single block, all the way to its next-word prediction.',
  concept: [
    'The input to the block is the token\'s embedding plus a position vector.',
    'Attention lets the token gather information from earlier tokens. Its output is added to the input (a residual connection) rather than replacing it.',
    'Layer norm rescales the vector so its numbers have mean 0 and spread 1. Then the MLP (8 → 16 → 8 numbers with a ReLU) works on this token alone, and its output is added back too.',
    'At the end, every word is scored by the dot product of its embedding with the final vector. This model reuses the input embedding table for that (tied embeddings). Real models stack the block many times: GPT-2 small has 12, the largest models over 100.',
  ],
  howItWorks: [
    'The last token\'s embedding and position vector are added.',
    'Attention adds information from the earlier tokens (residual add), then layer norm.',
    'The MLP transforms the vector (residual add), then layer norm again.',
    'The final vector is compared with every word\'s embedding, and softmax gives the next-word probabilities.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'prompt', label: 'Prompt', type: 'text', sample: defaults.prompt, help: '1 to 6 words from the toy corpus.' }],
    presets: [
      { label: 'The cat sat on the', values: defaults },
      { label: 'A dog', values: { prompt: 'the dog sat on the' } },
      { label: 'One word', values: { prompt: 'the' } },
    ],
    generate: transformerBlockSteps,
    codeLabel: 'Pseudocode',
  },
  code: transformerBlockCode,
  prosCons: {
    pros: ['The same block can be stacked to make a model deeper', 'Residual connections let very deep stacks still train', 'Attention mixes tokens and the MLP processes each one, so the two jobs stay separate'],
    cons: ['Each block adds weights and compute for every token', 'What each number means is hard to read off', 'Attention cost still grows with the square of the text length'],
    useWhen: ['Building a model over sequences: text, code, audio, images cut into patches'],
    avoidWhen: ['Tiny problems a lookup table or a simple model already solves'],
  },
  applications: [
    'GPT, Claude, Llama and Gemini are stacks of blocks like this one, much wider and deeper',
    'BERT-style models use the same block without the causal mask to understand text',
    'Vision transformers run the block over image patches',
  ],
  commonMistakes: [
    'Thinking the MLP sees other tokens: only attention mixes tokens.',
    'Replacing x with the attention output instead of adding it: the residual is what keeps the original information.',
    'Expecting the block to predict a word by itself: the last step compares the final vector with every word\'s embedding.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'These are x and the attention output. What is the next stage\'s "sum" column?',
      view: attention.view,
      options: ['x + attention, number by number', 'The attention output alone', 'x × attention, number by number', 'The average of the two columns'],
      answer: 0,
      explanation: 'A residual connection adds the two vectors, so the token keeps what it had and gains what attention found.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which part of the block lets one token use information from another?',
      options: ['Attention', 'The MLP', 'Layer norm', 'The residual add'],
      answer: 0,
      explanation: 'The MLP and layer norm work on each token alone; only attention looks across tokens.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does the last line use the embedding table?',
      code: 'logits = embed · x + b   // score every word with the same table',
      options: ['Each word is scored by how closely its embedding matches the final vector', 'To look up the input token again, so it can be repeated', 'To add position information to the last word', 'To normalise the vector'],
      answer: 0,
      explanation: 'The dot product with each word\'s embedding gives that word\'s score. Sharing the table with the input is called tied embeddings.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does layer norm do to the vector?',
      options: ['Rescales it to mean 0 and spread 1', 'Removes negative numbers', 'Makes it add up to 1', 'Sorts it'],
      answer: 0,
      explanation: 'It subtracts the mean and divides by the standard deviation, keeping numbers in a steady range.',
    },
  ],
  summary: [
    'A block is attention and an MLP, each followed by a residual add and a layer norm.',
    'Attention mixes information across tokens; the MLP works on each token alone.',
    'Residual connections add changes instead of replacing the vector.',
    'The final vector is scored against every word\'s embedding to predict the next word.',
  ],
};

export default content;
