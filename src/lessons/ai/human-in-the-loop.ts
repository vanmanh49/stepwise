import { APPROVALS, DECISIONS, HUMAN_TASKS, humanInTheLoopCode, humanInTheLoopSteps } from '../../ai/scenarios/human-in-the-loop';
import type { LessonContent } from '../../types/lesson';

const defaults = { task: 'weather-compare', approval: 'risky', decision: 'approve' };

const approve = humanInTheLoopSteps(defaults);
// Sam's address is known and the email is next: the learner predicts what happens before it is sent.
const beforeAsk = approve[approve.findIndex((s) => s.title.startsWith('Ask the human')) - 1]!;

const content: LessonContent = {
  overview:
    'Some actions can\'t be undone: sending an email, deleting a file, paying a bill. Human-in-the-loop means the agent pauses before them and shows a person exactly what it is about to do. The person approves or denies, and the agent carries on either way. This lesson runs the same tasks with different approval rules and decisions.',
  concept: [
    'An approval policy says which tool calls need a person: none, only risky ones, or all of them.',
    'The agent pauses with the exact call, such as the email\'s address and body, so the person sees what will really happen.',
    'A denial goes back to the agent as an observation. It must carry on without that action and say what it did not do.',
    'Asking about everything wears people out until they approve without reading; asking about nothing removes the safety. Most systems ask only before risky tools.',
  ],
  howItWorks: [
    'The model picks a tool call.',
    'If the policy needs approval for that tool, the agent pauses and shows the exact call.',
    'An approved call runs; a denied one becomes "the user denied …" in the context.',
    'The agent continues and reports what it did and did not do.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'task', label: 'Task', type: 'choice', sample: defaults.task, options: HUMAN_TASKS, help: 'weather-compare ends with an email; cleanup deletes a note.' },
      { name: 'approval', label: 'Ask before', type: 'choice', sample: defaults.approval, options: APPROVALS, help: 'never, risky tools (send, delete), or every tool.' },
      { name: 'decision', label: 'The person says', type: 'choice', sample: defaults.decision, options: DECISIONS },
    ],
    presets: [
      { label: 'Auto-send', values: { ...defaults, approval: 'never' } },
      { label: 'Approve', values: defaults },
      { label: 'Deny', values: { ...defaults, decision: 'deny' } },
      { label: 'Approve everything', values: { ...defaults, approval: 'every' } },
    ],
    generate: humanInTheLoopSteps,
    codeLabel: 'Pseudocode',
  },
  code: humanInTheLoopCode,
  prosCons: {
    pros: ['Irreversible actions only happen with a person\'s yes', 'The person sees the exact call, not a vague summary', 'A denial is handled cleanly instead of crashing the task'],
    cons: ['Slower: the agent waits for a person', 'Too many prompts and people stop reading them', 'Only as good as what the person is shown'],
    useWhen: ['Sending, deleting, paying, publishing: anything hard to take back'],
    avoidWhen: ['Read-only tools such as search or weather, where asking only adds friction'],
  },
  applications: [
    'Coding agents that ask before running commands or pushing code',
    'Email assistants that draft but wait for "send"',
    'Finance tools that need a person to approve each payment',
  ],
  commonMistakes: [
    'Showing a summary instead of the exact call, so the person approves something different.',
    'Asking before every tool, until approvals become automatic clicks.',
    'Not telling the agent about a denial, so it retries or pretends the action happened.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The agent knows Sam\'s address and wants to send the email. The policy asks before risky tools. What happens next?',
      view: beforeAsk.view,
      options: ['It pauses and shows the person the exact email', 'It sends the email at once', 'It deletes the note', 'It answers without emailing'],
      answer: 0,
      explanation: 'send_email is risky, so the agent stops and asks before it runs.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'The person denied the email. What should the agent do?',
      options: ['Carry on without it and say it did not email Sam', 'Send it anyway', 'Retry until approved', 'Stop with an error'],
      answer: 0,
      explanation: 'The denial is an observation; the agent finishes the rest and reports the missing action.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does the review show move.toolCall rather than a summary?',
      code: 'decision = human.review(move.toolCall)   // the exact call, before it runs',
      options: ['So the person approves exactly what will run', 'Summaries are slower', 'The model cannot summarise', 'It does not matter'],
      answer: 0,
      explanation: 'A summary can hide details; the exact call shows the real address and body.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why not ask before every tool?',
      options: ['People get worn out and approve without reading', 'It is not allowed', 'It makes the model wrong', 'Every tool is risky'],
      answer: 0,
      explanation: 'Approvals work when they are rare enough to be read; save them for risky tools.',
    },
  ],
  summary: [
    'Pause before irreversible actions and ask a person.',
    'Show the exact call, not a summary.',
    'A denial goes back to the agent, which reports what it did not do.',
    'Ask before risky tools, not before everything.',
  ],
};

export default content;
