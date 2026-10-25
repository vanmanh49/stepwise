import { samplingCode, samplingSteps, TEMPERATURES, TOP_PS } from '../../ai/scenarios/sampling';
import type { LessonContent } from '../../types/lesson';

const defaults = { prompt: 'the cat sat on the', temperature: '1', topK: '34', topP: '1', seed: '1' };

// Hot, top-k 3, just after the cut: the learner predicts what renormalising gives.
const cut = samplingSteps({ ...defaults, temperature: '2', topK: '3' })[2]!;

const content: LessonContent = {
  overview:
    'Always taking the most likely word gives the same, often dull, text every time. Chat models sample instead: they draw a word at random, weighted by its probability. This lesson shows the three knobs that shape that draw: temperature, top-k and top-p.',
  concept: [
    'Temperature divides the logits before softmax. Below 1 the top word gets even more likely (more predictable text); above 1 the probabilities flatten out (more varied, riskier text).',
    'Top-k keeps only the k most likely words. Top-p keeps the most likely words until their probabilities add up to p, so it keeps few words when the model is sure and many when it is not.',
    'After cutting, the kept probabilities are divided by their total so they add up to 1 again (renormalised).',
    'The draw lays the probabilities end to end from 0 to 1 and picks the word whose slice contains a random number. This lesson seeds the random numbers so a run repeats; real chat apps use a fresh random number each time.',
  ],
  howItWorks: [
    'The tiny model gives its probabilities for the next word.',
    'The logits are divided by the temperature and softmax is applied again.',
    'Top-k, then top-p, cut the unlikely words.',
    'The kept words are renormalised, and a seeded random number picks one.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'prompt', label: 'Prompt', type: 'text', sample: defaults.prompt, help: '1 to 6 words from the toy corpus.' },
      { name: 'temperature', label: 'Temperature', type: 'choice', sample: defaults.temperature, options: TEMPERATURES },
      { name: 'topK', label: 'Top-k', type: 'number', sample: defaults.topK, help: '1 to 34 (34 keeps every word).' },
      { name: 'topP', label: 'Top-p', type: 'choice', sample: defaults.topP, options: TOP_PS, help: '1 keeps every word.' },
      { name: 'seed', label: 'Seed', type: 'number', sample: defaults.seed, help: '1 to 99: picks the random number.' },
    ],
    presets: [
      { label: 'No limits', values: defaults },
      { label: 'Cold', values: { ...defaults, temperature: '0.1' } },
      { label: 'Hot', values: { ...defaults, temperature: '2', seed: '7' } },
      { label: 'Top-k 3', values: { ...defaults, temperature: '2', topK: '3' } },
      { label: 'Top-p 0.75', values: { ...defaults, prompt: 'the', topP: '0.75' } },
    ],
    generate: samplingSteps,
    codeLabel: 'Pseudocode',
  },
  code: samplingCode,
  prosCons: {
    pros: ['Varied text: the same prompt can be answered in different ways', 'Temperature gives one simple dial between safe and creative', 'Top-k and top-p stop rare, nonsense words from being drawn'],
    cons: ['Answers are not repeatable unless the random seed is fixed', 'High temperatures produce mistakes and odd words', 'The settings need tuning for each use'],
    useWhen: ['Chat, writing and brainstorming, where variety helps', 'Generating several different candidates to choose from'],
    avoidWhen: ['You need one exact, repeatable answer, such as extracting a field: use temperature near 0 or greedy decoding'],
  },
  applications: [
    'Chat APIs expose temperature and top-p as request settings',
    'Code assistants often use low temperatures, story writers higher ones',
    'Some systems sample several answers and pick the best or the most common one',
  ],
  commonMistakes: [
    'Thinking temperature 0 is random: it removes the randomness and picks the top word (greedy).',
    'Setting top-k to 1 and expecting variety: only one word can ever be drawn.',
    'Forgetting to renormalise after cutting, so the probabilities no longer add up to 1.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Top-k 3 has cut every word below the line. After renormalising, what do the 3 kept words\' probabilities add up to?',
      view: cut.view,
      options: ['1', 'The same total as now', '0.75', '3'],
      answer: 0,
      explanation: 'Renormalising divides the kept probabilities by their total, so they add up to 1 again.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does a temperature above 1 do?',
      options: ['Flattens the distribution, so unlikely words are drawn more often', 'Makes the top word more likely', 'Removes the least likely words', 'Changes the model\'s weights'],
      answer: 0,
      explanation: 'Dividing logits by a number above 1 shrinks the gaps between them, so softmax spreads the probability out.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'With top-p 0.9 and the most likely word at 0.95, how many words does this line keep?',
      code: 'keep = smallestSetReaching(keep, topP)   // most likely first, until they sum to p',
      options: ['1', '0', 'All of them', '9'],
      answer: 0,
      explanation: 'The first word alone already reaches 0.9, so the set stops there.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does this lesson use a seed?',
      options: ['So the same settings always draw the same word', 'To make the model more accurate', 'To pick the temperature', 'Because sampling needs no randomness'],
      answer: 0,
      explanation: 'The seed fixes the random number, which makes runs repeatable. Without one, each run could draw a different word.',
    },
  ],
  summary: [
    'Sampling draws the next word at random, weighted by its probability.',
    'Temperature below 1 sharpens the distribution; above 1 flattens it.',
    'Top-k keeps the k most likely words; top-p keeps words until they reach p.',
    'Kept probabilities are renormalised before the random draw.',
  ],
};

export default content;
