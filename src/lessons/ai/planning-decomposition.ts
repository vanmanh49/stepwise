import { ON_OFF, PLAN_TASKS, planningDecompositionCode, planningDecompositionSteps, QUIRKS } from '../../ai/scenarios/planning-decomposition';
import type { LessonContent } from '../../types/lesson';

const defaults = { task: 'weather-compare', planner: 'on', quirk: 'skips-step' };

const caught = planningDecompositionSteps(defaults);
// The agent has just tried to answer with step 4 undone: the learner predicts what the plan check does.
const beforeCheck = caught[caught.findIndex((s) => s.title.startsWith('Plan check')) - 1]!;

const content: LessonContent = {
  overview:
    'Some tasks have several parts: "find this, compare it, then email Sam". A model working step by step can lose track and forget a part. Planning writes the parts down first as a numbered plan, and the runtime checks the plan before the agent may finish. This lesson runs the same task with and without a plan.',
  concept: [
    'Decomposition splits a task into sub-goals that are each one tool call or answer.',
    'The plan is written before acting, so every part is on record from the start.',
    'A plan check compares the plan with what was done. An undone step sends the agent back instead of letting it answer.',
    'The stand-in\'s simulated flaw here is skipping the last part of a task, a common real failure in long tasks.',
  ],
  howItWorks: [
    'The model writes the task\'s parts as a numbered plan.',
    'The agent works through them with the usual loop, ticking each one off.',
    'When it tries to answer, the runtime checks the plan for undone steps.',
    'An undone step goes back into the context, and the agent does it before answering.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'task', label: 'Task', type: 'choice', sample: defaults.task, options: PLAN_TASKS },
      { name: 'planner', label: 'Planner', type: 'choice', sample: defaults.planner, options: ON_OFF },
      { name: 'quirk', label: 'Simulated flaw', type: 'choice', sample: defaults.quirk, options: QUIRKS, help: 'skips-step: forgets the last part of the task.' },
    ],
    presets: [
      { label: 'No plan', values: { ...defaults, planner: 'off' } },
      { label: 'Plan', values: { ...defaults, quirk: 'none' } },
      { label: 'Plan catches a skipped step', values: defaults },
    ],
    generate: planningDecompositionSteps,
    codeLabel: 'Pseudocode',
  },
  code: planningDecompositionCode,
  prosCons: {
    pros: ['Nothing in a multi-part task is forgotten', 'The plan shows a person what the agent intends before it acts', 'Progress is easy to check: ticked steps against the plan'],
    cons: ['Writing a plan costs an extra model call', 'A wrong plan is followed faithfully', 'Plans can go stale when an observation changes what is needed'],
    useWhen: ['Tasks with several parts or long chains of tool calls'],
    avoidWhen: ['One-step tasks, where a plan only adds a call'],
  },
  applications: [
    'Coding agents that write a to-do list before editing files',
    'Research agents that outline their questions before searching',
    'Workflow tools that show a plan for a person to approve',
  ],
  commonMistakes: [
    'Letting the agent answer without checking the plan, so skipped steps go unnoticed.',
    'Never revising the plan when a tool result shows it is wrong.',
    'Making steps too big, so one step hides several actions.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The agent wants to answer, but plan step 4 (email Sam) is not ticked off. What happens next?',
      view: beforeCheck.view,
      options: ['The plan check sends it back to step 4', 'It answers anyway', 'It starts the plan again from step 1', 'It deletes the plan'],
      answer: 0,
      explanation: 'The runtime finds the undone step and adds it to the context, so the agent emails Sam before answering.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What happened without a plan when the model skipped the last part?',
      options: ['It answered without emailing Sam, and nothing noticed', 'It emailed Sam twice', 'It refused to answer', 'The tool failed'],
      answer: 0,
      explanation: 'With nothing written down, the forgotten part simply never happened.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line do when a plan step is not done?',
      code: "if (missing) { context.push('step ' + missing + ' is not done'); continue }   // plan check",
      options: ['Puts the missing step in the context and keeps looping', 'Stops with an error', 'Answers anyway', 'Removes the step'],
      answer: 0,
      explanation: 'continue goes back to the model, which now sees which step is missing.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is a cost of planning?',
      options: ['An extra model call, and a wrong plan is followed faithfully', 'It always makes answers wrong', 'It removes tools', 'It uses no tokens'],
      answer: 0,
      explanation: 'The plan is only as good as the model that wrote it, and writing it is one more call.',
    },
  ],
  summary: [
    'Decomposition splits a task into numbered sub-goals.',
    'The plan is written before acting.',
    'A plan check stops the agent from finishing with steps undone.',
    'Plans cost a call and must be revised when facts change.',
  ],
};

export default content;
