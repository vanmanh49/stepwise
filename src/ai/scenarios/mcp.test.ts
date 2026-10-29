import { describe, expect, it } from 'vitest';
import { mcpSteps } from './mcp';

const titles = (call: string, server = 'office') => mcpSteps({ server, call }).map((s) => s.title);

describe('MCP lesson', () => {
  it('discovers the server and lists its tools without a handshake', () => {
    const t = titles('list');
    expect(t[1]).toBe('server/discover: the server speaks 2026-07-28');
    expect(t[2]).toBe('tools/list: 8 tools, each with an input schema');
  });

  it.each([
    ['call', 'tools/call get_weather: 18°C and cloudy'],
    ['unknown-method', 'tools/run: error -32601 (Method not found: tools/run)'],
    ['unknown-tool', 'tools/call fly: error -32602 (Unknown tool: fly)'],
    ['bad-args', 'tools/call add: error -32602 (Invalid arguments for tool add: b must be a number)'],
    ['tool-error', 'tools/call get_weather: isError (No weather for Mars)'],
  ])('shows the result of %s', (call, title) => {
    expect(titles(call)).toContain(title);
  });

  it('runs the agent over the weather server, which has no email tool', () => {
    const t = titles('list', 'weather');
    expect(t[2]).toBe('tools/list: 1 tool, each with an input schema');
    expect(t.some((x) => x.startsWith('Agent: Answer') && x.includes('no send_email tool'))).toBe(true);
  });

  it('refuses an unknown call with one step', () => {
    expect(mcpSteps({ server: 'office', call: 'hack' })).toHaveLength(1);
  });
});
