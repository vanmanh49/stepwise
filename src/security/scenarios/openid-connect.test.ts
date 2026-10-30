import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { ATTACK_OPTIONS, openidConnectSteps } from './openid-connect';

const [OFF, ON] = DEFENSE_OPTIONS;
const [OTHER_APP, REPLAYED, EXPIRED, ACCESS] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => openidConnectSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const claims = (step: Step) => {
  const grid = (step.view as PanelsView).panels.find((p) => p.label === 'Rows')!.view as GridView;
  return Object.fromEntries(grid.rows.map((r) => [r.cells[0]!.value, { value: r.cells[1]!.value, check: r.cells[2]!.value }]));
};

describe('openid connect', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it.each([
    [OTHER_APP!, 'aud'],
    [REPLAYED!, 'nonce'],
    [EXPIRED!, 'exp'],
  ])('%s names %s when it fails', (attack, claim) => {
    expect(last(run(attack, ON!)).why).toContain(`${claim} `);
    expect(claims(last(run(attack, ON!)))[claim]!.check).toBe('failed');
    expect(claims(last(run(attack, OFF!)))[claim]!.check).toBe('not checked');
  });

  it('shows aud as evil-app', () => {
    expect(claims(last(run(OTHER_APP!, OFF!))).aud!.value).toBe('evil-app');
  });

  it('moves past exp', () => {
    expect(run(EXPIRED!, OFF!).some((s) => s.title.includes('hour'))).toBe(true);
  });

  it('calls /userinfo only with the check off', () => {
    const wire = (steps: Step[]) => steps.flatMap((s) => ((s.view as PanelsView).panels[0]!.view as { log: string[] }).log);
    expect(wire(run(ACCESS!, OFF!)).some((line) => line.includes('/userinfo'))).toBe(true);
    expect(wire(run(ACCESS!, ON!)).some((line) => line.includes('/userinfo'))).toBe(false);
  });

  it.each([OTHER_APP!, REPLAYED!, EXPIRED!])('always shows iss and the signature as passed for %s', (attack) => {
    for (const defense of DEFENSE_OPTIONS) {
      const shown = claims(last(run(attack, defense)));
      expect(shown.iss!.check).toBe('passed');
      expect(shown.signature!.check).toBe('passed');
    }
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(OTHER_APP!, 'nope')).toHaveLength(1);
  });
});
