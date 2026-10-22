import { describe, expect, it } from 'vitest';
import { layoutServices, NARROW_WIDTH } from '../../components/visualization/renderers/servicesLayout';
import type { ServicesView } from '../../types/visualization';
import { simulate } from '../sim';
import { pubSubScenario, pubSubSteps } from './pub-sub';

const topic = { subscribers: '3', mode: 'topic', emailDown: 'off', orders: '3' };
const run = (v: Record<string, string>) => {
  const read = pubSubScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const times = (v: Record<string, string>) => run(v).requests.map((r) => r.ms);

describe('Publish/Subscribe & Events', () => {
  it('gives every subscriber its own copy', () => {
    const { deliveries } = run(topic);
    expect(deliveries).toHaveLength(9);
    expect(deliveries.every((d) => d.status === 'ok')).toBe(true);
    for (const order of ['#1', '#2', '#3']) expect(deliveries.filter((d) => d.request === order).map((d) => d.queue)).toEqual(['email', 'stock', 'analytics']);
  });

  it('keeps orders fast and the other subscribers going while email is down', () => {
    const down = { ...topic, emailDown: 'on' };
    const { deliveries, trace } = run(down);
    expect(times(down)).toEqual(times(topic));
    expect(deliveries.every((d) => d.status === 'ok')).toBe(true);
    const acked = (queue: string) => trace.flatMap((e) => (e.kind === 'delivered' && e.delivery.endsWith(`/${queue}`) ? [e.t] : []));
    expect(Math.max(...acked('stock'))).toBeLessThan(Math.max(...acked('email')));
  });

  it('does not change the publisher when subscribers change', () => {
    expect(times({ ...topic, subscribers: '1' })).toEqual(times(topic));
  });

  it('reaches only one subscriber per event in queue mode', () => {
    expect(run({ ...topic, mode: 'queue' }).deliveries).toHaveLength(3);
  });

  it('fits a phone in the rows layout', () => {
    const view = pubSubSteps(topic).at(-1)!.view as ServicesView;
    for (const box of layoutServices(view, 'rows', NARROW_WIDTH).boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(NARROW_WIDTH);
    }
  });

  it('refuses 0 subscribers', () => {
    expect(pubSubSteps({ ...topic, subscribers: '0' })[0]!.why).toBe('Subscribers must be a whole number from 1 to 3.');
  });
});
