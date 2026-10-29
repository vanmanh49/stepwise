import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { checkArgs, reply, REQUESTS, runTool, TOOLS, type Message, type ToolCall } from '../standin';
import { EMPTY, messageGrid } from '../steps';

export const functionCallingCode = `tools = [get_weather(city: string), add(a: number, b: number)]
messages = [user(request)]
out = model(messages, tools)   // a rule-based stand-in here
if (out.toolCall) {
  error = checkArgs(out.toolCall, tools)   // names and types
  result = error ? { error } : run(out.toolCall)   // your code runs the tool
  messages.push(assistant(out.toolCall), tool(result))
  out = model(messages, tools)   // write the answer from the result
}
return out.text`;

export const REQUEST_IDS = REQUESTS.map((r) => r.id);
export const TOOL_CHOICES = ['all', 'none'];

const line = (snippet: string) => lineOf(functionCallingCode, snippet);
const callText = (call: ToolCall) => `${call.name}(${JSON.stringify(call.args)})`;

const toolsGrid: GridView = {
  kind: 'grid',
  colLabels: ['parameters', 'what it does'],
  rows: TOOLS.map((t) => ({
    label: t.name,
    cells: [
      { id: `${t.name}-params`, value: t.params.map((p) => `${p.name}: ${p.type}`).join(', '), role: 'default' },
      { id: `${t.name}-desc`, value: t.description, role: 'default' },
    ],
  })),
};

export function functionCallingSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this request", why, EMPTY);
  const request = readChoice(values, 'request', 'Request', REQUEST_IDS);
  if (!request.ok) return fail(request.why);
  const offered = readChoice(values, 'tools', 'Tools', TOOL_CHOICES);
  if (!offered.ok) return fail(offered.why);

  const tools = offered.value === 'all' ? TOOLS : [];
  const user: Message = { speaker: 'user', content: REQUESTS.find((r) => r.id === request.value)!.text, key: request.value };
  const messages: Message[] = [user];
  const grid = (highlight = messages.length - 1) => messageGrid(messages, 'msg', (i) => (i === highlight ? 'active' : 'default'));
  const steps: Step[] = [
    tools.length > 0
      ? {
          title: `Offer the model ${tools.length} tools: ${tools.map((t) => t.name).join(' and ')}`,
          why: 'Each tool is described by a name, its parameters with their types, and what it does. The descriptions go into the prompt. In this lesson a rule-based stand-in plays the model; real models learn to call tools in training.',
          codeLine: line('tools = ['),
          view: toolsGrid,
        }
      : {
          title: 'No tools offered',
          why: 'The model can only write text. In this lesson a rule-based stand-in plays the model; real models learn to call tools in training.',
          codeLine: line('tools = ['),
          view: { kind: 'grid', colLabels: ['tools'], rows: [{ label: 'none', cells: [{ id: 'no-tools', value: 'The model can only write text', role: 'discarded' }] }] },
        },
    {
      title: `The user asks: "${user.content}"`,
      why: 'The model reads the request together with the tool descriptions and decides whether a tool would help.',
      codeLine: line('messages = [user(request)]'),
      view: grid(),
    },
  ];
  const out = reply(messages, { tools });
  if (out.kind !== 'tool-call') {
    const text = out.kind === 'text' ? out.text : '';
    messages.push({ speaker: 'assistant', content: text });
    steps.push({
      title: `The model answers directly: "${text}"`,
      why: tools.length > 0 ? 'No tool fits this request, so the model just writes the answer.' : 'Without a tool the model cannot fetch live data; a good model says so instead of guessing.',
      next: 'Calling tools is easy to get wrong silently. The Evals lesson measures how often a system gets answers right.',
      codeLine: line('return out.text'),
      view: grid(),
    });
    return steps;
  }
  const call = out.call;
  messages.push({ speaker: 'assistant', content: callText(call) });
  steps.push({
    title: `The model asks for a tool call: ${callText(call)}`,
    why: 'The model does not run anything. It writes a structured request (a tool name and JSON arguments) and stops, waiting for the result.',
    codeLine: line('out = model(messages, tools)'),
    variables: { tool: call.name },
    view: grid(),
  });
  const tool = TOOLS.find((t) => t.name === call.name)!;
  const problem = checkArgs(tool, call.args);
  steps.push({
    title: problem ? `The arguments fail the check: ${problem}` : `The arguments pass the check: ${tool.params.map((p) => `${p.name} is a ${p.type}`).join(', ')}`,
    why: problem
      ? 'Models sometimes write arguments of the wrong type. Your code must check them against the schema before running anything.'
      : 'The names and types match the tool\'s parameters, so it is safe to run.',
    codeLine: line('error = checkArgs'),
    variables: { valid: problem ? 'no' : 'yes' },
    view: grid(),
  });
  const result = runTool(call);
  messages.push({ speaker: 'tool', content: result.ok ? result.result : result.error, key: result.ok ? 'ok' : 'error' });
  steps.push({
    title: result.ok ? `Your code runs ${call.name}: ${result.result}` : problem ? `The tool does not run; the error goes back to the model` : `${call.name} returns an error: ${result.error}`,
    why: 'The result (or the error) goes back as a tool message, so the model can see what happened.',
    codeLine: line('messages.push(assistant(out.toolCall), tool(result))'),
    view: grid(),
  });
  const final = reply(messages, { tools });
  const text = final.kind === 'text' ? final.text : '';
  messages.push({ speaker: 'assistant', content: text });
  steps.push({
    title: `The model writes the answer: "${text}"`,
    why: result.ok ? 'The model turns the tool\'s raw result into a reply for the user.' : 'The model explains the error instead of inventing a result.',
    next: 'How do you know a system like this answers correctly most of the time? The Evals lesson measures it.',
    codeLine: line('out = model(messages, tools)   // write the answer'),
    view: grid(),
  });
  return steps;
}
