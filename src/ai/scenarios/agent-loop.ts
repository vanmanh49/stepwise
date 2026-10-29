import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { runAgent, type AgentEvent } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById, TASKS } from '../agents/tasks';
import { eventSteps, taskIntro } from '../agents/view';
import { EMPTY } from '../steps';

export const agentLoopCode = `context = [task]
for (let step = 1; step <= maxSteps; step++) {
  move = model(context)   // a rule-based stand-in here
  if (move.answer) return move.answer
  result = run(move.toolCall)   // checked against the tool's schema first
  context.push(move.toolCall, result)   // the observation
}
return 'stopped: out of steps'`;

export const TASK_IDS = TASKS.map((t) => t.id);
export const QUIRKS = ['none', 'answers-early'];
export const MAX_STEPS_RANGE = { min: 1, max: 12 };

const line = (snippet: string) => lineOf(agentLoopCode, snippet);

function lineFor(e: AgentEvent): number {
  if (e.kind === 'action') return line('result = run(move.toolCall)');
  if (e.kind === 'observation') return line('context.push');
  if (e.kind === 'answer') return line('if (move.answer)');
  if (e.kind === 'stop') return e.reason === 'answered' ? line('if (move.answer)') : line("return 'stopped");
  return line('move = model(context)');
}

export function agentLoopSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this agent", why, EMPTY);
  const id = readChoice(values, 'task', 'Task', TASK_IDS);
  if (!id.ok) return fail(id.why);
  const maxSteps = readInt(values, 'maxSteps', 'Max steps', MAX_STEPS_RANGE);
  if (!maxSteps.ok) return fail(maxSteps.why);
  const quirk = readChoice(values, 'quirk', 'Quirk', QUIRKS);
  if (!quirk.ok) return fail(quirk.why);

  const task = taskById(id.value)!;
  const run = runAgent(task, INITIAL_OFFICE, { maxSteps: maxSteps.value, quirks: quirk.value === 'none' ? [] : ['answers-early'] });
  const intro = taskIntro(
    task.text,
    INITIAL_OFFICE,
    line('context = [task]'),
    quirk.value === 'answers-early'
      ? 'An agent is a model in a loop: think, call a tool, read the result, repeat. This model has a simulated flaw switched on: it answers before checking anything.'
      : `An agent is a model in a loop: think, call a tool, read the result, repeat, until it can answer or has used its ${maxSteps.value} steps.`,
  );
  return eventSteps(run, lineFor, intro);
}
