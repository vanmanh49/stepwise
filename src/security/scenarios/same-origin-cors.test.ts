import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { ATTACK_OPTIONS, CORS_OPTIONS, sameOriginCorsSteps } from './same-origin-cors';

const [READ, CHANGE] = ATTACK_OPTIONS;
const [NONE, ONE, REFLECT, WILDCARD] = CORS_OPTIONS;

const run = (attack: string, cors: string) => sameOriginCorsSteps({ attack, cors });
const last = (steps: Step[]) => steps.at(-1)!;
const text = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');

describe('same origin and CORS', () => {
  it.each(ATTACK_OPTIONS.flatMap((attack) => CORS_OPTIONS.map((cors) => [attack, cors, cors === REFLECT ? 'attacker in' : 'stopped'] as const)))('%s with %s gives %s', (attack, cors, result) => {
    expect(last(run(attack, cors)).variables!.result).toBe(result);
  });

  it.each(CORS_OPTIONS)('Read: the response reaches the browser with %s', (cors) => {
    expect(last(run(READ!, cors)).variables!.status).toBe(200);
  });

  it.each([NONE!, ONE!, WILDCARD!])('Read: says the page cannot read it with %s', (cors) => {
    expect(last(run(READ!, cors)).why).toContain('cannot read');
  });

  it('Read: shows what alice sees to the page with Reflect any', () => {
    expect(last(run(READ!, REFLECT!)).why).toContain('Signed in as alice');
  });

  it.each([NONE!, ONE!, WILDCARD!])('Change: sends no PUT with %s', (cors) => {
    expect(text(run(CHANGE!, cors))).toContain('never sent');
    expect(last(run(CHANGE!, cors)).variables!.put).toBe('not sent');
  });

  it('Change: sends the PUT with Reflect any, and the name changes', () => {
    const step = last(run(CHANGE!, REFLECT!));
    expect(step.variables!.put).toBe(200);
    expect(step.why).toContain('mallory');
  });

  it('Wildcard names the credentials rule, and says it suits public data', () => {
    expect(last(run(READ!, WILDCARD!)).why).toContain('credentials');
    expect(text(run(READ!, WILDCARD!))).toContain('public data');
  });

  it('One origin names the origin it allows', () => {
    expect(last(run(READ!, ONE!)).why).toContain('https://app.shop.example');
  });

  it('uses a SameSite=None cookie, or nothing would be sent at all', () => {
    expect(run(READ!, NONE!)[0]!.why).toContain('SameSite=None');
  });

  it('does not say every browser sends the cookie', () => {
    expect(run(READ!, NONE!)[0]!.why).not.toContain('with requests from any site');
    expect(run(READ!, NONE!)[0]!.why).toContain('Firefox and Safari');
  });

  it('refuses unknown choices', () => {
    expect(run('nope', NONE!)).toHaveLength(1);
    expect(run(READ!, 'nope')).toHaveLength(1);
  });
});
