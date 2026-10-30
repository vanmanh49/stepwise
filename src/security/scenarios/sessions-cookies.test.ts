import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { ATTACK_OPTIONS, sessionsCookiesSteps } from './sessions-cookies';

const [OFF, ON] = DEFENSE_OPTIONS;
const [SCRIPT, SNIFFED, FIXATION, GUESSABLE, STOLEN] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => sessionsCookiesSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const cookies = (step: Step) => ((step.view as PanelsView).panels[1]!.view as GridView).rows[0]!.cells[0]!.value;

describe('sessions and cookies', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it('lets a script read the cookie only without HttpOnly', () => {
    expect(run(SCRIPT!, OFF!).find((s) => s.title.startsWith('A script'))!.variables!.script).toMatch(/sid=/);
    expect(run(SCRIPT!, ON!).find((s) => s.title.startsWith('A script'))!.variables!.script).toBe('nothing');
  });

  it('lets the eavesdropper see the cookie only without Secure', () => {
    const seen = (defense: string) => run(SNIFFED!, defense).find((s) => s.title.startsWith('alice opens'))!.variables!.sniffed;
    expect(seen(OFF!)).toMatch(/[0-9a-f]{32}/);
    expect(seen(ON!)).toBe('nothing');
  });

  it('keeps the planted id only without rotation', () => {
    const signedIn = (defense: string) => run(FIXATION!, defense).find((s) => s.title.startsWith('alice signs in'))!;
    expect(signedIn(OFF!).variables!.sid).toBe('fixed-by-eve');
    expect(signedIn(ON!).variables!.sid).not.toBe('fixed-by-eve');
  });

  it('reaches 1002 from 1001 with counted ids', () => {
    const steps = run(GUESSABLE!, OFF!);
    expect(steps.some((s) => s.why.includes('1001'))).toBe(true);
    expect(steps.some((s) => s.why.includes('1002'))).toBe(true);
    expect(last(steps).why).toContain('1002');
  });

  it.each([OFF!, ON!])('empties the jar at sign-out with the defense %s', (defense) => {
    const steps = run(STOLEN!, defense);
    expect(cookies(steps.find((s) => s.title.startsWith('alice signs out'))!)).toBe('No cookies');
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(SCRIPT!, 'nope')).toHaveLength(1);
  });
});
