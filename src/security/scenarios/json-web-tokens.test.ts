import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { ATTACK_OPTIONS, jsonWebTokensSteps } from './json-web-tokens';

const [OFF, ON] = DEFENSE_OPTIONS;
const [EDIT, , WEAK, STOLEN] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => jsonWebTokensSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const rows = (step: Step) => (step.view as PanelsView).panels.find((p) => p.label === 'Rows')?.view as GridView | undefined;

describe('json web tokens', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it('reaches the admin page as alice with an edited payload', () => {
    const steps = run(EDIT!, OFF!);
    expect(last(steps).title).toContain('/admin');
    expect(last(steps).why).toContain('alice');
    const edited = rows(steps.find((s) => s.title.includes('edits'))!)!;
    expect(edited.rows.map((r) => r.cells.map((c) => c!.value))).toContainEqual(['role', 'admin']);
  });

  it('finds the weak secret in the list, and nothing when it is strong', () => {
    const found = (defense: string) => run(WEAK!, defense).find((s) => s.title.includes('list'))!;
    expect(found(OFF!).variables!.secret).toBe('secret');
    expect(found(ON!).variables!.secret).toBe('not found');
  });

  it('keeps a stolen token alive after sign-out with a long expiry', () => {
    const steps = run(STOLEN!, OFF!);
    expect(last(steps).why).toContain('session row');
    expect(steps.some((s) => s.title.startsWith('alice signs out'))).toBe(true);
    expect(last(steps).variables!.seconds).toBe(600);
  });

  it('ends a stolen token after its 300 s expiry', () => {
    const steps = run(STOLEN!, ON!);
    expect(last(steps).why).toContain('session row');
    expect(last(steps).variables!.seconds).toBe(600);
    expect(steps.find((s) => s.title.startsWith('The attacker uses'))!.variables!.status).toBe(200);
  });

  it('shows the three parts decoded', () => {
    const labels = rows(run(EDIT!, OFF!).find((s) => s.title.startsWith('alice signs in'))!)!.rows.map((r) => r.cells[0]!.value);
    expect(labels).toEqual(['alg', 'sub', 'role', 'exp', 'signature']);
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(EDIT!, 'nope')).toHaveLength(1);
  });
});
