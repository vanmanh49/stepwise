import { describe, expect, it } from 'vitest';
import { runAgent } from './loop';
import { PROTOCOL_VERSION, request, rpc } from './mcp';
import { INITIAL_OFFICE } from './office';
import { taskById } from './tasks';

const call = (method: string, params?: Record<string, unknown>, server: 'office' | 'weather' = 'office') => rpc(server, INITIAL_OFFICE, request(1, method, params)).response;

describe('MCP-style tool server', () => {
  it('puts the protocol version in every request', () => {
    expect(request(7, 'tools/list')).toEqual({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION } } });
  });

  it('describes itself and lists its tools with input schemas', () => {
    expect(call('server/discover')).toEqual({ jsonrpc: '2.0', id: 1, result: { supportedVersions: ['2026-07-28'], serverInfo: { name: 'office', version: '1.0.0' } } });
    const list = call('tools/list', {}, 'weather');
    expect('result' in list && list.result.tools).toEqual([
      { name: 'get_weather', description: 'The current weather in a city', inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
    ]);
  });

  it('runs a tool', () => {
    expect(call('tools/call', { name: 'get_weather', arguments: { city: 'Paris' } })).toEqual({
      jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '18°C and cloudy' }], isError: false },
    });
  });

  it('reports a tool failure as a result the model can read', () => {
    expect(call('tools/call', { name: 'get_weather', arguments: { city: 'Mars' } })).toEqual({
      jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'No weather for Mars' }], isError: true },
    });
  });

  it('uses JSON-RPC errors for protocol problems', () => {
    const code = (r: object) => (r as { error: { code: number; message: string } }).error;
    expect(code(call('tools/run'))).toEqual({ code: -32601, message: 'Method not found: tools/run' });
    expect(code(call('tools/call', { name: 'fly', arguments: {} }))).toEqual({ code: -32602, message: 'Unknown tool: fly' });
    expect(code(call('tools/call', { name: 'add', arguments: { a: 17, b: 'twenty' } }))).toEqual({ code: -32602, message: 'Invalid arguments for tool add: b must be a number' });
    expect(code(call('tools/call', { name: 'send_email', arguments: { to: 'sam@office.test', body: 'hi' } }, 'weather'))).toEqual({ code: -32602, message: 'Unknown tool: send_email' });
    const bare = rpc('office', INITIAL_OFFICE, { jsonrpc: '2.0', id: 2, method: 'tools/list' }).response;
    expect(code(bare)).toEqual({ code: -32602, message: 'Missing protocol version' });
  });

  it('lets an agent finish over the office server with the same result as direct calls', () => {
    const task = taskById('weather-compare')!;
    const mcp = runAgent(task, INITIAL_OFFICE, { maxSteps: 12, transport: 'mcp', server: 'office' });
    const direct = runAgent(task, INITIAL_OFFICE, { maxSteps: 12 });
    expect(mcp.offices.at(-1)).toEqual(direct.offices.at(-1));
    expect(mcp.answer).toBe(direct.answer);
    expect(mcp.events[0]).toMatchObject({ kind: 'rpc', request: { method: 'tools/list' } });
  });

  it('finishes without tools the weather server never listed, and says so', () => {
    const r = runAgent(taskById('weather-compare')!, INITIAL_OFFICE, { maxSteps: 12, transport: 'mcp', server: 'weather' });
    const called = r.events.flatMap((e) => (e.kind === 'rpc' && 'params' in e.request ? [(e.request.params as { name?: string }).name] : []));
    expect(called.filter(Boolean)).toEqual(['get_weather', 'get_weather']);
    expect(r.answer).toContain('no send_email tool');
    expect(r.offices.at(-1)!.outbox).toEqual([]);
  });
});
