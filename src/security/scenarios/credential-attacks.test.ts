import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { ATTACK_OPTIONS, credentialAttacksSteps, DEFENSES } from './credential-attacks';

const [GUESSING, STUFFING, SPRAYING] = ATTACK_OPTIONS;
const [NONE, PER_IP, LOCKOUT] = DEFENSES;

const run = (attack: string, defense: string) => credentialAttacksSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;

describe('credential attacks', () => {
  it.each([
    [GUESSING, NONE, 'attacker in'],
    [GUESSING, PER_IP, 'stopped'],
    [GUESSING, LOCKOUT, 'stopped'],
    [STUFFING, NONE, 'attacker in'],
    [STUFFING, PER_IP, 'attacker in'],
    [STUFFING, LOCKOUT, 'attacker in'],
    [SPRAYING, NONE, 'attacker in'],
    [SPRAYING, PER_IP, 'attacker in'],
    [SPRAYING, LOCKOUT, 'attacker in'],
  ])('%s against %s: %s', (attack, defense, result) => {
    expect(last(run(attack!, defense!)).variables!.result).toBe(result);
  });

  it('locks the real user out too', () => {
    const steps = run(GUESSING!, LOCKOUT!);
    const real = steps.find((s) => s.title.includes('The real alice'))!;
    expect(real.title).toContain('423');
    expect(last(steps).why).toContain('locked alice out');
  });

  it('warns that a per-IP limit only slows guessing', () => {
    expect(last(run(GUESSING!, PER_IP!)).why).toContain('60 s');
  });

  it.each([STUFFING!, SPRAYING!])('names what helps against %s', (attack) => {
    for (const defense of DEFENSES) {
      expect(last(run(attack, defense)).why).toContain('MFA');
      expect(last(run(attack, defense)).why).toContain('breached-password');
    }
  });

  it('stays under 30 steps', () => {
    for (const attack of ATTACK_OPTIONS) for (const defense of DEFENSES) expect(run(attack, defense).length).toBeLessThan(30);
  });

  it('moves the simulated clock between attempts', () => {
    const times = run(GUESSING!, NONE!).flatMap((s) => (s.variables?.seconds === undefined ? [] : [s.variables.seconds as number]));
    expect(times.length).toBeGreaterThan(2);
    expect(times[1]!).toBeGreaterThan(times[0]!);
  });

  it('opens the account after a success', () => {
    expect(run(GUESSING!, NONE!).some((s) => s.title.includes('opens'))).toBe(true);
    expect(run(GUESSING!, PER_IP!).some((s) => s.title.includes('opens'))).toBe(false);
  });

  it('refuses unknown choices', () => {
    expect(run('nope', NONE!)).toHaveLength(1);
    expect(run(GUESSING!, 'nope')).toHaveLength(1);
  });
});
