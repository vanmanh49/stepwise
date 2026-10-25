import { embeddingsCode, embeddingsSteps, MODES, WORDS } from '../../ai/scenarios/embeddings';
import type { LessonContent } from '../../types/lesson';

const defaults = { mode: 'compare', a: 'cat', b: 'dog' };

// cat vs on, after the dot product: the learner predicts the sign of the cosine.
const products = embeddingsSteps({ ...defaults, b: 'on' })[1]!;

const content: LessonContent = {
  overview:
    'Inside a model, each token is a list of numbers called an embedding. Words used in similar places get similar lists. This lesson looks up the tiny model\'s embeddings and measures how alike two words are with cosine similarity.',
  concept: [
    'The embedding table has one row per token in the vocabulary. Looking a token up is just reading its row: here, 8 numbers. Real models use thousands of numbers per token.',
    'Nobody writes these numbers by hand. They start random and are adjusted during training so the model predicts the next word better. Words that appear in the same places (cat and dog both come after "the" and before "sat") end up pointing in similar directions.',
    'Cosine similarity compares directions: the dot product of the two vectors divided by both lengths. 1 means the same direction, 0 unrelated, −1 opposite.',
    'This model uses one table both to read tokens in and to score the next token at the end (tied embeddings, as in GPT-2), so a word\'s vector reflects both where it appears and what can follow.',
  ],
  howItWorks: [
    'Pick two words (or one word and "nearest").',
    'Each word\'s 8 numbers are read from the embedding table.',
    'The numbers are multiplied dimension by dimension and summed: the dot product.',
    'The dot product is divided by both vectors\' lengths, which gives the cosine.',
    'In nearest mode, the cosine is worked out against every other word and the closest are ranked.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'mode', label: 'Mode', type: 'choice', sample: defaults.mode, options: MODES, help: 'compare two words, or find the words nearest the first one.' },
      { name: 'a', label: 'Word', type: 'choice', sample: defaults.a, options: WORDS },
      { name: 'b', label: 'Other word', type: 'choice', sample: defaults.b, options: WORDS, help: 'Used in compare mode.' },
    ],
    presets: [
      { label: 'Cat vs dog', values: defaults },
      { label: 'Cat vs on', values: { ...defaults, b: 'on' } },
      { label: 'Nearest to cat', values: { ...defaults, mode: 'nearest' } },
      { label: 'Nearest to ate', values: { ...defaults, mode: 'nearest', a: 'ate' } },
    ],
    generate: embeddingsSteps,
    codeLabel: 'Pseudocode',
  },
  code: embeddingsCode,
  prosCons: {
    pros: ['Turns words into numbers a model can compute with', 'Similar words get similar vectors without anyone labelling them', 'Cosine similarity is cheap: one dot product and two lengths'],
    cons: ['The numbers have no fixed meaning you can read off one dimension', 'Similar means "used in similar places", which can mix up opposites like hot and cold', 'A tiny model on 30 sentences learns rough groups; real models need huge amounts of text'],
    useWhen: ['Feeding tokens into a model', 'Finding related words or documents (vector search, covered later in this track)'],
    avoidWhen: ['You need exact matches, such as an id or a product code: compare the text itself'],
  },
  applications: [
    'Every language model starts by looking up an embedding for each token',
    'Search engines and RAG systems compare embeddings of a question and of documents',
    'Recommendation systems embed users and items and suggest the nearest items',
  ],
  commonMistakes: [
    'Reading one dimension as a meaning ("d3 is animal-ness"): meaning is spread across all of them.',
    'Using the raw dot product to compare words: long vectors win even when the direction differs; divide by the lengths.',
    'Expecting synonyms only: words that fill the same slot (cat, dog, bird) come out close even though they differ.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The dot product of cat and on is −2.65. What sign will their cosine similarity have?',
      view: products.view,
      options: ['Negative', 'Positive', 'Zero', 'It depends on the lengths'],
      answer: 0,
      explanation: 'Lengths are always positive, so dividing by them keeps the dot product\'s sign: the cosine is −0.51.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why do cat and dog end up with similar embeddings?',
      options: ['They appear in the same places in the training text', 'Someone labelled them both as animals', 'They have the same number of letters', 'They are next to each other in the vocabulary'],
      answer: 0,
      explanation: 'Training only adjusts the numbers to predict next words better; words that fit the same slots get pushed the same way.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line add up?',
      code: 'for (let d = 0; d < 8; d++) dot += E[a][d] * E[b][d]',
      options: ['The products of matching dimensions: the dot product', 'The lengths of both vectors', 'The difference between the vectors', 'The number of dimensions that match exactly'],
      answer: 0,
      explanation: 'Each dimension of a is multiplied by the same dimension of b, and the products are summed.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A word compared with itself has cosine similarity…',
      options: ['1', '0', '−1', 'Its length'],
      answer: 0,
      explanation: 'A vector points in exactly its own direction, so the cosine is 1 whatever its length.',
    },
  ],
  summary: [
    'An embedding is a row of numbers, one row per token.',
    'The numbers are learned during training, not written by hand.',
    'Cosine similarity compares directions: dot product divided by both lengths.',
    'Words used in similar places end up with similar embeddings.',
  ],
};

export default content;
