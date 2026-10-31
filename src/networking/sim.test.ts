import { describe, expect, it } from 'vitest';
import type { Frame } from './packet';
import { MAX_EVENTS, simulate, type Ctx, type Device, type TableSnapshot } from './sim';

const FRAME: Frame = { srcMac: 'a', dstMac: 'b', payload: { kind: 'arp', op: 'request', senderMac: 'a', senderIp: 1, targetMac: '', targetIp: 2 } };
const NOTE = { action: 'send', title: 'sent', why: 'test' };

function stub(id: string, onReceive?: (ctx: Ctx, frame: Frame, port: string) => void): Device & { got: number[]; rows: string[][] } {
  const device = {
    id,
    label: id,
    type: 'host' as const,
    column: 0,
    got: [] as number[],
    rows: [] as string[][],
    receive(ctx: Ctx, frame: Frame, port: string) {
      device.got.push(ctx.now);
      onReceive?.(ctx, frame, port);
    },
    tables(): TableSnapshot[] {
      return [{ title: 'T', columns: ['C'], rows: device.rows.map((row) => [...row]) }];
    },
  };
  return device;
}

const sendOn = (port: string) => (_: Device, ctx: Ctx) => ctx.send([port], FRAME, NOTE);

describe('simulate', () => {
  it('delivers by arrival time, whatever the send order', () => {
    const order: string[] = [];
    const slow = stub('slow', () => order.push('slow'));
    const fast = stub('fast', () => order.push('fast'));
    const source = stub('source');
    simulate({
      devices: [source, slow, fast],
      links: [
        { a: ['source', 'p1'], b: ['slow', 'eth0'], ms: 5 },
        { a: ['source', 'p2'], b: ['fast', 'eth0'], ms: 1 },
      ],
      commands: [
        { at: 0, device: 'source', run: sendOn('p1') },
        { at: 1, device: 'source', run: sendOn('p2') },
      ],
    });
    expect(order).toEqual(['fast', 'slow']);
    expect(slow.got).toEqual([5]);
  });

  it('runs a fault before a command at the same time', () => {
    const b = stub('b');
    const run = simulate({
      devices: [stub('a'), b],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [{ at: 5, device: 'a', run: sendOn('eth0') }],
      faults: [{ at: 5, kind: 'linkDown', link: 0 }],
    });
    expect(b.got).toEqual([]);
    expect(run.events.at(-1)?.hops).toEqual([]);
  });

  it('reports link state to devices', () => {
    const seen: boolean[] = [];
    simulate({
      devices: [stub('a'), stub('b')],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [
        { at: 0, device: 'a', run: (_, ctx) => seen.push(ctx.linkUp('eth0')) },
        { at: 2, device: 'a', run: (_, ctx) => seen.push(ctx.linkUp('eth0')) },
      ],
      faults: [{ at: 1, kind: 'linkDown', link: 0 }],
    });
    expect(seen).toEqual([true, false]);
  });

  it('drops only the nth matching packet and marks its hop lost', () => {
    const b = stub('b');
    const run = simulate({
      devices: [stub('a'), b],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [0, 1, 2].map((at) => ({ at, device: 'a', run: sendOn('eth0') })),
      faults: [{ kind: 'dropPacket', matches: () => true, nth: 2 }],
    });
    expect(b.got).toEqual([1, 3]);
    expect(run.events.map((event) => event.hops[0]?.lost ?? false)).toEqual([false, true, false]);
  });

  it('delivers nothing to a stopped device', () => {
    const b = stub('b');
    simulate({
      devices: [stub('a'), b],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [{ at: 1, device: 'a', run: sendOn('eth0') }],
      faults: [{ at: 0, kind: 'stopDevice', device: 'b' }],
    });
    expect(b.got).toEqual([]);
  });

  it('moves a link to another port', () => {
    const c = stub('c');
    simulate({
      devices: [stub('a'), stub('b'), c],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [{ at: 1, device: 'a', run: sendOn('eth0') }],
      faults: [{ at: 0, kind: 'moveLink', link: 0, to: ['c', 'eth0'] }],
    });
    expect(c.got).toEqual([2]);
  });

  it('discards events after endAt', () => {
    const fired: number[] = [];
    simulate({
      devices: [stub('a')],
      links: [],
      commands: [
        { at: 1, device: 'a', run: (_, ctx) => ctx.after(3, () => fired.push(ctx.now)) },
        { at: 5, device: 'a', run: () => fired.push(5) },
      ],
      endAt: 4,
    });
    expect(fired).toEqual([4]);
  });

  it('cuts a run that never ends', () => {
    const echo = (ctx: Ctx, frame: Frame, port: string) => ctx.send([port], frame, NOTE);
    const run = simulate({
      devices: [stub('a', echo), stub('b', echo)],
      links: [{ a: ['a', 'eth0'], b: ['b', 'eth0'] }],
      commands: [{ at: 0, device: 'a', run: sendOn('eth0') }],
    });
    expect(run.cut).toBe(true);
    expect(run.events).toHaveLength(MAX_EVENTS);
  });

  it('keeps each event\'s tables as they were at that moment', () => {
    const a = stub('a');
    a.rows.push(['first']);
    const run = simulate({
      devices: [a],
      links: [],
      commands: [{ at: 0, device: 'a', run: (_, ctx) => { ctx.note(NOTE); a.rows.push(['second']); ctx.note(NOTE); } }],
    });
    expect(run.events[0]!.tables.a![0]!.rows).toEqual([['first']]);
    expect(run.events[1]!.tables.a![0]!.rows).toEqual([['first'], ['second']]);
  });

  it('floods as one event with one hop per port', () => {
    const run = simulate({
      devices: [stub('sw'), stub('a'), stub('b')],
      links: [
        { a: ['sw', 'p1'], b: ['a', 'eth0'] },
        { a: ['sw', 'p2'], b: ['b', 'eth0'] },
      ],
      commands: [{ at: 0, device: 'sw', run: (_, ctx) => ctx.send(['p1', 'p2'], FRAME, NOTE) }],
    });
    expect(run.events).toHaveLength(1);
    expect(run.events[0]!.hops).toEqual([{ from: 'sw', to: 'a' }, { from: 'sw', to: 'b' }]);
  });
});
