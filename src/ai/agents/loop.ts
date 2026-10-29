import type { ToolCall } from '../standin';
import { OFFICE_TOOLS, recall, runOfficeTool, type Office } from './office';
import { decide, type Context, type Quirk } from './policy';
import type { Task } from './tasks';

export type Guard = 'spotlight' | 'allowlist';

export interface AgentOptions {
  /** Most model calls in one run. */
  maxSteps: number;
  quirks?: Quirk[];
  /** What an earlier session leaves in the context. */
  memory?: 'none' | 'chat' | 'notes';
  /** The earlier session's chat lines, for chat memory. */
  history?: string[];
  /** Write the goals as a numbered plan first, and check it before answering. */
  planner?: boolean;
  /** Check drafts against the task's requirements and revise up to `retries` times. */
  critic?: { retries: number };
  guards?: Guard[];
  approval?: 'never' | 'risky' | 'every';
  /** The human's answer to every approval request. */
  decision?: 'approve' | 'deny';
  transport?: 'direct' | 'mcp';
  server?: 'office' | 'weather';
}

export type AgentEvent =
  | { kind: 'recall'; source: 'chat' | 'notes'; items: string[] }
  | { kind: 'plan'; steps: string[] }
  | { kind: 'thought'; text: string }
  | { kind: 'action'; call: ToolCall; injected: boolean }
  | { kind: 'rpc'; request: object; response: object }
  | { kind: 'approval'; call: ToolCall; decision: 'approve' | 'deny' }
  | { kind: 'blocked'; call: ToolCall; reason: string }
  | { kind: 'observation'; text: string; ok: boolean }
  | { kind: 'critique'; checks: { label: string; pass: boolean }[] }
  | { kind: 'plan-check'; step: number }
  | { kind: 'answer'; text: string }
  | { kind: 'stop'; reason: 'answered' | 'max-steps' };

export interface AgentRun {
  events: AgentEvent[];
  /** The office after each event. */
  offices: Office[];
  answer?: string;
  modelCalls: number;
  toolCalls: number;
  /** The largest context the model read, in words. */
  maxContext: number;
}

/** The earlier session that chat memory carries over. The preference is its oldest line. */
export const SESSION_1: readonly string[] = [
  'user: Sam likes temperatures in °C, remember that.',
  'assistant: Noted.',
  'user: What is 17 + 25?',
  'assistant: 42.',
  'user: And the weather in Tokyo?',
  'assistant: Sunny, and warm.',
];

/** Words of chat history that fit in the context; just too few for SESSION_1's oldest line. */
export const CHAT_BUDGET = 24;

const wordCount = (texts: string[]) => texts.reduce((n, t) => n + t.split(/\s+/).filter(Boolean).length, 0);

/** Whole lines, newest first, while they fit the budget; returned oldest first. */
function carryChat(history: string[]): string[] {
  const kept: string[] = [];
  let words = 0;
  for (const line of history.toReversed()) {
    words += wordCount([line]);
    if (words > CHAT_BUDGET) break;
    kept.unshift(line);
  }
  return kept;
}

export function runAgent(task: Task, start: Office, o: AgentOptions): AgentRun {
  const events: AgentEvent[] = [];
  const offices: Office[] = [];
  let office = start;
  const push = (e: AgentEvent) => {
    events.push(e);
    offices.push(office);
  };
  const quirks = o.quirks ?? [];
  const ctx: Context = {
    task, outcomes: {}, seen: [], notes: [], feedback: [], available: new Set(OFFICE_TOOLS.map((t) => t.name)), office, injected: [], planChecks: [],
  };

  if (o.memory === 'chat' && o.history) {
    const items = carryChat(o.history);
    ctx.notes.push(...items);
    push({ kind: 'recall', source: 'chat', items });
  }
  if (o.memory === 'notes') {
    const items = recall(office, task.recallWords);
    ctx.notes.push(...items.map((name) => office.notes[name]!));
    push({ kind: 'recall', source: 'notes', items });
  }
  if (o.planner) push({ kind: 'plan', steps: task.goals.map((g) => g.label) });

  let modelCalls = 0;
  let toolCalls = 0;
  let maxContext = 0;
  const finish = (reason: 'answered' | 'max-steps', answer?: string): AgentRun => {
    push({ kind: 'stop', reason });
    return { events, offices, ...(answer !== undefined && { answer }), modelCalls, toolCalls, maxContext };
  };

  while (modelCalls < o.maxSteps) {
    modelCalls++;
    maxContext = Math.max(maxContext, wordCount([task.text, ...ctx.notes, ...ctx.seen, ...ctx.feedback]));
    ctx.office = office;
    const move = decide(ctx, quirks);
    push({ kind: 'thought', text: move.thought });

    if ('answer' in move) {
      const missed = o.planner ? task.goals.findIndex((g, i) => ctx.outcomes[i] === undefined && ctx.available.has(g.call.name) && !ctx.planChecks.includes(i)) : -1;
      if (missed >= 0) {
        ctx.planChecks.push(missed);
        ctx.feedback.push(`Plan check: step ${missed + 1} (${task.goals[missed]!.label}) is not done.`);
        push({ kind: 'plan-check', step: missed });
        continue;
      }
      push({ kind: 'answer', text: move.answer });
      return finish('answered', move.answer);
    }

    const { call, goal } = move;
    push({ kind: 'action', call, injected: goal === 'injected' });
    const out = runOfficeTool(office, call);
    toolCalls++;
    office = out.office;
    const text = out.result.ok ? out.result.text : out.result.error;
    push({ kind: 'observation', text, ok: out.result.ok });
    ctx.seen.push(text);
    if (goal === 'injected') ctx.injected.push(call.name);
    else ctx.outcomes[goal] = out.result.ok ? { kind: 'done' } : { kind: 'error', error: out.result.error };
  }
  return finish('max-steps');
}
