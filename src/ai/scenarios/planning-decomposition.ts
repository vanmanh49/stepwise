import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { runAgent, type AgentEvent, type AgentRun } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById, type Task } from '../agents/tasks';
import { eventSteps, taskIntro } from '../agents/view';
import { EMPTY, ON_OFF } from '../steps';

export const planningDecompositionCode = `plan = planner ? model.plan(task) : []   // numbered sub-goals
context = [task, plan]
while (true) {
  move = model(context)   // a rule-based stand-in here
  if (move.answer) {
    missing = plan.find((step) => !step.done)
    if (missing) { context.push('step ' + missing + ' is not done'); continue }   // plan check
    return move.answer
  }
  observe(run(move.toolCall))
}`;

/** Tasks with more than one sub-goal, where a plan has something to keep track of. */
export const PLAN_TASKS = ['weather-compare', 'sam-weather', 'rag-note'];
export const QUIRKS = ['none', 'skips-step'];

const line = (snippet: string) => lineOf(planningDecompositionCode, snippet);

function lineFor(e: AgentEvent): number {
  if (e.kind === 'plan') return line('plan = planner');
  if (e.kind === 'plan-check') return line('if (missing)');
  if (e.kind === 'answer' || e.kind === 'stop') return line('return move.answer');
  if (e.kind === 'action' || e.kind === 'observation') return line('observe(run(move.toolCall))');
  return line('move = model(context)');
}

/** The plan as a checklist: a step turns found once a matching tool call has succeeded by event `upTo`. */
function planGrid(task: Task, run: AgentRun, upTo: number): GridView {
  const done = new Set<number>();
  run.events.slice(0, upTo + 1).forEach((e, i) => {
    const next = run.events[i + 1];
    if (e.kind !== 'action' || next?.kind !== 'observation' || !next.ok || i + 1 > upTo) return;
    const g = task.goals.findIndex((goal) => goal.call.name === e.call.name && JSON.stringify(goal.call.args) === JSON.stringify(e.call.args));
    if (g >= 0) done.add(g);
  });
  return {
    kind: 'grid',
    colLabels: ['plan'],
    rows: task.goals.map((g, i) => ({ label: `${i + 1}`, cells: [{ id: `plan-${i}`, value: g.label, role: done.has(i) ? 'found' : 'default' }] })),
  };
}

export function planningDecompositionSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this agent", why, EMPTY);
  const id = readChoice(values, 'task', 'Task', PLAN_TASKS);
  if (!id.ok) return fail(id.why);
  const planner = readChoice(values, 'planner', 'Planner', ON_OFF);
  if (!planner.ok) return fail(planner.why);
  const quirk = readChoice(values, 'quirk', 'Quirk', QUIRKS);
  if (!quirk.ok) return fail(quirk.why);

  const task = taskById(id.value)!;
  const on = planner.value === 'on';
  const run = runAgent(task, INITIAL_OFFICE, { maxSteps: 12, planner: on, quirks: quirk.value === 'none' ? [] : ['skips-step'] });
  const flaw = quirk.value === 'skips-step' ? ' This model has a simulated flaw switched on: it forgets the last part of a task.' : '';
  const intro = taskIntro(
    task.text,
    INITIAL_OFFICE,
    line('plan = planner'),
    `This task has ${task.goals.length} parts. ${on ? 'The planner writes them down first and checks them before the agent may answer.' : 'There is no plan: the agent keeps the parts in mind as it goes.'}${flaw}`,
  );
  return eventSteps(run, lineFor, intro, on ? (i) => ({ label: 'Plan', view: planGrid(task, run, i) }) : undefined);
}
