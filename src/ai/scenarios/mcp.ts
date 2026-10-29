import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { runAgent } from '../agents/loop';
import { request, rpc, type RpcRequest, type RpcResponse, type ServerName } from '../agents/mcp';
import { INITIAL_OFFICE } from '../agents/office';
import { taskById } from '../agents/tasks';
import { eventSteps, STAND_IN } from '../agents/view';
import { EMPTY, messageGrid } from '../steps';

export const mcpCode = `// no handshake: every request carries its protocol version in _meta
send({ method: 'server/discover' })   // optional probe: versions and server info
tools = send({ method: 'tools/list' }).tools   // names, descriptions, input schemas
result = send({ method: 'tools/call', params: { name, arguments } })
if (result.error) report(result.error.code)   // -32601 no such method, -32602 bad params
else if (result.isError) model.read(result.content)   // the tool failed; the model can retry
agent.run(task, tools)   // the agent loop, calling tools over MCP`;

export const SERVER_NAMES: ServerName[] = ['office', 'weather'];
export const CALLS = ['list', 'call', 'unknown-method', 'unknown-tool', 'bad-args', 'tool-error'];

const CALL_REQUESTS: Record<string, [method: string, params?: Record<string, unknown>]> = {
  call: ['tools/call', { name: 'get_weather', arguments: { city: 'Paris' } }],
  'unknown-method': ['tools/run', { name: 'get_weather', arguments: { city: 'Paris' } }],
  'unknown-tool': ['tools/call', { name: 'fly', arguments: {} }],
  'bad-args': ['tools/call', { name: 'add', arguments: { a: 17, b: 'twenty' } }],
  'tool-error': ['tools/call', { name: 'get_weather', arguments: { city: 'Mars' } }],
};

const line = (snippet: string) => lineOf(mcpCode, snippet);

/** "tools/call get_weather: 18°C and cloudy", "tools/run: error -32601 (…)". */
function summary(req: RpcRequest, res: RpcResponse): string {
  const name = req.method === 'tools/call' ? ` ${String(req.params?.name)}` : '';
  if ('error' in res) return `${req.method}${name}: error ${res.error.code} (${res.error.message})`;
  if (req.method === 'server/discover') return `server/discover: the server speaks ${(res.result.supportedVersions as string[]).join(', ')}`;
  if (req.method === 'tools/list') {
    const n = (res.result.tools as unknown[]).length;
    return `tools/list: ${n} tool${n === 1 ? '' : 's'}, each with an input schema`;
  }
  const text = (res.result.content as { text: string }[])[0]?.text ?? '';
  return `${req.method}${name}: ${res.result.isError ? `isError (${text})` : text}`;
}

function explain(req: RpcRequest, res: RpcResponse): string {
  if (req.method === 'server/discover') return `In this revision a client can probe the server first. There is no initialize handshake: every request names its protocol version in _meta. Older revisions opened every session with an initialize request. ${STAND_IN}`;
  if (req.method === 'tools/list') return 'The client learns each tool\'s name, description and input schema at run time, so any MCP client can use any MCP server without custom code.';
  if ('error' in res) {
    return res.error.code === -32601
      ? '-32601 means the method does not exist: a protocol error from JSON-RPC itself.'
      : '-32602 means the parameters are wrong: an unknown tool, or arguments that fail the tool\'s input schema. The server rejects the request before running anything.';
  }
  return res.result.isError
    ? 'The tool ran and failed. MCP returns that as a normal result marked isError, so the model can read it and try again, unlike a protocol error.'
    : 'The server ran the tool and returned its output as content.';
}

export function mcpSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't send this request", why, EMPTY);
  const server = readChoice(values, 'server', 'Server', SERVER_NAMES);
  if (!server.ok) return fail(server.why);
  const call = readChoice(values, 'call', 'Call', CALLS);
  if (!call.ok) return fail(call.why);

  const name = server.value as ServerName;
  const messages: { speaker: string; content: string }[] = [];
  const exchange = (id: number, method: string, params: Record<string, unknown> | undefined, codeLine: number): Step => {
    const req = request(id, method, params);
    const { response } = rpc(name, INITIAL_OFFICE, req);
    messages.push({ speaker: '→ request', content: JSON.stringify(req) }, { speaker: '← response', content: JSON.stringify(response) });
    return {
      title: summary(req, response),
      why: explain(req, response),
      codeLine,
      view: messageGrid([...messages], 'rpc', (i) => (i >= messages.length - 2 ? 'active' : 'default')),
    };
  };
  const steps: Step[] = [
    {
      title: `A client connects to the ${name} tool server`,
      why: 'MCP (the Model Context Protocol) is a standard way for an app to find and call tools on a server, using JSON-RPC 2.0 messages. This lesson follows the 2026-07-28 revision; a function call stands in for the stdio or HTTP connection.',
      codeLine: line('// no handshake'),
      view: messageGrid([], 'rpc'),
    },
    exchange(1, 'server/discover', undefined, line("send({ method: 'server/discover' })")),
    exchange(2, 'tools/list', undefined, line("tools = send({ method: 'tools/list' })")),
  ];
  const chosen = CALL_REQUESTS[call.value];
  if (chosen) {
    const [method, params] = chosen;
    const codeLine = method !== 'tools/call' || call.value === 'unknown-tool' || call.value === 'bad-args' ? line('if (result.error)') : call.value === 'tool-error' ? line('else if (result.isError)') : line("result = send({ method: 'tools/call'");
    steps.push(exchange(3, method, params, codeLine));
  }
  const run = runAgent(taskById('weather-compare')!, INITIAL_OFFICE, { maxSteps: 12, transport: 'mcp', server: name });
  const intro: Step = { title: '', why: '', codeLine: 1, view: EMPTY };
  const agent = eventSteps(run, () => line('agent.run(task, tools)'), intro).slice(1).map((s) => ({ ...s, title: `Agent: ${s.title}` }));
  return [...steps, ...agent];
}
