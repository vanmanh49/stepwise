import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { messageQueuesScenario, messageQueuesSteps, queueDepths } from './message-queues';

const values = (style: string, workers: number, outage: string, jobs = 6) => ({ style, workers: String(workers), jobs: String(jobs), outage });
const run = (v: Record<string, string>) => {
  const read = messageQueuesScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const lastAck = (v: Record<string, string>) => Math.max(...run(v).trace.filter((e) => e.kind === 'delivered').map((e) => e.t));

describe('Message Queues', () => {
  it('fails every job when the worker is called directly and is down', () => {
    expect(run(values('sync', 1, 'on')).requests.every((r) => r.status === 'failed')).toBe(true);
  });

  it('stores every job at once and processes it after the outage', () => {
    const result = run(values('queue', 1, 'on'));
    expect(result.requests.map((r) => [r.status, r.ms])).toEqual(Array.from({ length: 6 }, () => ['ok', 12]));
    expect(result.deliveries.every((d) => d.status === 'ok')).toBe(true);
  });

  it('lets the queue grow with one worker', () => {
    expect(Math.max(...queueDepths(run(values('queue', 1, 'off')).trace).map((d) => d.waiting))).toBeGreaterThanOrEqual(3);
  });

  it('drains sooner with three workers', () => {
    expect(lastAck(values('queue', 3, 'off'))).toBeLessThan(lastAck(values('queue', 1, 'off')));
  });

  it('shows how many jobs are waiting', () => {
    const waiting = messageQueuesSteps(values('queue', 1, 'off')).map((s) => s.variables?.waiting);
    expect(Math.max(...waiting.map(Number))).toBeGreaterThanOrEqual(3);
  });

  it('refuses 4 workers', () => {
    expect(messageQueuesSteps(values('queue', 4, 'off'))[0]!.why).toBe('Workers must be a whole number from 1 to 3.');
  });
});

describe('Message Queues lesson copy', () => {
  it('quotes the measured times when comparing one worker with three', async () => {
    const { default: lesson } = await import('../../lessons/microservices/message-queues');
    const q4 = lesson.quiz.find((q) => q.id === 'q4')!;
    const text = `${q4.options[q4.answer]} ${q4.explanation}`;
    expect(text).toContain(`${lastAck(values('queue', 1, 'off'))} ms`);
    expect(text).toContain(`${lastAck(values('queue', 3, 'off'))} ms`);
    expect(text).not.toMatch(/three times/);
  });
});
