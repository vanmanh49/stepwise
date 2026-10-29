import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import type { ToolCall } from '../standin';
import type { AgentEvent, AgentRun } from './loop';
import { RISKY, type Office } from './office';

/** The newest trace rows shown, so long runs stay readable on a phone. */
const TRACE_ROWS = 12;

export const callText = (call: ToolCall) => `${call.name}(${JSON.stringify(call.args)})`;

const LABEL: Record<AgentEvent['kind'], string> = {
  recall: 'memory', plan: 'plan', thought: 'thought', action: 'action', rpc: 'mcp', approval: 'human', blocked: 'guard',
  observation: 'observation', critique: 'critic', 'plan-check': 'plan', answer: 'answer', stop: 'stop',
};

function rpcSummary(e: Extract<AgentEvent, { kind: 'rpc' }>): string {
  const req = e.request as { method: string; params?: { name?: string } };
  const res = e.response as { result?: { tools?: unknown[]; content?: { text: string }[]; isError?: boolean }; error?: { code: number; message: string } };
  const target = req.params?.name ? ` ${req.params.name}` : '';
  if (res.error) return `${req.method}${target} → error ${res.error.code}: ${res.error.message}`;
  if (res.result?.tools) return `${req.method} → ${res.result.tools.length} tools`;
  return `${req.method}${target} → ${res.result?.isError ? 'isError: ' : ''}${res.result?.content?.[0]?.text ?? ''}`;
}

