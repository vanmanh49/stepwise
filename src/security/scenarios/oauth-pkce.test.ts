import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { DEFENSE_OPTIONS } from '../steps';
import { ATTACK_OPTIONS, oauthPkceSteps } from './oauth-pkce';

const [OFF, ON] = DEFENSE_OPTIONS;
const [STOLEN, CSRF, TAMPER] = ATTACK_OPTIONS;

const run = (attack: string, defense: string) => oauthPkceSteps({ attack, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const titled = (steps: Step[], start: string) => steps.find((s) => s.title.startsWith(start))!;

describe('oauth and pkce', () => {
  it.each(ATTACK_OPTIONS)('%s works with the defense off and fails with it on', (attack) => {
    expect(last(run(attack, OFF!)).variables!.result).toBe('attacker in');
    expect(last(run(attack, ON!)).variables!.result).toBe('stopped');
  });

  it('lets the attacker redeem a stolen code only without PKCE', () => {
    expect(titled(run(STOLEN!, OFF!), 'The attacker redeems').variables!.status).toBe(200);
    expect(titled(run(STOLEN!, ON!), 'The attacker redeems').variables!.status).toBe(400);
  });

  it('shows a real S256 challenge', () => {
    expect(titled(run(STOLEN!, ON!), 'alice approves').variables!.challenge).toMatch(/^[\w-]{43}$/);
  });

  it('still signs alice in with PKCE on', () => {
    expect(titled(run(STOLEN!, ON!), 'alice arrives').variables!.status).toBe(200);
  });

  it('breaks alice\'s sign-in when the attacker used the code first', () => {
    expect(titled(run(STOLEN!, OFF!), 'alice arrives').variables!.status).toBe(400);
  });

  it('signs the victim in as the attacker without state', () => {
    expect(last(run(CSRF!, OFF!)).variables!.browser).toBe('eve');
    expect(last(run(CSRF!, ON!)).variables!.browser).toBe('nobody');
  });

  it('admits this run leaves out what else would stop login CSRF', () => {
    expect(last(run(CSRF!, OFF!)).why).toContain('PKCE or the OpenID Connect nonce');
  });

  it('sends the code to the attacker only without exact matching', () => {
    expect(titled(run(TAMPER!, OFF!), 'alice opens').variables!.inbox).toBe(1);
    expect(titled(run(TAMPER!, ON!), 'alice opens').variables!.inbox).toBe(0);
  });

  it('notes that PKCE does not save a tampered redirect', () => {
    expect(run(TAMPER!, OFF!).some((s) => s.why.includes('PKCE'))).toBe(true);
  });

  it('refuses unknown choices', () => {
    expect(run('nope', OFF!)).toHaveLength(1);
    expect(run(STOLEN!, 'nope')).toHaveLength(1);
  });
});
