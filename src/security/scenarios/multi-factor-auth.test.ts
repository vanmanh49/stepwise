import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { ATTACK_OPTIONS, multiFactorAuthSteps } from './multi-factor-auth';

const [OFF, ON] = DEFENSE_OPTIONS;
const [STOLEN, REUSED, RELAY] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => multiFactorAuthSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const rows = (step: Step) => (step.view as PanelsView).panels.find((p) => p.label === 'Rows')?.view as GridView | undefined;

describe('multi-factor auth', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it('needs only the password with no second factor', () => {
    const steps = run(STOLEN!, OFF!);
    expect(steps.every((s) => !s.title.toLowerCase().includes('code'))).toBe(true);
  });

  it('stops at the code step when TOTP is required', () => {
    expect(last(run(STOLEN!, ON!)).why).toContain('code');
  });

  it('replays a code from 10 s earlier', () => {
    const steps = run(REUSED!, OFF!);
    const seen = steps.find((s) => s.title.startsWith('alice types'))!;
    const replay = steps.find((s) => s.title.startsWith('10 s later'))!;
    expect(seen.variables!.code).toMatch(/^\d{6}$/);
    expect(replay.variables!.code).toBe(seen.variables!.code);
  });

  it('shows a real code and its 30 s window', () => {
    const step = run(REUSED!, OFF!).find((s) => s.title.startsWith('alice types'))!;
    const parts = rows(step)!.rows.map((r) => r.cells[0]!.value);
    expect(parts).toEqual(['time', 'counter', 'offset', 'code']);
    expect(step.why).toContain('30 s');
  });

  it('relays a live code through evil.example', () => {
    const steps = run(RELAY!, OFF!);
    expect(steps.some((s) => s.why.includes('evil.example'))).toBe(true);
    expect(last(steps).why).toContain('code');
  });

  it('gets no passkey signature on evil.example, and says so', () => {
    const steps = run(RELAY!, ON!);
    const refused = steps.find((s) => s.title.includes('passkey'))!;
    expect(refused.variables!.signature).toBe('none');
    expect(refused.why).toContain('evil.example');
  });

  it('shows the same passkey working on the real shop', () => {
    expect(run(RELAY!, ON!).find((s) => s.title.includes('real shop'))!.variables!.status).toBe(200);
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(STOLEN!, 'nope')).toHaveLength(1);
  });
});
