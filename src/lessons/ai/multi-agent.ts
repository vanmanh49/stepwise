import { multiAgentCode, multiAgentSteps, SETUPS, TEAM_TASKS } from '../../ai/scenarios/multi-agent';
import type { LessonContent } from '../../types/lesson';

const defaults = { task: 'weather-compare', setup: 'team' };

const team = multiAgentSteps(defaults);
// The researcher has reported back: the learner predicts the orchestrator's next move.
const reported = team.find((s) => s.title.startsWith('Researcher → orchestrator'))!;

const content: LessonContent = {
  overview:
    'One agent with every tool keeps everything in one growing context. A team splits the work: an orchestrator hands short briefs to specialist agents, each with only the tools it needs, and combines their results. This lesson runs the same task both ways and compares model calls with the largest context any agent had to read.',
  concept: [
    'The orchestrator breaks the task into parts and writes a brief for each sub-agent.',
    'Each sub-agent runs its own loop with its own small context and tool set: here, a researcher with search and weather tools, and a writer with notes and email.',
    'Only short results travel back, not whole traces, so no context has to hold everything.',
    'The trade-off is more model calls in total. Here the orchestrator is a fixed script; in real systems it is usually a model too.',
  ],
  howItWorks: [
    'The orchestrator sends the researcher its brief.',
    'The researcher runs its loop and reports a short result.',
    'The orchestrator sends the writer a brief with that result.',
    'The writer acts, and the orchestrator gives the final answer.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'task', label: 'Task', type: 'choice', sample: defaults.task, options: TEAM_TASKS },
      { name: 'setup', label: 'Setup', type: 'choice', sample: defaults.setup, options: SETUPS, help: 'single: one agent with every tool; team: an orchestrator, a researcher and a writer.' },
    ],
    presets: [
      { label: 'Single agent', values: { ...defaults, setup: 'single' } },
      { label: 'Team', values: defaults },
    ],
    generate: multiAgentSteps,
    codeLabel: 'Pseudocode',
  },
  code: multiAgentCode,
  prosCons: {
    pros: ['Each context stays small and on topic', 'Each agent gets only the tools it needs, which limits mistakes', 'Independent parts could run at the same time'],
    cons: ['More model calls in total, so more cost and time', 'Details can be lost in the hand-off briefs', 'Harder to debug: several traces instead of one'],
    useWhen: ['Large tasks with clearly separate parts, or contexts that would grow too big'],
    avoidWhen: ['Small tasks one agent handles easily: a team only adds calls'],
  },
  applications: [
    'Research systems where a lead agent dispatches search agents in parallel',
    'Coding tools with a planner agent and worker agents per file',
    'Support flows that route a case to a billing or a technical agent',
  ],
  commonMistakes: [
    'Splitting a small task, paying for extra calls with nothing gained.',
    'Briefs that leave out a detail the sub-agent needed.',
    'Giving every sub-agent every tool, which loses the safety of small tool sets.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The researcher reported "Paris 18°C, Tokyo 24°C." What does the orchestrator do next?',
      view: reported.view,
      options: ['Send the writer a brief to email Sam', 'Answer the user straight away', 'Run the researcher again', 'Email Sam itself'],
      answer: 0,
      explanation: 'Emailing is the writer\'s job: the orchestrator hands it a brief with the finding.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the team need more model calls than one agent?',
      options: ['The orchestrator\'s calls come on top of each agent\'s own', 'The tools are slower', 'The team repeats every tool call', 'It does not: it needs fewer'],
      answer: 0,
      explanation: 'Delegating and combining are extra calls, and each sub-agent also needs a call to answer.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line limit?',
      code: 'research = runAgent(researchBrief, [get_weather, search_docs])',
      options: ['The researcher can only use search and weather tools', 'How many steps the researcher takes', 'Who can read the result', 'Nothing'],
      answer: 0,
      explanation: 'The second argument is its tool set; it cannot send email even by mistake.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does the team gain?',
      options: ['Smaller, focused contexts for each agent', 'Fewer model calls', 'No need for tools', 'A different answer'],
      answer: 0,
      explanation: 'No agent reads everything; the largest context is smaller than the single agent\'s.',
    },
  ],
  summary: [
    'An orchestrator splits a task and briefs specialist agents.',
    'Each agent has its own small context and tool set.',
    'Teams cost more model calls but keep contexts small.',
    'Use a team for big, separable tasks; one agent for small ones.',
  ],
};

export default content;
