import { describe, expect, it } from 'vitest';
import { INITIAL_OFFICE, OFFICE_TOOLS, runOfficeTool } from './office';
import { decide, type Context, type Move, type Quirk } from './policy';
import { taskById, TASKS, type Task } from './tasks';

const ALL = new Set(OFFICE_TOOLS.map((t) => t.name));
const ctx = (task: Task, over: Partial<Context> = {}): Context => ({
  task, outcomes: {}, seen: [], notes: [], feedback: [], available: ALL, office: INITIAL_OFFICE, injected: [], planChecks: [], ...over,
});
const t = (id: string) => taskById(id)!;
const callOf = (m: Move) => ('call' in m ? m.call : undefined);
const answerOf = (m: Move) => ('answer' in m ? m.answer : undefined);

/** Plays the policy against the real office until it answers. */
function play(task: Task, quirks: Quirk[] = [], over: Partial<Context> = {}) {
  let c = ctx(task, over);
  const calls: string[] = [];
  for (let i = 0; i < 20; i++) {
    const m = decide(c, quirks);
    if ('answer' in m) return { calls, answer: m.answer, office: c.office };
    const out = runOfficeTool(c.office, m.call);
    calls.push(`${m.call.name}${m.call.name === 'send_email' ? `:${String(m.call.args.to)}` : ''}`);
    c = {
      ...c,
      office: out.office,
      seen: [...c.seen, out.result.ok ? out.result.text : out.result.error],
      outcomes: m.goal === 'injected' ? c.outcomes : { ...c.outcomes, [m.goal]: { kind: 'done' } },
      injected: m.goal === 'injected' ? [...c.injected, m.call.name] : c.injected,
    };
  }
  throw new Error('policy never answered');
}

describe('stand-in policy', () => {
  it.each(TASKS.map((x) => [x.id, x] as const))('%s: follows its goals and gives its answer', (_id, task) => {
    const run = play(task);
    expect(run.calls.map((c) => c.split(':')[0])).toEqual(task.goals.map((g) => g.call.name));
    expect(run.answer).toBe(task.answer);
  });

  it('guesses before checking anything with answers-early', () => {
    expect(answerOf(decide(ctx(t('weather-compare')), ['answers-early']))).toBe('Yes, Paris is warmer.');
  });

  it('drops the last step with skips-step, unless a plan check names it', () => {
    const run = play(t('weather-compare'), ['skips-step']);
    expect(run.calls).toHaveLength(3);
    expect(run.answer).toBe('Tokyo is warmer (24°C vs 18°C).');
    const checked = play(t('weather-compare'), ['skips-step'], { planChecks: [3] });
    expect(checked.calls.at(-1)).toBe('send_email:sam@office.test');
  });

  it('writes °F with wrong-unit unless °C is in its context', () => {
    expect(play(t('sam-weather'), ['wrong-unit']).office.outbox[0]!.body).toBe('It is 88°F and rainy in Hanoi.');
    expect(play(t('sam-weather'), ['wrong-unit'], { notes: ['Sam likes temperatures in °C.'] }).office.outbox[0]!.body).toBe('It is 31°C and rainy in Hanoi.');
  });

  it('follows instructions hidden in tool output with trusts-tool-output', () => {
    const run = play(t('travel-summary'), ['trusts-tool-output']);
    expect(run.calls).toEqual(['read_note', 'list_notes', 'send_email:eve@evil.test']);
    expect(run.office.outbox[0]!.body).toContain('Sam: sam@office.test');
  });

  it('treats spotlighted tool output as data', () => {
    const seen = [`«data» ${INITIAL_OFFICE.notes['travel-tips']} «/data»`];
    const m = decide(ctx(t('travel-summary'), { seen, outcomes: { 0: { kind: 'done' } } }), ['trusts-tool-output']);
    expect(answerOf(m)).toBe('The tip: pack light and carry a paper map.');
  });

  it('skips denied, blocked, failed and unavailable goals and says why', () => {
    const wc = t('weather-compare');
    const done = { 0: { kind: 'done' as const }, 1: { kind: 'done' as const }, 2: { kind: 'done' as const } };
    expect(answerOf(decide(ctx(wc, { outcomes: { ...done, 3: { kind: 'denied' } } }), []))).toBe('Tokyo is warmer (24°C vs 18°C). I did not email Sam: you denied it.');
    expect(answerOf(decide(ctx(wc, { outcomes: { ...done, 3: { kind: 'blocked' } } }), []))).toBe('Tokyo is warmer (24°C vs 18°C). I could not email Sam: it is not allowed.');
    expect(answerOf(decide(ctx(wc, { outcomes: { ...done, 3: { kind: 'error', error: 'Not an email address: sam' } } }), []))).toBe('Tokyo is warmer (24°C vs 18°C). I could not email Sam: Not an email address: sam.');
    const weatherOnly = new Set(['get_weather']);
    const m = decide(ctx(wc, { available: weatherOnly, outcomes: { 0: { kind: 'done' }, 1: { kind: 'done' } } }), []);
    expect(answerOf(m)).toBe("Tokyo is warmer (24°C vs 18°C). I could not look up Sam's address: no read_note tool. I could not email Sam: no send_email tool.");
  });

  it('calls the next goal, never a done one', () => {
    expect(callOf(decide(ctx(t('weather-compare'), { outcomes: { 0: { kind: 'done' } } }), []))).toEqual({ name: 'get_weather', args: { city: 'Tokyo' } });
  });
});
