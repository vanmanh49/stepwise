import { SCHEMA_IDS, structuredOutputCode, structuredOutputSteps } from '../../ai/scenarios/structured-output';
import { ON_OFF } from '../../ai/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { schema: 'food', constrained: 'on' };

// Free decoding has just picked "dog"; the learner predicts the word for the "ate" slot.
const freeSlot2 = structuredOutputSteps({ ...defaults, constrained: 'off' })[1]!;

const content: LessonContent = {
  overview:
    'Apps often need a model\'s output in an exact shape, such as JSON with given fields, so code can read it. A model writing freely has no idea what shape the app needs. Constrained decoding fixes that: at every step it removes the words the schema does not allow before the model picks. This lesson runs the tiny model both ways.',
  concept: [
    'A schema says what the output must look like: here, a sentence pattern with fixed words and fields, such as "the <animal> ate the <food>".',
    'Free decoding takes the model\'s most likely word at each step and checks the shape only at the end, when it is too late.',
    'Constrained decoding sets the logit of every disallowed word to −∞ (probability 0) and renormalises the rest, so the model can only pick an allowed word.',
    'Real systems turn a JSON schema or grammar into the set of allowed tokens at each step. This toy uses word tokens and a 5- or 6-word pattern, but the mask works the same way.',
  ],
  howItWorks: [
    'Start the text with the schema\'s first word.',
    'Run the model to get the next-word probabilities.',
    'If constrained, cut every word the current slot does not allow, and renormalise.',
    'Take the most likely word, append it, and move to the next slot; at the end, fill the JSON fields.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'schema', label: 'Schema', type: 'choice', sample: defaults.schema, options: SCHEMA_IDS, help: 'place: "the <animal> sat on the <place>"; food: "the <animal> ate the <food>".' },
      { name: 'constrained', label: 'Constrained', type: 'choice', sample: defaults.constrained, options: ON_OFF },
    ],
    presets: [
      { label: 'Constrained place', values: { schema: 'place', constrained: 'on' } },
      { label: 'Constrained food', values: defaults },
      { label: 'Free place (fits by luck)', values: { schema: 'place', constrained: 'off' } },
      { label: 'Free food (breaks the shape)', values: { schema: 'food', constrained: 'off' } },
    ],
    generate: structuredOutputSteps,
    codeLabel: 'Pseudocode',
  },
  code: structuredOutputCode,
  prosCons: {
    pros: ['The output always matches the schema, so code can parse it', 'No retries or repair needed', 'Works with any model that exposes its logits'],
    cons: ['The model is forced even when its favourite word was better, which can lower quality', 'Building the mask for a full JSON grammar is complex and costs time per token', 'A schema can be valid but still contain wrong values'],
    useWhen: ['Extracting fields, calling tools, or any output that code must parse'],
    avoidWhen: ['Free-form writing, where a fixed shape only gets in the way'],
  },
  applications: [
    'Model APIs offer "structured outputs" or a JSON mode that follows a given schema',
    'Function calling uses it so tool arguments always parse',
    'Open-source libraries constrain local models with grammars or regular expressions',
  ],
  commonMistakes: [
    'Asking for JSON in the prompt and trusting it: without constraints, the shape is only likely, not guaranteed.',
    'Forgetting to renormalise after the cut, so probabilities no longer add up to 1.',
    'Assuming valid JSON means correct data: the values can still be wrong.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Free decoding has written "the dog". The schema needs "ate" next. Which word does the model pick?',
      view: freeSlot2.view,
      options: ['sat, its most likely word, which breaks the schema', 'ate, because the schema needs it', 'bone', '<end>'],
      answer: 0,
      explanation: 'Free decoding ignores the schema and takes the top word. "the dog" is most often followed by "sat" in the toy corpus.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How does constrained decoding stop a disallowed word?',
      options: ['Sets its logit to −∞, so its probability is 0', 'Lowers the temperature', 'Retrains the model', 'Deletes it from the vocabulary forever'],
      answer: 0,
      explanation: 'The mask applies only at this step; the next slot has its own allowed words.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does this line run after the cut?',
      code: 'probs = probs / sum(probs)   // renormalise what is left',
      options: ['So the kept probabilities add up to 1 again', 'To make the cut words likely again', 'To pick a random word', 'It is not needed'],
      answer: 0,
      explanation: 'The cut removed some probability; dividing by what is left makes the kept words a proper distribution.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Free decoding filled the place schema correctly. What does that show?',
      options: ['It can fit by luck, but nothing guarantees it', 'Constraints are never needed', 'The model understood the schema', 'The schema was wrong'],
      answer: 0,
      explanation: 'The model\'s favourite words happened to fit; the food schema shows the same model breaking the shape.',
    },
  ],
  summary: [
    'A schema fixes the shape an app needs the output in.',
    'Free decoding can break the shape; the check comes too late.',
    'Constrained decoding cuts disallowed words (logit −∞) and renormalises.',
    'The output then always parses, though its values can still be wrong.',
  ],
};

export default content;