function eventText(e: AgentEvent): string {
  switch (e.kind) {
    case 'recall': return `${e.source === 'chat' ? 'chat carried' : 'notes recalled'}: ${e.items.join(' | ') || 'nothing'}`;
    case 'plan': return e.steps.map((s, i) => `${i + 1}. ${s}`).join('  ');
    case 'thought': return e.text;
    case 'action': return callText(e.call);
    case 'rpc': return rpcSummary(e);
    case 'approval': return `${callText(e.call)}: ${e.decision === 'approve' ? 'approved' : 'denied'}`;
    case 'blocked': return e.reason;
    case 'observation': return e.text;
    case 'critique': return e.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.label}`).join('  ');
    case 'plan-check': return `step ${e.step + 1} is not done`;
    case 'answer': return e.text;
    case 'stop': return e.reason === 'answered' ? 'answered' : 'out of steps';
  }
}

function eventRole(e: AgentEvent): Role {
  if (e.kind === 'answer') return 'found';
  if (e.kind === 'blocked' || (e.kind === 'action' && e.injected) || (e.kind === 'approval' && e.decision === 'deny')) return 'discarded';
  if (e.kind === 'observation' && !e.ok) return 'discarded';
  if (e.kind === 'critique' && e.checks.some((c) => !c.pass)) return 'discarded';
  return 'default';
}

/** The run so far, one row per event; the newest row is highlighted unless it has its own role. */
export function traceGrid(events: AgentEvent[], upTo: number): GridView {
  const from = Math.max(0, upTo + 1 - TRACE_ROWS);
  return {
    kind: 'grid',
    colLabels: ['trace'],
    rows: events.slice(from, upTo + 1).map((e, k) => {
      const i = from + k;
      const role = eventRole(e);
      return { label: LABEL[e.kind], cells: [{ id: `ev-${i}`, value: eventText(e), role: role === 'default' && i === upTo ? 'active' : role }] };
    }),
  };
}

const outside = (to: string) => !to.endsWith('@office.test');

/** Notes, then the outbox; rows that changed since `before` are highlighted, emails leaving the office are red. */
export function officeGrid(office: Office, before?: Office): GridView {
  const notes = Object.entries(office.notes).map(([name, text]) => ({
    label: `note ${name}`,
    cells: [{ id: `note-${name}`, value: text, role: (before && before.notes[name] !== text ? 'active' : 'default') as Role }],
  }));
  const emails = office.outbox.map((e, i) => ({
    label: `to ${e.to}`,
    cells: [{ id: `email-${i}`, value: e.body, role: (outside(e.to) ? 'discarded' : before && i >= before.outbox.length ? 'active' : 'default') as Role }],
  }));
  return { kind: 'grid', colLabels: ['office'], rows: [...notes, ...emails] };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function title(e: AgentEvent, run: AgentRun): string {
  switch (e.kind) {
    case 'recall':
      return e.source === 'chat' ? `Memory: carry ${plural(e.items.length, 'chat line')} into the context` : e.items.length > 0 ? `Memory: recall the notes ${e.items.join(', ')}` : 'Memory: no notes match';
    case 'plan': return `Plan: ${plural(e.steps.length, 'step')}`;
    case 'action': return `Call ${callText(e.call)}${e.injected ? ', as the hidden instruction said' : ''}`;
    case 'rpc': return `MCP ${rpcSummary(e)}`;
    case 'approval': return `Ask the human before ${e.call.name}: ${e.decision === 'approve' ? 'approved' : 'denied'}`;
    case 'blocked': return `Blocked: ${e.reason}`;
    case 'observation': return `Observation: ${e.text}`;
    case 'critique': return `Critic: ${e.checks.filter((c) => c.pass).length} of ${plural(e.checks.length, 'check')} pass`;
    case 'plan-check': return `Plan check: step ${e.step + 1} is not done`;
    case 'answer': return `Answer: "${e.text}"`;
    case 'stop':
      return e.reason === 'answered'
        ? `Done after ${plural(run.modelCalls, 'model call')} and ${plural(run.toolCalls, 'tool call')}`
        : `Stop: reached ${plural(run.modelCalls, 'model call')} without an answer`;
    case 'thought': return e.text;
  }
}

const WHY: Record<AgentEvent['kind'], string> = {
  recall: 'Memory is whatever the app puts back into the context before the model reads it.',
  plan: 'The plan lists the sub-goals up front, so none can be forgotten along the way.',
  thought: '',
  action: 'The model asks for a tool call; the runtime checks it and runs it.',
  rpc: 'Over MCP, the client sends a JSON-RPC request and the server answers it.',
  approval: 'This tool changes something that cannot be undone, so a person decides first.',
  blocked: 'A guard refused the call before it ran.',
  observation: 'The result goes back into the context, so the model can use it on its next turn.',
  critique: 'A critic checks the draft against the task\'s requirements before it counts.',
  'plan-check': 'The runtime compared the plan with what was done and sent the model back to the missing step.',
  answer: 'The model decided it had enough to answer.',
  stop: 'The loop ends when the model answers or the step limit is reached.',
};

type Panel = PanelsView['panels'][number];

/** The intro, then one step per event; a thought becomes part of the next step's explanation. `extra` adds a lesson's own panel. */
export function eventSteps(run: AgentRun, lineFor: (e: AgentEvent) => number, intro: Step, extra?: (upTo: number) => Panel | undefined): Step[] {
  const steps: Step[] = [intro];
  let thought: string | undefined;
  let modelCalls = 0;
  let toolCalls = 0;
  run.events.forEach((e, i) => {
    if (e.kind === 'thought' || e.kind === 'plan') modelCalls++;
    if (e.kind === 'thought') {
      thought = e.text;
      return;
    }
    if (e.kind === 'action') toolCalls++;
    const reason = e.kind === 'approval' && !RISKY.has(e.call.name) ? 'The policy asks before every tool, even safe ones like this.' : WHY[e.kind];
    const why = thought ? `The model thinks: "${thought}" ${reason}` : reason;
    thought = undefined;
    steps.push({
      title: title(e, run),
      why,
      codeLine: lineFor(e),
      variables: { 'model calls': modelCalls, 'tool calls': toolCalls },
      view: {
        kind: 'panels',
        panels: [
          ...[extra?.(i)].filter((p) => p !== undefined),
          { label: 'Trace', view: traceGrid(run.events, i) },
          { label: 'Office', view: officeGrid(run.offices[i]!, i > 0 ? run.offices[i - 1] : undefined) },
        ],
      },
    });
  });
  return steps;
}

export const STAND_IN = 'In this lesson a rule-based stand-in plays the model; real models choose their actions by learned judgment.';

/** The first step of an agent lesson: the user's task and the office the agent starts in. */
export function taskIntro(text: string, office: Office, codeLine: number, why: string): Step {
  return {
    title: `The task: "${text}"`,
    why: `${why} ${STAND_IN}`,
    codeLine,
    view: {
      kind: 'panels',
      panels: [
        { label: 'Trace', view: { kind: 'grid', colLabels: ['trace'], rows: [{ label: 'user', cells: [{ id: 'task', value: text, role: 'active' }] }] } },
        { label: 'Office', view: officeGrid(office) },
      ],
    },
  };
}
