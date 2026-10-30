import { describe, expect, it } from 'vitest';
import type { PanelsView, ServicesView } from '../../types/visualization';
import { runHandshake, RECORD_TEXT, TLS_ATTACKS } from '../crypto/tls';
import { ATTACK_LABELS, certificatesTlsSteps } from './certificates-tls';

const run = (attack: (typeof TLS_ATTACKS)[number]) => certificatesTlsSteps({ attack: ATTACK_LABELS[attack] });
const services = (view: unknown) => (view as PanelsView).panels[0]!.view as ServicesView;

describe('certificates and TLS scenario', () => {
  it('ends with the decrypted record when nobody interferes', () => {
    expect(run('none').at(-1)!.title).toContain(RECORD_TEXT);
  });

  it('never draws an attacker when there is none', () => {
    for (const step of run('none')) expect(services(step.view).nodes.map((n) => n.id)).not.toContain('attacker');
  });

  it.each([
    ['self-signed', 'Chain'],
    ['expired', 'Date'],
    ['wrong-name', 'Name'],
    ['tampered-record', 'Record'],
  ] as const)('%s ends at the %s check with the connection closed', (attack, check) => {
    const last = run(attack).at(-1)!;
    expect(last.title).toContain(`${check} check failed`);
    expect(last.title).toContain('closed');
    expect(services(last.view).nodes.map((n) => n.id)).toContain('attacker');
    expect(run(attack).map((s) => s.title).join('\n')).not.toContain(RECORD_TEXT);
  });

  it('gives every handshake event a step', () => {
    for (const attack of TLS_ATTACKS) {
      expect(run(attack).map((s) => s.variables!.event)).toEqual(runHandshake(attack).events.map((e) => e.id));
    }
  });

  it('keeps every message on a drawn link', () => {
    for (const attack of TLS_ATTACKS) {
      for (const step of run(attack)) {
        const view = services(step.view);
        const links = new Set(view.links.flatMap((l) => [`${l.from}>${l.to}`, `${l.to}>${l.from}`]));
        for (const message of view.messages) expect(links.has(`${message.from}>${message.to}`), `${attack} ${step.title}`).toBe(true);
      }
    }
  });

  it('shows that the attacker holds no key when tampering with a record', () => {
    const last = run('tampered-record').at(-1)!;
    const grid = (last.view as PanelsView).panels[1]!.view;
    expect(JSON.stringify(grid)).toContain('Attacker');
    expect(last.why).toContain('key');
  });
});
