import { describe, expect, it } from 'vitest';
import { twoHosts } from '../scenarios/topology';
import { simulate, type Command, type Fault } from '../sim';
import { wsClient, wsServer, type WebSocketEnd } from './websocket';

const PORT = 80;

function open(extra: (ends: { client?: WebSocketEnd; server?: WebSocketEnd }) => Command[] = () => [], faults: Fault[] = [], endAt = 20000) {
  const net = twoHosts();
  const ends: { client?: WebSocketEnd; server?: WebSocketEnd } = {};
  wsServer(net.server, PORT, (_, socket) => { ends.server = socket; });
  const commands: Command[] = [{ at: 0, device: 'client', run: (_, ctx) => wsClient(ctx, net.client, net.server.address(), PORT, (__, socket) => { ends.client = socket; }) }, ...extra(ends)];
  const run = simulate({ devices: net.devices, links: net.links, commands, faults, endAt, maxEvents: 20000 });
  return { ...net, run, ends, actions: run.events.map(({ action }) => action) };
}

describe('WebSockets', () => {
  it('upgrades with a real request and a 101', () => {
    const { run, actions } = open();
    expect(actions.indexOf('ws-upgrade')).toBeLessThan(actions.indexOf('ws-switching'));
    const marks = run.events.flatMap(({ frame }) => (frame?.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' ? frame.payload.payload.marks ?? [] : [])).map(({ mark }) => mark as { headers?: Record<string, string> });
    const headers = Object.assign({}, ...marks.map(({ headers: each }) => each ?? {}));
    expect(headers).toMatchObject({ Upgrade: 'websocket', Connection: 'Upgrade' });
    expect(headers['Sec-WebSocket-Accept']).toBeTruthy();
    expect(headers['Sec-WebSocket-Key']).toBeTruthy();
  });

  it('sends frames both ways on one connection', () => {
    const { ends, client, server } = open((sides) => [
      { at: 200, device: 'client', run: (_, ctx) => sides.client!.send(ctx, 'hello', 50) },
      { at: 250, device: 'server', run: (_, ctx) => sides.server!.send(ctx, 'hi', 50) },
    ], [], 400);
    expect(ends.server!.received).toEqual(['hello']);
    expect(ends.client!.received).toEqual(['hi']);
    expect(client.connections()).toHaveLength(1);
    expect(server.connections()).toHaveLength(1);
  });

  it('answers each ping with a pong', () => {
    const { run } = open(() => [], [], 2500);
    const count = (action: string) => run.events.filter((event) => event.action === action).length;
    expect(count('ws-ping')).toBe(2);
    expect(count('ws-pong')).toBe(2);
  });

  it('gives up on a stopped peer after 2 missed pongs at 1000 ms each', () => {
    const { run } = open(() => [], [{ at: 500, kind: 'stopDevice', device: 'server' }], 10000);
    const dead = run.events.find(({ action }) => action === 'ws-dead')!;
    expect(dead.device).toBe('client');
    expect(run.events.filter(({ action, device }) => action === 'ws-ping' && device === 'client').length).toBeGreaterThanOrEqual(2);
    const firstPing = run.events.find(({ action }) => action === 'ws-ping')!;
    expect(dead.time - firstPing.time).toBe(2000);
  });

  it('closes cleanly with close frames in both directions', () => {
    const { run, actions, client, server } = open((sides) => [{ at: 200, device: 'client', run: (_, ctx) => sides.client!.close(ctx) }]);
    expect(actions.filter((action) => action === 'ws-close')).toHaveLength(2);
    expect(actions).not.toContain('abort');
    expect(client.connections()[0]!.state).toBe('CLOSED');
    expect(server.connections()[0]!.state).toBe('CLOSED');
    expect(run.cut).toBe(false);
  });
});
