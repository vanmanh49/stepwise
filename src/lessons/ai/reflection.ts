import { ON_OFF, REFLECTION_TASKS, reflectionCode, reflectionSteps } from '../../ai/scenarios/reflection';
import type { LessonContent } from '../../types/lesson';

const defaults = { task: 'sam-weather', critic: 'on', retries: '1' };

const caught = reflectionSteps(defaults);
// The critic has just failed the °F draft, with a retry left: the learner predicts the next draft.
const failedCheck = caught.find((s) => s.title.startsWith('Critic: 0'))!;

const content: LessonContent = {
  overview:
    'Models make mistakes they could have caught. Reflection adds a second look: a critic checks each draft against the task\'s requirements, and a failed check goes back to the model with a note so it can revise. This lesson runs an agent whose simulated flaw writes °F when Sam wants °C, with the critic on and off.',
  concept: [
    'Requirements are checks a finished task must pass, such as "temperature in °C" or "cites a document".',
    'The critic checks a draft before it counts: here, an email before it is sent, because a sent email can\'t be taken back.',
    'A failed check becomes feedback in the context, and the model revises. A retry limit stops endless revising.',
    'A critic only catches what it checks: on weather-compare it has no unit check, so °F slips through. Real critics are often a second model call, with the same limits.',
  ],
  howItWorks: [
    'The model writes a draft (the email body or the answer).',
    'The critic runs each requirement against the draft.',
    'If any fail and a retry is left, the failures go into the context and the model drafts again.',
    'The draft is sent or given once it passes, or when the retries run out.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'task', label: 'Task', type: 'choice', sample: defaults.task, options: REFLECTION_TASKS },
      { name: 'critic', label: 'Critic', type: 'choice', sample: defaults.critic, options: ON_OFF },
      { name: 'retries', label: 'Retries', type: 'number', sample: defaults.retries, help: '0 to 2 revisions.' },
    ],
    presets: [
      { label: 'Wrong unit caught', values: defaults },
      { label: 'No critic', values: { ...defaults, critic: 'off' } },
      { label: 'Retries 0', values: { ...defaults, retries: '0' } },
    ],
    generate: reflectionSteps,
    codeLabel: 'Pseudocode',
  },
  code: reflectionCode,
  prosCons: {
    pros: ['Catches mistakes before they reach anyone', 'Checks are explicit, so people can read and change them', 'Feedback tells the model exactly what to fix'],
    cons: ['Each check and revision costs calls and time', 'A critic misses anything it does not check', 'A model critic can be wrong or too easily satisfied'],
    useWhen: ['Outputs with clear rules: units, formats, citations, tests that must pass'],
    avoidWhen: ['Taste and judgment with no clear check, where a critic only adds noise'],
  },
  applications: [
    'Coding agents that run the tests and fix failures before finishing',
    'Writing tools that check a draft against a style guide',
    'Data pipelines that validate output before saving it',
  ],
  commonMistakes: [
    'Checking only the final answer, after an email or a payment already went out.',
    'No retry limit, so a model that cannot pass revises forever.',
    'Trusting a critic that checks nothing important.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The critic failed "temperature in °C" and one retry is left. What does the model do next?',
      view: failedCheck.view,
      options: ['Rewrite the email with 31°C before it is sent', 'Send the °F email anyway', 'Give up and answer', 'Delete the email'],
      answer: 0,
      explanation: 'The failure goes into the context, so the revised draft uses °C, and only then is the email sent.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the critic check the email before it is sent?',
      options: ['A sent email can\'t be taken back', 'Emails are cheaper to check', 'The answer is never checked', 'To save tokens'],
      answer: 0,
      explanation: 'Checking after an irreversible action can only report the mistake, not prevent it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'With retries 0, what does this line do after the first failed check?',
      code: 'if (failed.length === 0 || attempt === retries) break',
      options: ['Breaks out, so the failing draft is sent', 'Retries forever', 'Throws an error', 'Skips the email'],
      answer: 0,
      explanation: 'attempt 0 equals retries 0, so the loop ends and the °F draft goes out, with the failure on record.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'On weather-compare the °F email passed the critic. Why?',
      options: ['That task has no unit requirement to check', 'The critic was off', '°F is correct there', 'The email was not sent'],
      answer: 0,
      explanation: 'A critic only catches what it checks; weather-compare only checks that Sam was emailed and Tokyo is named.',
    },
  ],
  summary: [
    'A critic checks drafts against explicit requirements.',
    'Failures go back as feedback, and the model revises.',
    'Check before irreversible actions, and limit retries.',
    'A critic only catches what it checks.',
  ],
};

export default content;
