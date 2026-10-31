import { CORPUS } from '../../ai/corpus';
import { LEARNING_RATES, MAX_TRAINING_STEPS, trainingLossCode, trainingLossSteps } from '../../ai/scenarios/training-loss';
import type { LessonContent } from '../../types/lesson';

const defaults = { sentence: 'the cat sat on the mat', lr: '0.5', steps: '20' };

// The very first guess, before any update: the learner predicts which way "cat" moves.
const firstGuess = trainingLossSteps(defaults)[0]!;

const content: LessonContent = {
  overview:
    'A model learns by guessing the next word, measuring how wrong it was (the loss), and nudging its numbers to be a little less wrong. This lesson trains a bigram model, the simplest language model there is, live in your browser, one step at a time.',
  concept: [
    'A bigram model keeps one row of scores for each previous word. softmax of that row is its guess for the next word. It starts at all zeros, so every word is equally likely.',
    'The loss for one example is −log of the probability given to the right next word. A confident right guess costs almost nothing; a confident wrong guess costs a lot.',
    'The gradient says which way each score should move to lower the loss. For softmax with this loss it is simply the probabilities minus 1 for the right word.',
    'Gradient descent subtracts the learning rate times the gradient. The tiny transformer in the other lessons was trained the same way (with a smarter step rule, Adam), only with a gradient worked out through every layer.',
  ],
  howItWorks: [
    'The sentence is split into word pairs: (the, cat), (cat, sat) and so on, ending with (mat, <end>).',
    'Each step takes the next pair and reads the model\'s guess from the previous word\'s row.',
    'The loss and the gradient are worked out for that guess.',
    'The row is updated, and the right word\'s probability goes up.',
    'After the last step, the average loss on the first pass is compared with the last pass.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'sentence', label: 'Sentence', type: 'choice', sample: defaults.sentence, options: [...CORPUS] },
      { name: 'lr', label: 'Learning rate', type: 'choice', sample: defaults.lr, options: LEARNING_RATES, help: 'How big each step is.' },
      { name: 'steps', label: 'Training steps', type: 'number', sample: defaults.steps, help: `1 to ${MAX_TRAINING_STEPS}.` },
    ],
    presets: [
      { label: 'The cat sat on the mat', values: defaults },
      { label: 'Small steps', values: { ...defaults, lr: '0.1' } },
      { label: 'Big steps', values: { ...defaults, lr: '2' } },
      { label: 'One step', values: { ...defaults, steps: '1' } },
    ],
    generate: trainingLossSteps,
    codeLabel: 'Pseudocode',
  },
  code: trainingLossCode,
  prosCons: {
    pros: ['The same loop (guess, measure, nudge) trains every modern model', 'Each step only needs the gradient, not a formula for the answer', 'Every number here can be checked by hand'],
    cons: ['A bigram model only sees one previous word, so it cannot tell "the cat sat on the" from "the dog sat on the"', 'Too large a learning rate can overshoot; too small takes forever', 'Training a real model takes huge amounts of text and compute'],
    useWhen: ['Learning the numbers of any model whose loss you can differentiate'],
    avoidWhen: ['A simple rule or a count already gives the answer'],
  },
  applications: [
    'Pretraining an LLM is this loop over trillions of tokens of text',
    'Fine-tuning runs the same loop on a smaller, focused dataset',
    'Loss curves are what teams watch to see whether a training run is working',
  ],
  commonMistakes: [
    'Thinking the loss is the number of wrong words: it is −log of the right word\'s probability, so it also punishes unsure right answers.',
    'Adding the gradient instead of subtracting it, which makes the loss grow.',
    'Expecting one step to fix a guess: each step only moves the scores a little.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the very first guess for the word after "the". After the update, what happens to the probability of "cat"?',
      view: firstGuess.view,
      options: ['It goes up', 'It goes down', 'It stays at 0.03', 'It becomes exactly 1'],
      answer: 0,
      explanation: 'The gradient for "cat" is negative (0.03 − 1), and subtracting a negative raises its score.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'The model gave the right word probability 1. What is the loss?',
      options: ['0', '1', '−1', 'Infinity'],
      answer: 0,
      explanation: '−log(1) is 0: nothing to fix.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What is the gradient for a word that is NOT the right next word?',
      code: 'grad = probs - oneHot(next)',
      options: ['Its probability (a positive number), so its score goes down', 'Its probability minus 1 (a negative number), so its score goes up', 'Always 0, because only the right word is updated', 'The loss'],
      answer: 0,
      explanation: 'oneHot is 0 for every other word, so its gradient is just its probability; subtracting it lowers that word\'s score.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why can\'t this bigram model learn that a cat sits on the mat and a dog on the rug?',
      options: ['It only sees the one previous word, "the"', 'The learning rate is too small', 'It has no <end> token', 'It never sees the word mat'],
      answer: 0,
      explanation: 'Both sentences reach "the" before mat or rug. Seeing further back needs more context, which is what attention adds.',
    },
  ],
  summary: [
    'Training is a loop: guess the next word, measure the loss, nudge the numbers.',
    'The loss is −log of the probability given to the right word.',
    'The gradient points uphill; subtracting learning rate × gradient goes downhill.',
    'The learning rate sets the step size; too big overshoots, too small is slow.',
  ],
};

export default content;
