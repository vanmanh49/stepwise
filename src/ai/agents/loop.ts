import type { ToolCall } from '../standin';
import { request, rpc, type RpcResponse } from './mcp';
import { OFFICE_TOOLS, recall, RISKY, runOfficeTool, type Office, type ToolResult } from './office';
import { decide, type Context, type Quirk } from './policy';
import type { Requirement, Task } from './tasks';

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
  /** The only tools this agent may call (direct transport); all office tools when left out. */
  tools?: string[];
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

/** Tool output that can carry text from outside, which spotlighting marks as data. */
const UNTRUSTED = new Set(['read_note', 'search_docs']);

/** A tools/call response as a tool result: protocol errors and isError results both fail. */
function resultOf(response: RpcResponse): ToolResult {
  if ('error' in response) return { ok: false, error: response.error.message };
  const text = (response.result.content as { text: string }[])[0]?.text ?? '';
  return response.result.isError ? { ok: false, error: text } : { ok: true, text };
}

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
    task, outcomes: {}, seen: [], notes: [], feedback: [], available: new Set(o.tools ?? OFFICE_TOOLS.map((t) => t.name)), office, injected: [], planChecks: [],
  };

  const mcp = o.transport === 'mcp';
  const server = o.server ?? 'office';
  let rpcId = 0;
  if (mcp) {
    const req = request(++rpcId, 'tools/list');
    const { response } = rpc(server, office, req);
    push({ kind: 'rpc', request: req, response });
    const listed = 'result' in response ? (response.result.tools as { name: string }[]) : [];
    ctx.available = new Set(listed.map((t) => t.name));
  }
  /** One tool call, direct or as an MCP tools/call request. */
  const callTool = (call: ToolCall): { office: Office; result: ToolResult } => {
    if (!mcp) return runOfficeTool(office, call);
    const req = request(++rpcId, 'tools/call', { name: call.name, arguments: call.args });
    const out = rpc(server, office, req);
    push({ kind: 'rpc', request: req, response: out.response });
    return { office: out.office, result: resultOf(out.response) };
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

  let retries = o.critic?.retries ?? 0;
  /** Records a critique; true when the draft failed and a retry is left, so the model should try again. */
  const critique = (stage: Requirement['stage'], text: string): boolean => {
    if (!o.critic) return false;
    const checks = task.requirements.filter((r) => r.stage === stage).map((r) => ({ label: r.label, pass: r.check(office, text) }));
    if (checks.length === 0) return false;
    push({ kind: 'critique', checks });
    const failed = checks.filter((c) => !c.pass);
    if (failed.length === 0 || retries === 0) return false;
    retries--;
    ctx.feedback.push(...failed.map((c) => `Critic: the draft fails "${c.label}".`));
    return true;
  };
  /** A call that did not run: a denial or a block. */
  const refuse = (goal: number | 'injected', name: string, kind: 'denied' | 'blocked', note: string) => {
    ctx.feedback.push(note);
    if (goal === 'injected') ctx.injected.push(name);
    else ctx.outcomes[goal] = { kind };
  };

  let modelCalls = 0;
  if (o.planner) {
    // Writing the plan is a model call of its own, and the plan stays in the context.
    modelCalls++;
    const steps = task.goals.map((g) => g.label);
    ctx.notes.push(...steps.map((s, i) => `${i + 1}. ${s}`));
    push({ kind: 'plan', steps });
  }
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
      if (critique('answer', move.answer)) continue;
      push({ kind: 'answer', text: move.answer });
      return finish('answered', move.answer);
    }

    const { call, goal } = move;
    if (o.guards?.includes('allowlist') && !task.allowedTools.includes(call.name)) {
      const reason = `${call.name} is not allowed for this task`;
      push({ kind: 'blocked', call, reason });
      refuse(goal, call.name, 'blocked', reason);
      continue;
    }
    if (call.name === 'send_email' && critique('email', String(call.args.body))) continue;
    if (o.approval === 'every' || (o.approval === 'risky' && RISKY.has(call.name))) {
      const decision = o.decision ?? 'approve';
      push({ kind: 'approval', call, decision });
      if (decision === 'deny') {
        const note = `The user denied ${call.name}.`;
        push({ kind: 'observation', text: note, ok: false });
        refuse(goal, call.name, 'denied', note);
        continue;
      }
    }
    push({ kind: 'action', call, injected: goal === 'injected' });
    const out = callTool(call);
    toolCalls++;
    office = out.office;
    const raw = out.result.ok ? out.result.text : out.result.error;
    const text = o.guards?.includes('spotlight') && UNTRUSTED.has(call.name) ? `«data» ${raw} «/data»` : raw;
    push({ kind: 'observation', text, ok: out.result.ok });
    ctx.seen.push(text);
    if (goal === 'injected') ctx.injected.push(call.name);
    else ctx.outcomes[goal] = out.result.ok ? { kind: 'done' } : { kind: 'error', error: out.result.error };
  }
  return finish('max-steps');
}
