import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { commandInjectionSteps, DEFENSE_OPTIONS, FEATURE_OPTIONS } from './command-injection';

const [PING, DOWNLOAD] = FEATURE_OPTIONS;
const [SHELL, BLOCKLIST, NO_SHELL] = DEFENSE_OPTIONS;

const run = (feature: string, input: string, defense: string) => commandInjectionSteps({ feature, input, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const words = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');
const ran = (steps: Step[]) => {
  const panel = steps.flatMap((step) => (step.view as PanelsView).panels).find((p) => p.label === 'On the server');
  return (panel?.view as GridView | undefined)?.rows.map((row) => row.cells[0]!.value).join('\n') ?? '';
};

describe('command injection and path traversal', () => {
  it.each<[string, string, string, string]>([
    [PING!, '8.8.8.8; cat /app/.env', SHELL!, 'attacker in'],
    [PING!, '8.8.8.8; cat /app/.env', BLOCKLIST!, 'stopped'],
    [PING!, '8.8.8.8; cat /app/.env', NO_SHELL!, 'stopped'],
    [PING!, '8.8.8.8 | cat /app/.env', SHELL!, 'attacker in'],
    [PING!, '8.8.8.8 | cat /app/.env', BLOCKLIST!, 'attacker in'],
    [PING!, '8.8.8.8 | cat /app/.env', NO_SHELL!, 'stopped'],
    [PING!, '8.8.8.8 $(whoami)', SHELL!, 'attacker in'],
    [PING!, '8.8.8.8 $(whoami)', BLOCKLIST!, 'attacker in'],
    [PING!, '8.8.8.8 $(whoami)', NO_SHELL!, 'stopped'],
    [DOWNLOAD!, '../../etc/passwd', SHELL!, 'attacker in'],
    [DOWNLOAD!, '../../etc/passwd', BLOCKLIST!, 'stopped'],
    [DOWNLOAD!, '../../etc/passwd', NO_SHELL!, 'stopped'],
    [DOWNLOAD!, '%2e%2e%2f%2e%2e%2fetc/passwd', SHELL!, 'attacker in'],
    [DOWNLOAD!, '%2e%2e%2f%2e%2e%2fetc/passwd', BLOCKLIST!, 'attacker in'],
    [DOWNLOAD!, '%2e%2e%2f%2e%2e%2fetc/passwd', NO_SHELL!, 'stopped'],
    [DOWNLOAD!, '....//....//etc/passwd', SHELL!, 'stopped'],
    [DOWNLOAD!, '....//....//etc/passwd', BLOCKLIST!, 'attacker in'],
    [DOWNLOAD!, '....//....//etc/passwd', NO_SHELL!, 'stopped'],
  ])('%s with %s under %s gives %s', (feature, input, defense, result) => {
    expect(last(run(feature, input, defense)).variables!.result).toBe(result);
  });

  it.each(DEFENSE_OPTIONS)('treats 8.8.8.8 and invoice.txt as ordinary input under %s', (defense) => {
    for (const [feature, input] of [[PING!, '8.8.8.8'], [DOWNLOAD!, 'invoice.txt']] as const) {
      const steps = run(feature, input, defense);
      expect(last(steps).variables!.result).toBe('stopped');
      expect(words(steps)).not.toMatch(/attack|inject|left the folder|second command/i);
    }
  });

  it('shows each command as the shell parsed it', () => {
    expect(ran(run(PING!, '8.8.8.8; cat /app/.env', SHELL!))).toBe('ping -c 1 8.8.8.8\ncat /app/.env');
  });

  it('shows the substitution run first', () => {
    expect(ran(run(PING!, '8.8.8.8 $(whoami)', SHELL!))).toBe('whoami\nping -c 1 8.8.8.8 www-data');
  });

  it('shows the output the attacker gets back', () => {
    expect(last(run(PING!, '8.8.8.8; cat /app/.env', SHELL!)).why).toContain('DB_PASSWORD=fake-password');
  });

  it('shows the path as it resolved', () => {
    expect(ran(run(DOWNLOAD!, '../../etc/passwd', SHELL!))).toBe('/etc/passwd');
    expect(ran(run(DOWNLOAD!, '../../etc/passwd', BLOCKLIST!))).toBe('/srv/files/etc/passwd');
  });

  it('says a path outside the folder that holds nothing gave nothing', () => {
    const steps = run(DOWNLOAD!, '../../nope', SHELL!);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(last(steps).why).toContain('outside');
  });

  it('runs no shell under No shell', () => {
    expect(run(PING!, '8.8.8.8; cat /app/.env', NO_SHELL!).length).toBeGreaterThan(1);
    expect(last(run(PING!, '8.8.8.8; cat /app/.env', NO_SHELL!)).variables!.status).toBe(400);
  });

  it('refuses bad knobs with one step', () => {
    expect(run('nope', 'x', SHELL!)).toHaveLength(1);
    expect(run(PING!, 'x', 'nope')).toHaveLength(1);
    expect(run(PING!, '', SHELL!)).toHaveLength(1);
    expect(run(PING!, 'x'.repeat(121), SHELL!)).toHaveLength(1);
  });
});
