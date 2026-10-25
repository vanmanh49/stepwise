import { MAX_NEW, nextTokenPredictionCode, nextTokenPredictionSteps } from '../../ai/scenarios/next-token-prediction';
import type { LessonContent } from '../../types/lesson';

const defaults = { prompt: 'the cat sat on the', count: '2' };

// The probabilities after "the dog sat on the": the learner predicts which word greedy decoding appends.
const dogProbs = nextTokenPredictionSteps({ prompt: 'the dog sat on the', count: '1' }).find((s) => s.view.kind === 'distribution')!;

const content: LessonContent = {
  overview:
    'A language model does one thing: given some text, it gives a probability to every possible next token. Writing a whole answer is just doing that again and again. This lesson runs the tiny model on your prompt and appends the most likely word each time.',
  concept: [
    'The model reads the tokens so far and outputs one score per word in its vocabulary. These scores are called logits.',
    'softmax turns logits into probabilities: it raises e to each score, so all are positive, then divides by the total so they add up to 1. A bigger gap between scores means a more confident prediction.',
    'Greedy decoding takes the most likely word, appends it, and runs the model again on the longer text. Every new word costs one more pass through the model.',
    'Generation stops at an end-of-sentence token, at a length limit, or when the text no longer fits the model\'s context. This model sees 6 tokens; real models see thousands or more.',
  ],
  howItWorks: [
    'Your prompt is split into words and looked up in the 34-token vocabulary.',
    'The model scores every word (the highest logits are shown).',
    'softmax turns the scores into probabilities; the most likely word is appended.',
    'This repeats until the word count is reached, the model predicts <end>, or the text is longer than 6 tokens.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'prompt', label: 'Prompt', type: 'text', sample: defaults.prompt, help: '1 to 6 words from the toy corpus, such as cat, dog, sat, on, the, mat.' },
      { name: 'count', label: 'Words to generate', type: 'number', sample: defaults.count, help: `1 to ${MAX_NEW}.` },
    ],
    presets: [
      { label: 'The cat sat on the…', values: defaults },
      { label: 'Start of a sentence', values: { prompt: 'the', count: '5' } },
      { label: 'A dog', values: { prompt: 'the dog sat on the', count: '1' } },
      { label: 'Context full', values: { prompt: 'the dog chased the cat in', count: '8' } },
    ],
    generate: nextTokenPredictionSteps,
    codeLabel: 'Pseudocode',
  },
  code: nextTokenPredictionCode,
  prosCons: {
    pros: ['One simple task, predicting the next token, is enough to write whole texts', 'Greedy decoding is fast and always gives the same answer', 'The probabilities show how sure the model is'],
    cons: ['Each new token needs another pass through the model, so long answers are slow', 'Greedy decoding can repeat itself or miss better sentences that start with a less likely word', 'The model only knows what its training text showed it'],
    useWhen: ['You want the single most likely continuation, such as autocomplete or short factual answers'],
    avoidWhen: ['You want varied or creative text: sample instead (next lessons)'],
  },
  applications: [
    'Chat assistants write every reply one token at a time',
    'Code editors suggest the next few tokens as you type',
    'Phone keyboards predict the next word from the ones before it',
  ],
  commonMistakes: [
    'Thinking the model plans a whole sentence first: it only ever picks the next token.',
    'Reading logits as probabilities: they can be negative and do not add up to 1 until softmax.',
    'Expecting a prompt longer than the context window to be read in full: the model can only see so many tokens.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'These are the probabilities after "the dog sat on the". Which word does greedy decoding append?',
      view: dogProbs.view,
      options: ['rug', 'mat', 'park', 'dog'],
      answer: 0,
      explanation: 'Greedy decoding takes the highest bar: rug, at 0.88. In the corpus the dog sits on the rug.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does softmax do to the logits?',
      options: ['Turns them into positive probabilities that add up to 1', 'Picks the largest one', 'Sorts them', 'Removes the negative ones'],
      answer: 0,
      explanation: 'softmax raises e to each score and divides by the total; the order stays the same.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'How many times does the model run to generate 5 words?',
      code: 'for (let n = 0; n < count; n++) {\n  logits = model(tokens)\n  next = argmax(softmax(logits))\n  tokens.push(next)\n}',
      options: ['5, once per word', '1, for the whole answer', '25', 'It depends on the vocabulary size'],
      answer: 0,
      explanation: 'Each word needs a fresh pass over all the tokens so far, so generation costs one pass per token.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does the model stop after "the cat sat on the mat"?',
      options: ['It predicts <end>, which ended every training sentence', 'It ran out of vocabulary', 'The prompt was too long', 'Greedy decoding always stops after one word'],
      answer: 0,
      explanation: 'Every corpus sentence ends with <end>, so the model learned that a full sentence is followed by it.',
    },
  ],
  summary: [
    'A language model gives every possible next token a probability.',
    'Logits are raw scores; softmax turns them into probabilities that add up to 1.',
    'Text is generated one token at a time, each added to the input for the next pass.',
    'Generation stops at an end token, a length limit, or the edge of the context window.',
  ],
};

export default content;
