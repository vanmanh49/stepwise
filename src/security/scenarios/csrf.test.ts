import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { ATTACK_OPTIONS, csrfSteps, DEFENSE_OPTIONS } from './csrf';

const [FORM, IMAGE] = ATTACK_OPTIONS;
const [NONE, SAME_SITE, TOKEN, ORIGIN] = DEFENSE_OPTIONS;

const run = (attack: string, defense: string) => csrfSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const rows = (step: Step) => (step.view as PanelsView).panels.find((p) => p.label === 'Rows')!.view as GridView;
const sofas = (step: Step) => rows(step).rows.filter((row) => row.cells.some((cell) => cell?.value === 'Sofa'));

describe('CSRF', () => {
  it.each<[string, string, string, number]>([
    [FORM!, NONE!, 'attacker in', 200],
    [FORM!, SAME_SITE!, 'stopped', 401],
    [FORM!, TOKEN!, 'stopped', 403],
    [FORM!, ORIGIN!, 'stopped', 403],
    [IMAGE!, NONE!, 'attacker in', 200],
    [IMAGE!, SAME_SITE!, 'stopped', 401],
    [IMAGE!, TOKEN!, 'stopped', 403],
    [IMAGE!, ORIGIN!, 'attacker in', 200],
  ])('%s under %s gives %s with %i', (attack, defense, result, status) => {
    const step = last(run(attack, defense));
    expect(step.variables!.result).toBe(result);
    expect(step.variables!.status).toBe(status);
  });

  it.each(ATTACK_OPTIONS.flatMap((attack) => DEFENSE_OPTIONS.map((defense) => [attack, defense] as const)))('%s under %s adds a row for alice only when it works', (attack, defense) => {
    const step = last(run(attack, defense));
    const found = sofas(step);
    expect(found).toHaveLength(step.variables!.result === 'attacker in' ? 1 : 0);
    for (const row of found) expect(row.cells.map((cell) => cell?.value)).toContain('alice');
  });

  it('says the GET has no origin header and must not change state', () => {
    const { why } = last(run(IMAGE!, ORIGIN!));
    expect(why).toContain('no origin header');
    expect(why).toContain('must not change state');
  });

  it('names evil.example when the origin check refuses', () => {
    expect(last(run(FORM!, ORIGIN!)).why).toContain('evil.example');
  });

  it('says why the attacker cannot read the token', () => {
    expect(last(run(FORM!, TOKEN!)).why).toContain('read');
  });

  it('says where the form leaves alice', () => {
    expect(last(run(FORM!, NONE!)).why).not.toContain('page reload');
    expect(last(run(FORM!, NONE!)).why).toContain('Order placed');
  });

  it('refuses bad knobs with one step', () => {
    expect(run('nope', NONE!)).toHaveLength(1);
    expect(run(FORM!, 'nope')).toHaveLength(1);
  });
});
