import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { CHAT_BUDGET, runAgent, SESSION_1, type AgentEvent } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById } from '../agents/tasks';
import { eventSteps, officeGrid, STAND_IN } from '../agents/view';
import { EMPTY, messageGrid } from '../steps';

export const agentMemoryCode = `// session 1 has ended; session 2 starts with an empty context
context = [task]
if (memory === 'chat') context.push(...newestLines(session1, 24))   // what fits
if (memory === 'notes') context.push(...notesMatching(task))   // long-term store
runAgentLoop(context)   // the loop from the last lesson`;

export const MEMORIES = ['none', 'chat', 'notes'];

const line = (snippet: string) => lineOf(agentMemoryCode, snippet);

function lineFor(e: AgentEvent): number {
  if (e.kind === 'recall') return e.source === 'chat' ? line("if (memory === 'chat')") : line("if (memory === 'notes')");
  return line('runAgentLoop(context)');
}

const sessionGrid = () =>
  messageGrid(
    SESSION_1.map((l) => {
      const [speaker, ...rest] = l.split(': ');
      return { speaker: speaker!, content: rest.join(': ') };
    }),
    'session1',
    (i) => (i === 0 ? 'active' : 'default'),
  );

export function agentMemorySteps(values: Record<string, string>): Step[] {
  const memory = readChoice(values, 'memory', 'Memory', MEMORIES);
  if (!memory.ok) return refusal("Can't run this agent", memory.why, EMPTY);

  const task = taskById('sam-weather')!;
  const run = runAgent(task, INITIAL_OFFICE, { maxSteps: 12, quirks: ['wrong-unit'], memory: memory.value as 'none' | 'chat' | 'notes', history: [...SESSION_1] });
  const intro: Step = {
    title: `Session 2 asks: "${task.text}"`,
    why: `In session 1 the user said Sam likes °C. This model has a simulated flaw: it writes °F unless °C is in its context. Whether it remembers depends on what memory puts back. Chat memory keeps the newest ${CHAT_BUDGET} words of the old chat. ${STAND_IN}`,
    codeLine: line('context = [task]'),
    view: {
      kind: 'panels',
      panels: [
        { label: 'Session 1', view: sessionGrid() },
        { label: 'Office', view: officeGrid(INITIAL_OFFICE) },
      ],
    },
  };
  return eventSteps(run, lineFor, intro);
}
