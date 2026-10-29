import { contextWindowCode, contextWindowSteps, STRATEGIES } from '../../ai/scenarios/context-window';
import type { LessonContent } from '../../types/lesson';

const defaults = { text: 'the fish saw the bird sat on the', window: '5', strategy: 'oldest' };

// The window just chosen, with the fish dropped: the learner predicts the next word.
const dropped = contextWindowSteps(defaults)[1]!;

const content: LessonContent = {
  overview:
    'A model can only read a fixed number of tokens at once: its context window. When a text or a chat grows longer, something has to be left out, and the model cannot use what it never sees. This lesson cuts a text down to a small window and shows how the tiny model\'s prediction changes with what is kept.',
  concept: [
    'The context window is the most tokens a model reads in one pass. Everything outside it has no effect on the output.',
    'A sliding window keeps the newest tokens and drops the oldest. It is simple, but early details, such as who a sentence is about, can be lost.',
    'Apps often keep the start instead (the system message and the first turns) and drop or summarise the middle.',
    'This toy model sees 6 tokens and was trained on sentences of up to 6 words, so it predicts the end of a sentence after any 6 tokens. The lesson uses windows of 3 to 5; real models have windows of thousands to millions of tokens.',
  ],
  howItWorks: [
    'Tokenize the whole text.',
    'If it is longer than the window, choose which tokens to keep: the latest, or the first 2 plus the latest.',
    'Give the model only the kept tokens, numbered from position 0.',
    'Read the model\'s next-word probabilities for the last kept token.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'text', label: 'Text', type: 'text', sample: defaults.text, help: '1 to 20 words from the toy corpus.' },
      { name: 'window', label: 'Window', type: 'number', sample: defaults.window, help: '3 to 5 tokens.' },
      { name: 'strategy', label: 'When it does not fit', type: 'choice', sample: defaults.strategy, options: STRATEGIES, help: 'oldest: drop the oldest tokens; first: keep the first 2 and the latest.' },
    ],
    presets: [
      { label: 'Fits', values: { ...defaults, text: 'the cat sat on the' } },
      { label: 'Too small', values: { ...defaults, text: 'the cat sat on the', window: '3' } },
      { label: 'Overflows', values: defaults },
      { label: 'Keep the subject', values: { ...defaults, strategy: 'first' } },
    ],
    generate: contextWindowSteps,
    codeLabel: 'Pseudocode',
  },
  code: contextWindowCode,
  prosCons: {
    pros: ['A fixed window keeps the cost of each step bounded', 'Dropping the oldest tokens is simple and keeps the latest context', 'Keeping the start protects instructions that must always apply'],
    cons: ['Anything dropped is gone: the model cannot recall it', 'Bigger windows cost more memory and time per token', 'Splicing the start and the end can join text that does not read well'],
    useWhen: ['Long chats and documents: decide on purpose what stays in the window'],
    avoidWhen: ['Relying on the model to remember something that has scrolled out of its window: store it and put it back in (see RAG)'],
  },
  applications: [
    'Chat apps drop or summarise old turns once a conversation gets long',
    'Model providers advertise context lengths, such as 128 thousand or a million tokens',
    'Retrieval puts only the relevant parts of a large document into the window',
  ],
  commonMistakes: [
    'Assuming the model remembers the start of a long chat: if it was dropped, it is gone.',
    'Dropping the system message along with old turns, so the app\'s rules stop applying.',
    'Counting words instead of tokens: windows are measured in tokens.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The window keeps "the bird sat on the"; "the fish saw" was dropped. What does the model most likely predict?',
      view: dropped.view,
      options: ['tree, a place for the bird', 'pond, a place for the fish', 'fish', '<end>'],
      answer: 0,
      explanation: 'The model only sees the window. The fish is gone, so it predicts a place for the bird: tree.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What happens to tokens outside the context window?',
      options: ['They have no effect on the output', 'They count half as much', 'The model reads them later', 'They are moved to the end'],
      answer: 0,
      explanation: 'The model only computes over the tokens in its window.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'With 8 tokens and a window of 5, which tokens does this line keep?',
      code: 'kept = [...tokens.slice(0, 2), ...tokens.slice(-(window - 2))]',
      options: ['The first 2 and the last 3', 'The last 5', 'The first 5', 'All 8'],
      answer: 0,
      explanation: 'slice(0, 2) keeps the first two, and slice(-3) the last three: 5 tokens in all.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do chat apps often keep the system message when a chat gets long?',
      options: ['So the app\'s instructions keep applying', 'Because it is the newest message', 'To make the window bigger', 'Because the model cannot read user messages'],
      answer: 0,
      explanation: 'A sliding window would drop the system message first; keeping the start protects it.',
    },
  ],
  summary: [
    'A model reads at most its context window of tokens at once.',
    'Tokens outside the window cannot affect the output.',
    'Drop the oldest tokens, or keep the start and drop the middle.',
    'Choose what stays in the window on purpose.',
  ],
};

export default content;
