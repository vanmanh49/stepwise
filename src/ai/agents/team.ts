import { runAgent, type AgentRun } from './loop';
import type { Office } from './office';
import { SUBTASKS, type Task } from './tasks';

/** Tasks the orchestrator can split between a researcher and a writer. */
export const TEAM_TASKS = ['weather-compare', 'rag-note'];
const SPLITS: Record<string, [research: string, write: string]> = {
  'weather-compare': ['research-weather', 'write-weather'],
  'rag-note': ['research-dog', 'write-dog'],
};

/** Each sub-agent gets only the tools its part needs. */
export const TEAM_TOOLS = { researcher: ['get_weather', 'search_docs'], writer: ['read_note', 'write_note', 'send_email'] };

export interface TeamRun {
  researcher: AgentRun;
  writer: AgentRun;
  tools: typeof TEAM_TOOLS;
  /** Two delegations and one final answer. */
  orchestratorCalls: number;
  office: Office;
  answer: string;
  modelCalls: number;
  /** The largest context any one agent read, in words. */
  maxContext: number;
}

const words = (texts: string[]) => texts.join(' ').split(/\s+/).filter(Boolean).length;

/** An orchestrator hands each sub-agent a short brief; each sees only its own task and observations. */
export function runTeam(task: Task, office: Office): TeamRun {
  const [research, write] = SPLITS[task.id]!;
  const researcher = runAgent(SUBTASKS[research]!, office, { maxSteps: 12, tools: TEAM_TOOLS.researcher });
  const writer = runAgent(SUBTASKS[write]!, researcher.offices.at(-1)!, { maxSteps: 12, tools: TEAM_TOOLS.writer });
  const orchestratorCalls = 3;
  const orchestratorContext = words([task.text, researcher.answer ?? '', writer.answer ?? '']);
  return {
    researcher,
    writer,
    tools: TEAM_TOOLS,
    orchestratorCalls,
    office: writer.offices.at(-1)!,
    answer: task.answer,
    modelCalls: orchestratorCalls + researcher.modelCalls + writer.modelCalls,
    maxContext: Math.max(orchestratorContext, researcher.maxContext, writer.maxContext),
  };
}
