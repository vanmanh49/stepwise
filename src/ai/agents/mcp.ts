import { checkArgs, type Tool } from '../standin';
import { OFFICE_TOOLS, runOfficeTool, type Office } from './office';

/**
 * A toy MCP-style tool server, following the 2026-07-28 revision: stateless, so there is no
 * initialize handshake, and every request names its protocol version in _meta. Real servers
 * speak this over stdio or HTTP; here a function call stands in for the transport.
 */
export const PROTOCOL_VERSION = '2026-07-28';
const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';

export type ServerName = 'office' | 'weather';

const SERVERS: Record<ServerName, readonly Tool[]> = {
  office: OFFICE_TOOLS,
  weather: OFFICE_TOOLS.filter((t) => t.name === 'get_weather'),
};

export interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export type RpcResponse =
  | { jsonrpc: '2.0'; id: number; result: Record<string, unknown> }
  | { jsonrpc: '2.0'; id: number; error: { code: number; message: string } };

/** A request with the protocol version in its _meta, as every client request needs. */
export function request(id: number, method: string, params: Record<string, unknown> = {}): RpcRequest {
  return { jsonrpc: '2.0', id, method, params: { ...params, _meta: { [VERSION_KEY]: PROTOCOL_VERSION } } };
}

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const inputSchema = (tool: Tool) => ({
  type: 'object',
  properties: Object.fromEntries(tool.params.map((p) => [p.name, { type: p.type }])),
  required: tool.params.map((p) => p.name),
});

export function rpc(server: ServerName, office: Office, req: RpcRequest): { office: Office; response: RpcResponse } {
  const reply = (result: Record<string, unknown>) => ({ office, response: { jsonrpc: '2.0' as const, id: req.id, result } });
  const error = (code: number, message: string) => ({ office, response: { jsonrpc: '2.0' as const, id: req.id, error: { code, message } } });
  // oxlint-disable-next-line no-underscore-dangle -- _meta is the MCP field name
  const meta = req.params?._meta as Record<string, unknown> | undefined;
  if (meta?.[VERSION_KEY] === undefined) return error(INVALID_PARAMS, 'Missing protocol version');
  const tools = SERVERS[server];
  if (req.method === 'server/discover') return reply({ supportedVersions: [PROTOCOL_VERSION], serverInfo: { name: server, version: '1.0.0' } });
  if (req.method === 'tools/list') return reply({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: inputSchema(t) })) });
  if (req.method !== 'tools/call') return error(METHOD_NOT_FOUND, `Method not found: ${req.method}`);
  const name = String(req.params?.name);
  const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
  const tool = tools.find((t) => t.name === name);
  if (!tool) return error(INVALID_PARAMS, `Unknown tool: ${name}`);
  const problem = checkArgs(tool, args);
  if (problem) return error(INVALID_PARAMS, `Invalid arguments for tool ${name}: ${problem}`);
  // Failures inside the tool come back as a result, so the model can read them and correct itself.
  const out = runOfficeTool(office, { name, args });
  const text = out.result.ok ? out.result.text : out.result.error;
  return { office: out.office, response: { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text }], isError: !out.result.ok } } };
}
