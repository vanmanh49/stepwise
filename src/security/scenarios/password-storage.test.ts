import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { passwordStorageSteps, STORAGE_OPTIONS } from './password-storage';

const [PLAIN, SHA, SALTED, PBKDF] = STORAGE_OPTIONS;
const STRONG = 'tiger-lily-42';

const run = (storage: string, password = STRONG) => passwordStorageSteps({ storage, password });
const last = (steps: Step[]) => steps.at(-1)!;

/** The users table as it stood when the attacker copied it. */
function leaked(steps: Step[]): Record<string, string> {
  const step = steps.find((s) => s.title.startsWith('The attacker copies'))!;
  const grid = (step.view as PanelsView).panels.find((p) => p.label === 'Rows')!.view as GridView;
  const column = grid.colLabels!.indexOf('hash');
  return Object.fromEntries(grid.rows.map((row) => [row.cells[0]!.value, String(row.cells[column]!.value)]));
}

describe('password storage', () => {
  it('reads plain text with no guesses', () => {
    const steps = run(PLAIN!);
    expect(last(steps).variables).toMatchObject({ guesses: 0, cracked: 5 });
    expect(leaked(steps).carol).toBe('correct-hors…');
  });

  it('cracks equal SHA-256 hashes with one guess', () => {
    const steps = run(SHA!);
    expect(leaked(steps).alice).toBe(leaked(steps).bob);
    const hit = steps.find((s) => s.title.includes('sunshine'))!;
    expect(hit.title).toContain('alice');
    expect(hit.title).toContain('bob');
    expect(last(steps).variables).toMatchObject({ guesses: 12, cracked: 3 });
  });

  it('makes salted hashes differ, so each user costs a search', () => {
    const steps = run(SALTED!);
    expect(leaked(steps).alice).not.toBe(leaked(steps).bob);
    expect(last(steps).variables).toMatchObject({ guesses: 6 + 6 + 12 + 5 + 12, cracked: 3 });
  });

  it('cracks the same accounts with PBKDF2 at 100 times the cost', () => {
    const salted = last(run(SALTED!)).variables!;
    const slow = last(run(PBKDF!)).variables!;
    expect(slow.cracked).toBe(salted.cracked);
    expect(slow.guesses).toBe(salted.guesses);
    expect(slow.cost).toBe((salted.guesses as number) * 100);
  });

  it('never does more than 60 guesses', () => {
    for (const storage of STORAGE_OPTIONS) expect(last(run(storage)).variables!.guesses as number).toBeLessThanOrEqual(60);
  });

  it.each([SHA!, SALTED!, PBKDF!])('leaves a password outside the list uncracked with %s', (storage) => {
    expect(last(run(storage)).variables!.result).toBe('stopped');
    expect(last(run(storage)).why).toContain('not in the list');
  });

  it('gives up a list password in every scheme', () => {
    for (const storage of STORAGE_OPTIONS) expect(last(run(storage, 'monkey')).variables!.result).toBe('attacker in');
  });

  it('reads a strong password straight from plain text', () => {
    expect(last(run(PLAIN!)).variables!.result).toBe('attacker in');
  });

  it("shows a shared password as alice's row, unless salted", () => {
    expect(leaked(run(PLAIN!, 'sunshine')).you).toBe(leaked(run(PLAIN!, 'sunshine')).alice);
    expect(leaked(run(SHA!, 'sunshine')).you).toBe(leaked(run(SHA!, 'sunshine')).alice);
    expect(leaked(run(SALTED!, 'sunshine')).you).not.toBe(leaked(run(SALTED!, 'sunshine')).alice);
  });

  it('names the accounts that share a hash', () => {
    const leak = run(SHA!, 'dragon').find((s) => s.title.startsWith('The attacker copies'))!;
    expect(leak.why).toContain('alice and bob');
    expect(leak.why).toContain('root and you');
  });

  it('reports a rough time at real speed', () => {
    expect(last(run(SHA!)).why).toContain('10 billion');
    expect(last(run(PBKDF!)).why).toContain('8,000');
    expect(last(run(PBKDF!)).why).toContain('days');
    expect(last(run(PBKDF!)).why).toContain('roughly');
  });

  it('takes a password with quote marks', () => {
    expect(last(run(SHA!, "it's")).variables!.cracked).toBe(3);
  });

  it('runs 16 two-byte letters and refuses 17', () => {
    expect(run(SHA!, 'é'.repeat(16)).length).toBeGreaterThan(1);
    expect(run(SHA!, 'é'.repeat(17))).toHaveLength(1);
  });

  it('refuses an empty password and an unknown scheme', () => {
    expect(run(SHA!, '')).toHaveLength(1);
    expect(run('nope')).toHaveLength(1);
  });
});
