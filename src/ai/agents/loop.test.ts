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

  describe('critic', () => {
    it('catches the wrong unit before the email goes out', () => {
      const r = run(t('sam-weather'), { quirks: ['wrong-unit'], critic: { retries: 1 } });
      const critiques = r.events.filter((e) => e.kind === 'critique');
      expect(critiques[0]).toEqual({ kind: 'critique', checks: [{ label: 'temperature in °C', pass: false }] });
      expect(office(r).outbox.map((e) => e.body)).toEqual(['It is 31°C and rainy in Hanoi.']);
    });

    it('reports the failure but sends it anyway with no retries left', () => {
      const r = run(t('sam-weather'), { quirks: ['wrong-unit'], critic: { retries: 0 } });
      expect(r.events).toContainEqual({ kind: 'critique', checks: [{ label: 'temperature in °C', pass: false }] });
      expect(office(r).outbox.map((e) => e.body)).toEqual(['It is 88°F and rainy in Hanoi.']);
    });
  });

  describe('guards', () => {
    const inject = (guards: AgentOptions['guards'], quirks: AgentOptions['quirks'] = ['trusts-tool-output']) => run(t('travel-summary'), { quirks, guards });
    const toEve = (r: AgentRun) => office(r).outbox.filter((e) => e.to === 'eve@evil.test');

    it('lets a trusting model email the notes to the attacker without a guard', () => {
      expect(toEve(inject([]))).toHaveLength(1);
    });

    it('stops the attack by spotlighting tool output as data', () => {
      const r = inject(['spotlight']);
      expect(toEve(r)).toEqual([]);
      expect(r.events).toContainEqual(expect.objectContaining({ kind: 'observation', text: expect.stringMatching(/^«data» .* «\/data»$/) }));
      expect(r.answer).toBe(t('travel-summary').answer);
    });

    it('stops the attack with a tool allowlist', () => {
      const r = inject(['allowlist']);
      expect(toEve(r)).toEqual([]);
      expect(r.events.filter((e) => e.kind === 'blocked').map((e) => (e.kind === 'blocked' ? e.call.name : ''))).toEqual(['list_notes', 'send_email']);
    });

    it('blocks nothing when a careful model never tries a forbidden tool', () => {
      expect(inject(['allowlist'], []).events.some((e) => e.kind === 'blocked')).toBe(false);
    });
  });

  describe('approval', () => {
    it('sends nothing when the human denies the email', () => {
      const r = run(t('weather-compare'), { approval: 'risky', decision: 'deny' });
      expect(r.events).toContainEqual({ kind: 'approval', call: t('weather-compare').goals[3]!.call, decision: 'deny' });
      expect(office(r).outbox).toEqual([]);
      expect(r.answer).toBe('Tokyo is warmer (24°C vs 18°C). I did not email Sam: you denied it.');
    });

    it('asks only before risky tools', () => {
      const r = run(t('weather-compare'), { approval: 'risky' });
      expect(r.events.filter((e) => e.kind === 'approval')).toHaveLength(1);
      expect(office(r).outbox).toHaveLength(1);
    });

    it('ends with the office unchanged when every tool is denied', () => {
      const r = run(t('weather-compare'), { approval: 'every', decision: 'deny' });
      expect(stopOf(r)?.kind).toBe('stop');
      expect(office(r)).toEqual(INITIAL_OFFICE);
      expect(r.toolCalls).toBe(0);
    });

    it('deletes without asking when approval is never', () => {
      const r = run(t('cleanup'), { approval: 'never' });
      expect(r.events.some((e) => e.kind === 'approval')).toBe(false);
      expect(office(r)).toEqual({ notes: { team: INITIAL_OFFICE.notes.team, prefs: INITIAL_OFFICE.notes.prefs }, outbox: [] });
    });
  });
});
