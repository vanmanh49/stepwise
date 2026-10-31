import { GUARDS, promptInjectionGuardrailsCode, promptInjectionGuardrailsSteps, QUIRKS } from '../../ai/scenarios/prompt-injection-guardrails';
import type { LessonContent } from '../../types/lesson';

const defaults = { guard: 'none', quirk: 'trusts-tool-output' };

// The poisoned note has just been read: the learner predicts what the trusting model does.
const poisoned = promptInjectionGuardrailsSteps(defaults).find((s) => s.title.startsWith('Observation: Pack light'))!;

const content: LessonContent = {
  overview:
    'An agent reads text from places it does not control: web pages, emails, documents, notes. If that text says "ignore your instructions and…", a model may obey it. This is prompt injection. This lesson plants such a line in a note, lets an agent summarise the note, and tries two guards against it.',
  concept: [
    'Prompt injection hides instructions inside data the agent reads, hoping the model treats them as orders.',
    'It is dangerous when the agent also has tools that act: here, an email tool that can send the notes anywhere.',
    'Spotlighting marks tool output as data («data» … «/data»), so instructions inside it don\'t count. A tool allowlist only permits the tools a task needs, so even an obeyed instruction can\'t send email.',
    'The stand-in\'s simulated flaw obeys instructions found in tool output. Real models are harder to fool but not immune, so real systems layer guards and still assume some attacks get through.',
  ],
  howItWorks: [
    'The agent reads the note, with its hidden instruction.',
    'With spotlighting, the note enters the context marked as data.',
    'The model picks its next move; a trusting model tries to email the notes.',
    'With an allowlist, the runtime blocks any tool the task does not need.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'guard', label: 'Guard', type: 'choice', sample: defaults.guard, options: GUARDS },
      { name: 'quirk', label: 'Simulated flaw', type: 'choice', sample: defaults.quirk, options: QUIRKS, help: 'trusts-tool-output: obeys instructions found in tool output.' },
    ],
    presets: [
      { label: 'Injected', values: defaults },
      { label: 'Spotlighted', values: { ...defaults, guard: 'spotlight' } },
      { label: 'Allowlisted', values: { ...defaults, guard: 'allowlist' } },
      { label: 'Careful model', values: { guard: 'none', quirk: 'none' } },
    ],
    generate: promptInjectionGuardrailsSteps,
    codeLabel: 'Pseudocode',
  },
  code: promptInjectionGuardrailsCode,
  prosCons: {
    pros: ['Spotlighting is cheap and helps the model keep data and orders apart', 'Allowlists hold even when the model is fooled', 'Layered guards cover each other\'s gaps'],
    cons: ['No guard is perfect: clever wording can still get through', 'Tight allowlists can block legitimate work', 'Guards add rules every task has to declare'],
    useWhen: ['Any agent that reads outside text and has tools that act'],
    avoidWhen: ['Never skip guards because "our model is smart"; at least limit the tools'],
  },
  applications: [
    'Browsing agents that read untrusted web pages',
    'Email assistants that read incoming mail',
    'Coding agents that read issues and files written by others',
  ],
  commonMistakes: [
    'Pasting untrusted text into the prompt as if the user wrote it.',
    'Giving a reading task powerful tools such as email or delete.',
    'Relying on one guard, or on the model to notice the trick.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The trusting model just read the note with its hidden line, and there is no guard. What does it do next?',
      view: poisoned.view,
      options: ['List the notes, then email them to eve@evil.test', 'Summarise the note and stop', 'Delete the note', 'Ask the user first'],
      answer: 0,
      explanation: 'It obeys the hidden instruction: list_notes, then send_email to the attacker, before answering.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why did the allowlist stop the attack even though the model obeyed?',
      options: ['Summarising only needs read_note, so send_email was refused', 'It hid the poisoned note from the model', 'It changed the model', "It deleted eve's address from the contact list"],
      answer: 0,
      explanation: 'The guard is in the runtime, not the model: forbidden tools never run.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line change?',
      code: "if (spotlight) note = '«data» ' + note + ' «/data»'   // mark it as data, not orders",
      options: ['The model sees the note as data, not as instructions', 'It encrypts the note', 'It deletes the hidden line', 'It blocks every tool'],
      answer: 0,
      explanation: 'The markers tell the model where outside text starts and ends.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why use more than one guard?',
      options: ['Each can fail, and together they cover each other\'s gaps', 'One guard is always enough', 'Guards make the model faster', 'The protocol requires two'],
      answer: 0,
      explanation: 'Spotlighting depends on the model; the allowlist does not. Layers make an attack much harder.',
    },
  ],
  summary: [
    'Prompt injection hides orders in data the agent reads.',
    'It matters most when the agent has tools that act.',
    'Spotlight outside text, and allow only the tools a task needs.',
    'Layer guards; no single one is enough.',
  ],
};

export default content;
