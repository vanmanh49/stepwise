import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../data-structures/random.testutil';
import { runAgent, SESSION_1, type AgentOptions, type AgentRun } from './loop';
import { INITIAL_OFFICE } from './office';
import { taskById, TASKS, type Task } from './tasks';

const t = (id: string) => taskById(id)!;
const run = (task: Task, options: Partial<AgentOptions> = {}) => runAgent(task, INITIAL_OFFICE, { maxSteps: 12, ...options });
const office = (r: AgentRun) => r.offices.at(-1)!;
const kinds = (r: AgentRun) => r.events.map((e) => e.kind);
const stopOf = (r: AgentRun) => r.events.at(-1);

describe('agent loop', () => {
  it.each(TASKS.map((x) => [x.id, x] as const))('%s: answers correctly and meets every requirement', (_id, task) => {
    const r = run(task);
    expect(stopOf(r)).toEqual({ kind: 'stop', reason: 'answered' });
    expect(r.answer).toBe(task.answer);
    const lastEmail = office(r).outbox.at(-1)?.body ?? '';
    for (const req of task.requirements) expect(req.check(office(r), req.stage === 'email' ? lastEmail : r.answer!), req.label).toBe(true);
    expect(r.toolCalls).toBe(task.goals.length);
    expect(r.modelCalls).toBe(task.goals.length + 1);
    expect(r.offices).toHaveLength(r.events.length);
  });

  it('stops at the step limit without an answer', () => {
    const r = run(t('weather-compare'), { maxSteps: 1 });
    expect(stopOf(r)).toEqual({ kind: 'stop', reason: 'max-steps' });
    expect(r.answer).toBeUndefined();
    expect(kinds(r).filter((k) => k === 'action')).toHaveLength(1);
  });

  it('turns a failing tool call into an error observation', () => {
    const bad: Task = { ...t('sum-and-save'), goals: [{ label: 'add 17 and twenty', call: { name: 'add', args: { a: 17, b: 'twenty' } } }] };
    const r = run(bad);
    expect(r.events).toContainEqual({ kind: 'observation', text: 'b must be a number', ok: false });
    expect(r.answer).toBe('I could not add 17 and twenty: b must be a number.');
  });

  it('repeats exactly and never mutates the office', () => {
    const frozen = deepFreeze(structuredClone(INITIAL_OFFICE));
    const a = runAgent(t('weather-compare'), frozen, { maxSteps: 12 });
    expect(runAgent(t('weather-compare'), frozen, { maxSteps: 12 })).toEqual(a);
    expect(frozen.outbox).toEqual([]);
  });

  it('answers wrongly without a single tool call with answers-early', () => {
    const r = run(t('weather-compare'), { quirks: ['answers-early'] });
    expect(r.toolCalls).toBe(0);
    expect(r.answer).toBe('Yes, Paris is warmer.');
  });

  describe('memory', () => {
    const body = (memory: AgentOptions['memory']) => office(run(t('sam-weather'), { quirks: ['wrong-unit'], memory, history: [...SESSION_1] })).outbox[0]!.body;

    it('forgets the °C preference with no memory or chat memory', () => {
      expect(body('none')).toBe('It is 88°F and rainy in Hanoi.');
      expect(body('chat')).toBe('It is 88°F and rainy in Hanoi.');
    });

    it('drops the oldest chat lines to fit the budget', () => {
      const r = run(t('sam-weather'), { memory: 'chat', history: [...SESSION_1] });
      const recall = r.events.find((e) => e.kind === 'recall');
      expect(recall).toEqual({ kind: 'recall', source: 'chat', items: SESSION_1.slice(1) });
    });

    it('recalls the prefs note with notes memory', () => {
      const r = run(t('sam-weather'), { quirks: ['wrong-unit'], memory: 'notes' });
      expect(r.events[0]).toEqual({ kind: 'recall', source: 'notes', items: ['team', 'prefs'] });
      expect(office(r).outbox[0]!.body).toBe('It is 31°C and rainy in Hanoi.');
    });
  });

  describe('planner', () => {
    it('lets skips-step drop the email without a plan', () => {
      const r = run(t('weather-compare'), { quirks: ['skips-step'] });
      expect(office(r).outbox).toEqual([]);
      expect(r.answer).toBe('Tokyo is warmer (24°C vs 18°C).');
    });

    it('catches the skipped step with a plan', () => {
      const r = run(t('weather-compare'), { quirks: ['skips-step'], planner: true });
      expect(r.events[0]).toEqual({ kind: 'plan', steps: t('weather-compare').goals.map((g) => g.label) });
      expect(r.events).toContainEqual({ kind: 'plan-check', step: 3 });
      expect(office(r).outbox.map((e) => e.to)).toEqual(['sam@office.test']);
      expect(r.answer).toBe(t('weather-compare').answer);
    });
  });
});
