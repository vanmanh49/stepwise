import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { accessControlSteps, ATTACK_OPTIONS } from './access-control';

const [OFF, ON] = DEFENSE_OPTIONS;
const [ORDER, ADMIN, ROLE] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => accessControlSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const rows = (step: Step) => (step.view as PanelsView).panels.find((p) => p.label === 'Rows')!.view as GridView;

describe('access control', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it("reads order 102 with the check off, and gets 403 with it on", () => {
    expect(last(run(ORDER!, OFF!)).variables!.status).toBe(200);
    expect(last(run(ORDER!, ON!)).variables!.status).toBe(403);
    expect(last(run(ORDER!, OFF!)).why).toContain('102');
  });

  it('shows the account page has no admin link, and the URL works anyway', () => {
    const steps = run(ADMIN!, OFF!);
    expect(steps.find((s) => s.title.includes('account page'))!.variables!.links).toBe('/orders');
    expect(last(steps).variables!.status).toBe(200);
  });

  it.each([
    [OFF!, 'admin'],
    [ON!, 'customer'],
  ])('leaves the role row with the defense %s as %s', (defense, role) => {
    const grid = rows(run(ROLE!, defense).find((s) => s.title.includes('role=admin'))!);
    const column = grid.colLabels!.indexOf('role');
    expect(grid.rows.find((r) => r.cells[0]!.value === 'alice')!.cells[column]!.value).toBe(role);
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(ORDER!, 'nope')).toHaveLength(1);
  });
});
