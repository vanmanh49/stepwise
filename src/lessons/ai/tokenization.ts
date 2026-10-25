import { MAX_MERGES, tokenizationCode, tokenizationSteps } from '../../ai/scenarios/tokenization';
import type { LessonContent } from '../../types/lesson';

const defaults = { text: 'the cat sat', merges: '20' };

// Just before ▁c + at merges into ▁cat.
const steps = tokenizationSteps(defaults);
const beforeCat = steps[steps.findIndex((s) => s.title.endsWith('→ ▁cat')) - 1]!;

const content: LessonContent = {
  overview:
    'A language model never reads letters. Text is first cut into tokens: common words become one token, and rare words are split into pieces. This lesson runs byte-pair encoding (BPE), the method behind most model tokenizers, on text you type.',
  concept: [
    'BPE learns its merges once, from a corpus. It starts from single characters, counts which two neighbouring tokens appear together most often, and merges that pair into a new token. It repeats this as many times as it is asked.',
    'To tokenize new text, it splits the text into characters and replays the learned merges in the same order. A merge that matches nothing is skipped.',
    'Each space becomes ▁ and sticks to the start of the next word, so ▁cat (a word on its own) and cat (inside another word) are different tokens.',
    'This lesson learns at most 30 merges from 30 short sentences. Real tokenizers work on bytes and learn tens of thousands of merges from huge amounts of text, which is why GPT-style vocabularies have 50,000 to 200,000 tokens.',
  ],
  howItWorks: [
    'The merges are learned from the toy corpus before the lesson starts (the "seen" column says how often each pair appeared).',
    'Your text is split into characters; spaces become ▁.',
    'The merges are tried in the order they were learned. Each one that matches joins every copy of its pair into one token.',
    'The run ends with the final tokens. Words the corpus knows end up as one or two tokens; unseen words stay in small pieces.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'text', label: 'Text', type: 'text', sample: defaults.text, help: 'Up to 40 characters.' },
      { name: 'merges', label: 'Merges', type: 'number', sample: defaults.merges, help: `How many learned merges to apply, 0 to ${MAX_MERGES}.` },
    ],
    presets: [
      { label: 'A corpus sentence', values: defaults },
      { label: 'An unseen word', values: { ...defaults, text: 'the zebra' } },
      { label: 'A misspelling', values: { ...defaults, text: 'teh cta' } },
    ],
    generate: tokenizationSteps,
    codeLabel: 'Pseudocode',
  },
  code: tokenizationCode,
  prosCons: {
    pros: ['Any text can be encoded: unseen words fall back to smaller pieces, down to single characters', 'Common words take one token, so text stays short', 'Learning merges is simple counting, with no model needed'],
    cons: ['Rare words, names and misspellings cost many tokens', 'Token boundaries can look odd (▁s + at), which makes spelling and counting letters hard for a model', 'Languages that are rare in the corpus get split into more tokens, so they cost more'],
    useWhen: ['Preparing text for a language model', 'You need a fixed vocabulary that still handles any input'],
    avoidWhen: ['You need exact characters, such as counting letters: work on characters instead'],
  },
  applications: [
    'GPT, Claude and Llama tokenizers are all byte-pair encoders (or close relatives) learned from large corpora',
    'API prices and context limits are counted in tokens, not words or characters',
    'Code models learn merges for common keywords and indentation, so code takes fewer tokens',
  ],
  commonMistakes: [
    'Thinking one token is one word: many words are several tokens, and a space is part of a token.',
    'Applying merges in any order: they must be replayed in the order they were learned.',
    'Expecting misspelled text to cost the same: "teh cta" needs more tokens than "the cat".',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The next learned merge is ▁c + at. What are the tokens after it?',
      view: beforeCat.view,
      options: ['the ▁cat ▁s at', 'the ▁c at ▁sat', 'the ▁cat ▁sat', 'th e ▁cat ▁s at'],
      answer: 0,
      explanation: 'Only the pair ▁c, at joins. ▁s and at stay apart until a merge for them comes up, and none does here.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How does BPE choose which pair to merge next while learning?',
      options: ['The pair that appears most often in the corpus', 'The pair that appears first in the text', 'The longest pair', 'A random pair'],
      answer: 0,
      explanation: 'Each learning round counts every neighbouring pair in the corpus and merges the most frequent one.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does encode() loop over the merges in learned order?',
      code: 'for (const merge of merges) {\n  if (!hasPair(tokens, merge)) continue\n  tokens = mergePairs(tokens, merge)\n}',
      options: ['Later merges are built from tokens that earlier merges made', 'It is faster than sorting them', 'Order does not matter', 'To skip merges that match nothing'],
      answer: 0,
      explanation: '▁cat can only form after ▁c and at exist, so the merges must be replayed in the same order.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What happens to the letter z, which never appears in the corpus?',
      options: ['It stays a single-character token', 'The text is refused', 'It is dropped', 'It is merged with the next letter'],
      answer: 0,
      explanation: 'No merge involves z, so it stays on its own. BPE can always fall back to single characters (or bytes).',
    },
  ],
  summary: [
    'Models read tokens, not letters or words.',
    'BPE learns merges by repeatedly joining the most frequent pair in a corpus.',
    'Encoding replays the merges in learned order; unseen words fall back to smaller pieces.',
    'Token counts decide cost and how much text fits in a model\'s context.',
  ],
};

export default content;
