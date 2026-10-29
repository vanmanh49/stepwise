import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { runAgent, type AgentEvent, type AgentRun } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById } from '../agents/tasks';
import { eventSteps, taskIntro } from '../agents/view';
import { EMPTY } from '../steps';

export const reflectionCode = `draft = model(context)   // a rule-based stand-in here
for (let attempt = 0; ; attempt++) {
  failed = critic ? requirements.filter((r) => !r.check(draft)) : []
  if (failed.length === 0 || attempt === retries) break
  context.push('Critic: ' + failed)   // feedback for the next try
  draft = model(context)   // revise
}
act(draft)   // send the email, or give the answer`;

export const REFLECTION_TASKS = ['sam-weather', 'weather-compare'];
export const ON_OFF = ['off', 'on'];
export const RETRIES = { min: 0, max: 2 };

const line = (snippet: string) => lineOf(reflectionCode, snippet);

function lineFor(e: AgentEvent): number {
  if (e.kind === 'critique') return line('failed = critic');
  if (e.kind === 'action' || e.kind === 'observation' || e.kind === 'answer' || e.kind === 'stop') return line('act(draft)');
  return line('draft = model(context)   // a rule-based');
}

/** The newest critique up to event `upTo`, as requirement | pass. */
function checksGrid(run: AgentRun, upTo: number): GridView | undefined {
  const last = run.events.slice(0, upTo + 1).findLast((e) => e.kind === 'critique');
  if (last?.kind !== 'critique') return undefined;
  return {
    kind: 'grid',
    colLabels: ['pass'],
    rows: last.checks.map((c, i) => ({ label: c.label, cells: [{ id: `check-${i}`, value: c.pass ? '✓' : '✗', role: c.pass ? 'found' : 'discarded' }] })),
  };
}

export function reflectionSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this agent", why, EMPTY);
  const id = readChoice(values, 'task', 'Task', REFLECTION_TASKS);
  if (!id.ok) return fail(id.why);
  const critic = readChoice(values, 'critic', 'Critic', ON_OFF);
  if (!critic.ok) return fail(critic.why);
  const retries = readInt(values, 'retries', 'Retries', RETRIES);
  if (!retries.ok) return fail(retries.why);

  const task = taskById(id.value)!;
  const on = critic.value === 'on';
  const run = runAgent(task, INITIAL_OFFICE, { maxSteps: 12, quirks: ['wrong-unit'], ...(on && { critic: { retries: retries.value } }) });
  const intro = taskIntro(
    task.text,
    INITIAL_OFFICE,
    line('draft = model(context)   // a rule-based'),
    `This model has a simulated flaw switched on: it writes temperatures in °F, and Sam wants °C. ${on ? `A critic checks each draft against the task's requirements, with ${retries.value} ${retries.value === 1 ? 'retry' : 'retries'} to fix it.` : 'No critic checks its work.'}`,
  );
  return eventSteps(run, lineFor, intro, (i) => {
    const view = checksGrid(run, i);
    return view && { label: 'Checks', view };
  });
}
