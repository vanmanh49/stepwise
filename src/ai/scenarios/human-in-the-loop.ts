import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { runAgent, type AgentEvent } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById } from '../agents/tasks';
import { eventSteps, taskIntro } from '../agents/view';
import { EMPTY } from '../steps';

export const humanInTheLoopCode = `move = model(context)   // a rule-based stand-in here
if (needsApproval(move.tool, policy)) {   // never, risky tools, or every tool
  decision = human.review(move.toolCall)   // the exact call, before it runs
  if (decision === 'deny') { context.push('the user denied ' + move.tool); continue }
}
run(move.toolCall)`;

/** A task with a risky email, and one with a risky delete. */
export const HUMAN_TASKS = ['weather-compare', 'cleanup'];
export const APPROVALS = ['never', 'risky', 'every'];
export const DECISIONS = ['approve', 'deny'];

const line = (snippet: string) => lineOf(humanInTheLoopCode, snippet);

function lineFor(e: AgentEvent): number {
  if (e.kind === 'approval') return e.decision === 'deny' ? line("if (decision === 'deny')") : line('decision = human.review');
  if (e.kind === 'observation' && !e.ok && e.text.startsWith('The user denied')) return line("if (decision === 'deny')");
  if (e.kind === 'action' || e.kind === 'observation') return line('run(move.toolCall)');
  return line('move = model(context)');
}

export function humanInTheLoopSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this agent", why, EMPTY);
  const id = readChoice(values, 'task', 'Task', HUMAN_TASKS);
  if (!id.ok) return fail(id.why);
  const approval = readChoice(values, 'approval', 'Approval', APPROVALS);
  if (!approval.ok) return fail(approval.why);
  const decision = readChoice(values, 'decision', 'Decision', DECISIONS);
  if (!decision.ok) return fail(decision.why);

  const task = taskById(id.value)!;
  const policy = approval.value as 'never' | 'risky' | 'every';
  const run = runAgent(task, INITIAL_OFFICE, { maxSteps: 12, approval: policy, decision: decision.value as 'approve' | 'deny' });
  const asks = { never: 'The agent never asks: every tool runs straight away.', risky: 'The agent asks a person before tools that can\'t be undone: sending email and deleting notes.', every: 'The agent asks a person before every tool call.' }[policy];
  const intro = taskIntro(task.text, INITIAL_OFFICE, line('if (needsApproval'), `${asks} In this lesson the person answers "${decision.value}" every time.`);
  return eventSteps(run, lineFor, intro);
}
