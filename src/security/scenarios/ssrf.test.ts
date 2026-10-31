import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { DEFENSE_OPTIONS, ssrfSteps } from './ssrf';

const [NONE, BLOCKLIST, ALLOW_LIST] = DEFENSE_OPTIONS;

const METADATA_IP = 'http://169.254.169.254/latest/credentials';
const METADATA_NAME = 'http://metadata.internal/latest/credentials';
const REDIRECT = 'https://evil.example/go';
const CAT = 'https://images.example/cat.png';

const run = (input: string, defense: string) => ssrfSteps({ input, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const words = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');

describe('SSRF', () => {
  it.each<[string, string, string]>([
    [METADATA_IP, NONE!, 'attacker in'],
    [METADATA_IP, BLOCKLIST!, 'stopped'],
    [METADATA_IP, ALLOW_LIST!, 'stopped'],
    [METADATA_NAME, NONE!, 'attacker in'],
    [METADATA_NAME, BLOCKLIST!, 'attacker in'],
    [METADATA_NAME, ALLOW_LIST!, 'stopped'],
    [REDIRECT, NONE!, 'attacker in'],
    [REDIRECT, BLOCKLIST!, 'attacker in'],
    [REDIRECT, ALLOW_LIST!, 'stopped'],
  ])('%s under %s gives %s', (input, defense, result) => {
    expect(last(run(input, defense)).variables!.result).toBe(result);
  });

  it.each(DEFENSE_OPTIONS)('shows credentials only when reached, under %s', (defense) => {
    for (const input of [METADATA_IP, METADATA_NAME, REDIRECT, CAT]) {
      const steps = run(input, defense);
      expect(words(steps).includes('SecretAccessKey')).toBe(last(steps).variables!.result === 'attacker in');
    }
  });

  it.each(DEFENSE_OPTIONS)('treats the cat picture as ordinary input under %s', (defense) => {
    const steps = run(CAT, defense);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(last(steps).why).toContain('A small picture of a cat');
    expect(words(steps)).not.toMatch(/attack|credentials|internal/i);
  });

  it.each([NONE!, BLOCKLIST!])('gives a network error for a real site under %s', (defense) => {
    const steps = run('https://real-site.com/', defense);
    expect(last(steps).variables!.status).toBe(502);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(last(steps).why).toContain('no such host');
  });

  it('says the allow-list follows no redirects, and shows it', () => {
    const steps = run('https://images.example/moved', ALLOW_LIST!);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(last(steps).variables!.status).toBe(502);
    expect(last(steps).why).toContain('follows no redirects');
  });

  it('says the allow-list refuses by host', () => {
    expect(last(run(REDIRECT, ALLOW_LIST!)).why).toContain('allow-list');
  });

  it('walks the redirect', () => {
    expect(words(run(REDIRECT, BLOCKLIST!))).toContain('169.254.169.254');
  });

  it('gives up on a redirect loop, and does not call it a missing host', () => {
    const steps = run('https://evil.example/loop', NONE!);
    expect(last(steps).variables!.status).toBe(502);
    expect(last(steps).why).toContain('too many redirects');
  });

  it('does not call an internal page cloud keys', () => {
    const steps = run('http://admin.internal/', NONE!);
    expect(last(steps).variables!.result).toBe('attacker in');
    expect(last(steps).why).not.toContain('keys');
  });

  it('does not describe a check that is not there', () => {
    expect(words(run(REDIRECT, NONE!))).not.toContain('The check only read');
    expect(words(run(REDIRECT, BLOCKLIST!))).toContain('The blocklist only read the first address');
  });

  it.each(['http://169.254.169.254:80/latest/credentials', 'http://user@169.254.169.254/latest/credentials', 'HTTP://METADATA.INTERNAL/latest/credentials'])('lets the other spelling %s past the blocklist, and not the allow-list', (input) => {
    expect(last(run(input, BLOCKLIST!)).variables!.result).toBe('attacker in');
    expect(last(run(input, ALLOW_LIST!)).variables!.result).toBe('stopped');
  });

  it('refuses bad knobs with one step', () => {
    expect(run('', NONE!)).toHaveLength(1);
    expect(run(CAT, 'nope')).toHaveLength(1);
    expect(run('x'.repeat(121), NONE!)).toHaveLength(1);
  });
});
