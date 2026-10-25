import { selfAttentionCode, selfAttentionSteps } from '../../ai/scenarios/self-attention';
import type { LessonContent } from '../../types/lesson';

const defaults = { prompt: 'the cat sat on the' };

// The masked scores: the learner predicts the first row's weight after softmax.
const masked = selfAttentionSteps(defaults).find((s) => s.title.startsWith('Mask'))!;

const content: LessonContent = {
  overview:
    'Self-attention is how a transformer lets each token look at the tokens before it and pull in what it needs. In "the cat sat on the", the last "the" needs to know a cat is sitting to guess "mat". This lesson computes attention in the tiny model, number by number.',
  concept: [
    'Each token\'s vector is turned into three new vectors by learned matrices: a query (what it is looking for), a key (what it offers) and a value (what it passes on).',
    'The score between two tokens is the dot product of one\'s query and the other\'s key, divided by √d (here √8) to keep scores small.',
    'In a model that writes text, a token may not look ahead: scores for later tokens are set to −∞ (the causal mask). softmax then turns each row into weights that add up to 1.',
    'The output for a token is the weighted sum of the values. Real models run many attention heads side by side and stack dozens of layers; this one has one head in one layer.',
  ],
  howItWorks: [
    'Each token starts as its embedding plus a position vector.',
    'Queries, keys and values are made from those vectors.',
    'Every query is scored against every key, and the scores are divided by √8.',
    'Scores above the diagonal (the future) are masked to −∞.',
    'softmax turns each row into weights, and the last token\'s output is the weighted sum of the values.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'prompt', label: 'Prompt', type: 'text', sample: defaults.prompt, help: '1 to 6 words from the toy corpus.' }],
    presets: [
      { label: 'The cat sat on the', values: defaults },
      { label: 'Two words', values: { prompt: 'the dog' } },
      { label: 'Six words', values: { prompt: 'a bird sat in the tree' } },
    ],
    generate: selfAttentionSteps,
    codeLabel: 'Pseudocode',
  },
  code: selfAttentionCode,
  prosCons: {
    pros: ['Any token can use information from any earlier token, however far back', 'All pairs are scored at once, so it runs fast on GPUs', 'The weights show which tokens influenced each other'],
    cons: ['The score table grows with the square of the text length, so long contexts are expensive', 'Weights are not explanations: a high weight does not prove why the model answered as it did', 'Without position vectors, attention cannot tell word order'],
    useWhen: ['Mixing information across a sequence: text, code, audio, image patches'],
    avoidWhen: ['Very long sequences on a tight budget: cheaper variants (sliding windows, linear attention) exist'],
  },
  applications: [
    'Every GPT-style model uses masked self-attention in every layer',
    'Translation models use attention to line up words between two languages',
    'Vision transformers attend between patches of an image',
  ],
  commonMistakes: [
    'Forgetting the mask, so a token sees the word it is supposed to predict.',
    'Skipping the √d division: with large vectors softmax then puts almost all weight on one token.',
    'Thinking the weights come from the words directly: they come from learned query and key matrices.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'These are the masked scores. After softmax, what weight does the first token (top row) give itself?',
      view: masked.view,
      options: ['1.00', '0.20', '0.00', 'It depends on its score'],
      answer: 0,
      explanation: 'Every other score in the first row is −∞, which softmax turns into 0, so the one remaining weight must be 1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why are scores above the diagonal set to −∞?',
      options: ['So a token cannot look at later tokens', 'To make the scores smaller', 'To skip padding', 'Because those tokens are unknown words'],
      answer: 0,
      explanation: 'The model is trained to predict the next token, so it must not see it. e^−∞ is 0, so masked tokens get no weight.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line produce for each token?',
      code: 'out[i] = sum(weights[i][j] * v[j])',
      options: ['A blend of the earlier tokens\' values, weighted by attention', 'The most attended token\'s value only', 'The token\'s own embedding', 'A probability for each word'],
      answer: 0,
      explanation: 'Each value is scaled by its weight and they are added up, so the output mixes information from every token it may see.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What are the query and key used for?',
      options: ['Their dot product scores how relevant one token is to another', 'They are added to the output', 'They store the token\'s position', 'They pick the next word'],
      answer: 0,
      explanation: 'The query of one token is compared with the key of each other token; the value is what gets passed on.',
    },
  ],
  summary: [
    'Each token makes a query, a key and a value from its vector.',
    'Scores are query · key, divided by √d, with future tokens masked to −∞.',
    'softmax turns each row of scores into weights that add up to 1.',
    'A token\'s output is the weighted sum of the values it may see.',
  ],
};

export default content;
