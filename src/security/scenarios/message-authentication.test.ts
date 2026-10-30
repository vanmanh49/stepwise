import { describe, expect, it } from 'vitest';
import type { Step, View } from '../../types/visualization';
import { hex, utf8 } from '../crypto/bytes';
import { messageAuthenticationSteps } from './message-authentication';

const naive = { scheme: 'SHA-256(key + message)', key: 'secret-key', message: 'amount=100&to=alice', extension: '&to=mallory' };
const keyed = { ...naive, scheme: 'HMAC' };

function cellValues(view: View): string {
  if (view.kind === 'panels') return view.panels.map((p) => cellValues(p.view)).join('');
  if (view.kind === 'grid') return view.rows.flatMap((r) => r.cells.map((c) => String(c?.value ?? ''))).join('');
  return '';
}

const attackerSteps = (steps: Step[]) => steps.filter((s) => s.title.startsWith('Attacker'));

describe('message authentication scenario', () => {
  it('lets the attacker forge a valid tag on the naive scheme', () => {
    const steps = messageAuthenticationSteps(naive);
    expect(attackerSteps(steps).length).toBeGreaterThanOrEqual(2);
    expect(steps.at(-1)!.title).toContain('accepts');
    expect(steps.at(-1)!.variables!.result).toBe('accepted');
  });

  it('rejects the same forgery under HMAC', () => {
    const steps = messageAuthenticationSteps(keyed);
    expect(steps.at(-1)!.title).toContain('rejects');
    expect(steps.at(-1)!.variables!.result).toBe('rejected');
  });

  it('never shows the key on the attacker\'s turn', () => {
    const key = hex(utf8(naive.key));
    for (const values of [naive, keyed]) {
      for (const step of attackerSteps(messageAuthenticationSteps(values))) {
        expect(cellValues(step.view)).not.toContain(key);
        expect(JSON.stringify(step.variables ?? {})).not.toContain(naive.key);
      }
    }
  });

  it('shows the inner and outer hashes under HMAC', () => {
    const titles = messageAuthenticationSteps(keyed).map((s) => s.title).join(' ');
    expect(titles).toContain('inner');
    expect(titles).toContain('outer');
  });

  it('refuses fields over their byte limits', () => {
    expect(messageAuthenticationSteps({ ...naive, key: 'k'.repeat(17) })).toHaveLength(1);
    expect(messageAuthenticationSteps({ ...naive, message: 'm'.repeat(33) })).toHaveLength(1);
    expect(messageAuthenticationSteps({ ...naive, extension: 'e'.repeat(17) })).toHaveLength(1);
    expect(messageAuthenticationSteps({ ...naive, key: 'é'.repeat(9) })).toHaveLength(1);
    expect(messageAuthenticationSteps({ ...naive, key: '' })).toHaveLength(1);
  });

  it('works at the largest settings, which still fit one block', () => {
    const steps = messageAuthenticationSteps({ ...naive, key: 'k'.repeat(16), message: 'm'.repeat(32), extension: 'e'.repeat(16) });
    expect(steps.at(-1)!.variables!.result).toBe('accepted');
  });
});
