import { agentLoopCode, agentLoopSteps, QUIRKS, TASK_IDS } from '../../ai/scenarios/agent-loop';
import type { LessonContent } from '../../types/lesson';

const defaults = { task: 'weather-compare', maxSteps: '8', quirk: 'none' };

// The first observation has just come back: the learner predicts the next move.
const firstObservation = agentLoopSteps(defaults)[2]!;

const content: LessonContent = {
  overview:
    'A chat model answers once. An agent keeps going: it thinks, calls a tool, reads the result, and decides again, until it can answer. This pattern is called ReAct (reason + act). This lesson runs a real agent loop in a tiny office, with a rule-based stand-in playing the model.',
  concept: [
    'The loop: the model reads its context and picks a move, either a tool call or the final answer.',
    'The runtime checks the call, runs the tool, and adds the result (the observation) to the context.',
    'A step limit stops a loop that would never finish. Real agents also limit time and cost.',
    'The stand-in has one simulated flaw you can switch on: answering before checking anything, the way a model can sound sure and be wrong.',
  ],
  howItWorks: [
    'Start the context with the user\'s task.',
    'Ask the model for its next move.',
    'If it is a tool call, run it and add the observation to the context; if it is an answer, stop.',
    'Repeat until the answer or the step limit.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'task', label: 'Task', type: 'choice', sample: defaults.task, options: TASK_IDS, help: 'weather-compare: "Is Paris warmer than Tokyo? Email Sam the answer."' },
      { name: 'maxSteps', label: 'Max steps', type: 'number', sample: defaults.maxSteps, help: '1 to 12 model calls.' },
      { name: 'quirk', label: 'Simulated flaw', type: 'choice', sample: defaults.quirk, options: QUIRKS, help: 'answers-early: answers before calling any tool.' },
    ],
    presets: [
      { label: 'Weather compare', values: defaults },
      { label: 'RAG to a note', values: { ...defaults, task: 'rag-note' } },
      { label: 'Too few steps', values: { ...defaults, maxSteps: '1' } },
      { label: 'Overconfident', values: { ...defaults, quirk: 'answers-early' } },
    ],
    generate: agentLoopSteps,
    codeLabel: 'Pseudocode',
  },
  code: agentLoopCode,
  prosCons: {
    pros: ['Handles tasks that need several tools and steps', 'Each observation lets the model adjust its next move', 'The trace shows exactly what the agent did and why'],
    cons: ['Every step is a model call: slower and costlier than one answer', 'Mistakes can compound over many steps', 'Needs limits, or a confused agent loops forever'],
    useWhen: ['Tasks that need fresh data and several actions, such as look up, compare, then send'],
    avoidWhen: ['Questions one model call can answer: a loop only adds cost'],
  },
  applications: [
    'Coding agents that read files, run tests and edit code in a loop',
    'Research assistants that search, read and summarise',
    'Support agents that look up an order, then act on it',
  ],
  commonMistakes: [
    'No step limit: a stuck agent keeps calling tools and spending money.',
    'Trusting an answer the agent gave without any tool call.',
    'Not putting observations back into the context, so the model never sees the results.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The weather in Paris has come back. What is the agent\'s next move?',
      view: firstObservation.view,
      options: ['Call get_weather for Tokyo', 'Answer straight away', 'Email Sam', 'Call get_weather for Paris again'],
      answer: 0,
      explanation: 'To compare, it still needs Tokyo\'s weather; the plan only moves on to email Sam once it has both.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is an observation?',
      options: ['A tool\'s result, added to the context', 'The model\'s final answer', 'The user\'s task', 'A log the model never sees'],
      answer: 0,
      explanation: 'The observation is how the model learns what its action did.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line protect against?',
      code: 'for (let step = 1; step <= maxSteps; step++) {',
      options: ['An agent that never finishes', 'Wrong tool arguments', 'Prompt injection', 'Slow tools'],
      answer: 0,
      explanation: 'The step limit ends the loop even if the model never answers.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The overconfident agent answered "Yes, Paris is warmer." after 0 tool calls. Why is it wrong?',
      options: ['It never checked the weather', 'The tools were broken', 'Paris is warmer', 'The step limit was too low'],
      answer: 0,
      explanation: 'Without calling get_weather, the answer is a guess: Tokyo (24°C) is warmer than Paris (18°C).',
    },
  ],
  summary: [
    'An agent is a model in a loop: think, act, observe, repeat.',
    'Tool results go back into the context as observations.',
    'A step limit keeps the loop from running forever.',
    'An answer without any tool call is only a guess.',
  ],
};

export default content;
