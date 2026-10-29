import { kvCacheCode, kvCacheSteps } from '../../ai/scenarios/kv-cache';
import { ON_OFF } from '../../ai/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { prompt: 'the cat', count: '4', cache: 'on' };

// Two tokens cached; the learner predicts how many rows the next feed computes.
const second = kvCacheSteps(defaults)[1]!;

const content: LessonContent = {
  overview:
    'A model writes one token at a time, and each new token attends over every token before it. Recomputing the keys and values of all those old tokens at every step is wasted work: they never change. A KV cache keeps them. This lesson generates text with the tiny model with the cache on and off, and counts the work.',
  concept: [
    'Self-attention needs a key (K) and a value (V) for every earlier token, and a query (Q) for the new one.',
    'Because of the causal mask, an earlier token never looks at later ones, so its K and V never change once computed.',
    'A KV cache stores each token\'s K and V. Each new token then computes only its own row and reuses the rest.',
    'The output is exactly the same with or without the cache: it saves time, and costs memory that grows with every token.',
  ],
  howItWorks: [
    'Feed the prompt token by token, computing each one\'s K and V and adding them to the cache.',
    'The new token\'s query attends over every cached key; the weights mix the cached values.',
    'The rest of the block turns that into next-word probabilities, and the top word is appended.',
    'Feed the new word the same way, until the limit, the end of the sentence, or a full context.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'prompt', label: 'Prompt', type: 'text', sample: defaults.prompt, help: '1 to 6 words from the toy corpus.' },
      { name: 'count', label: 'Words to generate', type: 'number', sample: defaults.count, help: '1 to 8; generation also stops at <end> or 6 tokens.' },
      { name: 'cache', label: 'KV cache', type: 'choice', sample: defaults.cache, options: ON_OFF },
    ],
    presets: [
      { label: 'Cached', values: defaults },
      { label: 'Uncached', values: { ...defaults, cache: 'off' } },
      { label: 'Fills the context', values: { prompt: 'flew to', count: '8', cache: 'on' } },
    ],
    generate: kvCacheSteps,
    codeLabel: 'Pseudocode',
  },
  code: kvCacheCode,
  prosCons: {
    pros: ['Each new token costs one K/V row instead of the whole history', 'The output is exactly the same as without the cache', 'Makes long replies and long chats practical'],
    cons: ['Memory grows with every token, for every layer and head', 'The cache is only valid for the exact same earlier tokens: change one and it must be rebuilt from there', 'Serving many users means managing many caches'],
    useWhen: ['Generating text token by token: every inference server does this'],
    avoidWhen: ['Training, where every position of a sequence is computed at once anyway'],
  },
  applications: [
    'Inference servers keep a KV cache per conversation while a reply is written',
    'Prompt caching reuses the cache of a long, shared prefix (such as a system prompt) across requests',
    'Context length limits are partly set by how much KV cache fits in GPU memory',
  ],
  commonMistakes: [
    'Thinking the cache changes the answer: it only skips repeated work.',
    'Forgetting the cache\'s memory cost when estimating how many users a server can handle.',
    'Reusing a cache after editing an earlier token: everything after the edit must be recomputed.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The cache holds K and V for "the" and "cat". When "sat" is fed next, how many new K/V rows are computed?',
      view: second.view,
      options: ['1', '2', '3', '0'],
      answer: 0,
      explanation: 'Only the new token\'s row is computed; the two cached rows are reused.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can earlier tokens\' keys and values be cached?',
      options: ['With the causal mask they never look ahead, so they never change', 'Because they are rounded', 'Because the model forgets them', 'Because the cache changes them each step'],
      answer: 0,
      explanation: 'An earlier token only depends on tokens before it, so later tokens cannot change its K and V.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Feeding 5 positions without a cache, how many K/V rows does this comment\'s approach compute in total?',
      code: '// without a cache: K = Wk · X and V = Wv · X for every token, every time',
      options: ['15', '5', '25', '10'],
      answer: 0,
      explanation: '1 + 2 + 3 + 4 + 5 = 15 rows, against 5 with a cache.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a KV cache cost?',
      options: ['Memory that grows with every token', 'Accuracy', 'A different answer', 'Nothing at all'],
      answer: 0,
      explanation: 'The cache trades memory for time; the output is unchanged.',
    },
  ],
  summary: [
    'Each token\'s keys and values never change once computed.',
    'A KV cache stores them, so each new token computes only its own row.',
    'n positions cost n rows with a cache and n(n+1)/2 without.',
    'The output is the same; the price is memory.',
  ],
};

export default content;
