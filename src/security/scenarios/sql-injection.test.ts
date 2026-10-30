import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { DEFENSE_OPTIONS, QUERY_OPTIONS, sqlInjectionSteps } from './sql-injection';

const [SIGN_IN, SEARCH] = QUERY_OPTIONS;
const [STRING, BLOCKLIST, PARAMETERS] = DEFENSE_OPTIONS;

const run = (query: string, input: string, defense: string) => sqlInjectionSteps({ query, input, defense });
const last = (steps: Step[]) => steps.at(-1)!;
const result = (query: string, input: string, defense: string) => last(run(query, input, defense)).variables!.result;
const words = (steps: Step[]) => steps.map((step) => `${step.title} ${step.why}`).join(' ');
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((p) => p.label === label)?.view as GridView | undefined;
const queryText = (steps: Step[]) => steps.map((step) => panel(step, 'Query')?.rows[0]?.cells[0]?.value).find(Boolean);

const UNION = "' UNION SELECT name, hash, role FROM users --";
const LOWER = "' union select name, hash, role from users where name like '";
const DROP = "'; DROP TABLE orders --";
const OR = "' or 1=1 or '";

describe('SQL injection', () => {
  it.each<[string, string, string, string]>([
    [SIGN_IN!, "alice' --", STRING!, 'attacker in'],
    [SIGN_IN!, "alice' --", BLOCKLIST!, 'stopped'],
    [SIGN_IN!, "alice' --", PARAMETERS!, 'stopped'],
    [SIGN_IN!, OR, STRING!, 'attacker in'],
    [SIGN_IN!, OR, BLOCKLIST!, 'attacker in'],
    [SIGN_IN!, OR, PARAMETERS!, 'stopped'],
    [SEARCH!, UNION, STRING!, 'attacker in'],
    [SEARCH!, UNION, BLOCKLIST!, 'stopped'],
    [SEARCH!, UNION, PARAMETERS!, 'stopped'],
    [SEARCH!, LOWER, STRING!, 'attacker in'],
    [SEARCH!, LOWER, BLOCKLIST!, 'attacker in'],
    [SEARCH!, LOWER, PARAMETERS!, 'stopped'],
    [SEARCH!, DROP, STRING!, 'attacker in'],
    [SEARCH!, DROP, BLOCKLIST!, 'stopped'],
    [SEARCH!, DROP, PARAMETERS!, 'stopped'],
  ])('%s with %s under %s gives %s', (query, input, defense, expected) => {
    expect(result(query, input, defense)).toBe(expected);
  });

  it.each(DEFENSE_OPTIONS)('treats lamp and alice as ordinary input under %s', (defense) => {
    for (const [query, input] of [[SEARCH!, 'lamp'], [SIGN_IN!, 'alice']] as const) {
      const steps = run(query, input, defense);
      expect(last(steps).variables!.result).toBe('stopped');
      expect(words(steps)).not.toMatch(/attack|inject/i);
    }
  });

  it.each([SIGN_IN!, SEARCH!])('shows the final query in full for %s', (query) => {
    const input = "x'y";
    const shown = queryText(run(query, input, STRING!));
    expect(shown).toContain("x'y");
    expect(shown).toMatch(/^SELECT .* FROM (users|orders) WHERE/);
  });

  it('shows the password hash in the sign-in query', () => {
    expect(queryText(run(SIGN_IN!, 'alice', STRING!))).toContain('hash = ');
  });

  it('shows the error as a page for a stray quote, and it is not an attack', () => {
    const steps = run(SEARCH!, "'", STRING!);
    expect(last(steps).variables!.status).toBe(500);
    expect(last(steps).variables!.result).toBe('stopped');
    expect(last(steps).why).toContain('SQL error');
  });

  it('shows a 500 for a bad UNION', () => {
    expect(last(run(SEARCH!, "' UNION SELECT 1 --", STRING!)).variables!.status).toBe(500);
  });

  it('draws the stolen rows', () => {
    const rows = panel(last(run(SEARCH!, UNION, STRING!)), 'Rows')!;
    expect(rows.rows.some((row) => row.cells[0]!.value === 'alice')).toBe(true);
  });

  it('says the stacked statement is a danger many drivers refuse', () => {
    expect(last(run(SEARCH!, DROP, STRING!)).why).toMatch(/many real drivers/i);
  });

  it('notices a table dropped before a later failure', () => {
    expect(result(SEARCH!, "'; DROP TABLE orders; SELECT nope --", STRING!)).toBe('attacker in');
  });

  it('notices a write through sign-in that gives no session', () => {
    expect(result(SIGN_IN!, "x'; DELETE FROM orders --", STRING!)).toBe('attacker in');
  });

  it.each(['Sign-in', 'Search'])('says real drivers send values apart under Parameters, for %s', (query) => {
    expect(words(run(query, 'x', PARAMETERS!))).toContain('apart');
  });

  it('shows the input stay text under Parameters', () => {
    expect(queryText(run(SEARCH!, UNION, PARAMETERS!))).toContain("''");
  });

  it('caps the rows it draws', () => {
    const rows = panel(last(run(SEARCH!, "' UNION SELECT name, hash, role FROM users, orders --", STRING!)), 'Rows')!;
    expect(rows.rows.length).toBeLessThanOrEqual(8);
  });

  it('refuses bad knobs with one step', () => {
    expect(run('nope', 'x', STRING!)).toHaveLength(1);
    expect(run(SEARCH!, 'x', 'nope')).toHaveLength(1);
    expect(run(SEARCH!, '', STRING!)).toHaveLength(1);
    expect(run(SEARCH!, 'x'.repeat(121), STRING!)).toHaveLength(1);
    expect(run(SEARCH!, '🙂', STRING!)).toHaveLength(1);
  });
});
