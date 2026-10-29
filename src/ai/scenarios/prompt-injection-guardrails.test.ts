import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { promptInjectionGuardrailsSteps } from './prompt-injection-guardrails';

const run = (guard: string, quirk = 'trusts-tool-output') => promptInjectionGuardrailsSteps({ guard, quirk });
const eveRow = (guard: string, quirk?: string) => {
  const panels = (run(guard, quirk).at(-1)!.view as PanelsView).panels;
  const office = panels.find((p) => p.label === 'Office')!.view as GridView;
  return office.rows.find((r) => r.label === 'to eve@evil.test');
};

describe('prompt injection lesson', () => {
  it('lets the hidden instruction email the notes to the attacker without a guard', () => {
    expect(eveRow('none')!.cells[0]!.role).toBe('discarded');
    expect(run('none').at(-1)!.title).toBe('The attack worked: the notes went to eve@evil.test');
  });

  it.each([
    ['spotlight', 'Blocked by spotlighting: nothing left the office'],
    ['allowlist', 'Blocked by the tool allowlist: nothing left the office'],
    ['both', 'Blocked by spotlighting: nothing left the office'],
  ])('stops the attack with %s', (guard, title) => {
    expect(eveRow(guard)).toBeUndefined();
    expect(run(guard).at(-1)!.title).toBe(title);
  });

  it('never follows the instruction with a careful model', () => {
    expect(eveRow('none', 'none')).toBeUndefined();
    expect(run('none', 'none').at(-1)!.title).toBe('The careful model treated the note as data');
  });

  it('refuses an unknown guard with one step', () => {
    expect(run('firewall')).toHaveLength(1);
  });

  it('does not say "no guard" for a careful model behind a guard', () => {
    expect(run('spotlight', 'none').at(-1)!.why).not.toContain('no guard');
  });
});
