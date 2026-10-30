import { describe, expect, it } from 'vitest';
import { hex } from './bytes';
import { runHandshake, TLS_ATTACKS } from './tls';

describe('tls handshake', () => {
  it('completes with no attacker: both sides hold one key and the record decrypts', () => {
    const run = runHandshake('none');
    expect(run.stoppedAt).toBeUndefined();
    expect(hex(run.clientKey!)).toBe(hex(run.serverKey!));
    expect(run.plaintext).toBe('Your order #4217 has shipped');
    expect(run.events.every((e) => e.ok)).toBe(true);
  });

  it('runs the messages in handshake order', () => {
    expect(runHandshake('none').events.map((e) => e.id)).toEqual([
      'client-hello',
      'server-hello',
      'keys',
      'certificate',
      'certificate-verify',
      'chain-check',
      'chain-check',
      'date-check',
      'name-check',
      'server-finished',
      'client-finished',
      'record',
    ]);
  });

  it.each([
    ['self-signed', 'chain', 'chain-check'],
    ['expired', 'date', 'date-check'],
    ['wrong-name', 'name', 'name-check'],
    ['tampered-record', 'record', 'record'],
  ] as const)('%s stops at the %s check', (attack, stoppedAt, failed) => {
    const run = runHandshake(attack);
    expect(run.stoppedAt).toBe(stoppedAt);
    expect(run.events.at(-1)!.id).toBe('closed');
    const bad = run.events.filter((e) => !e.ok);
    expect(bad[0]!.id).toBe(failed);
    expect(run.plaintext).toBeUndefined();
    expect(run.events.at(bad.length > 0 ? run.events.indexOf(bad[0]!) + 1 : 0)!.id).toBe('closed');
  });

  it('checks the expired and wrong-name certificates only after their chains pass', () => {
    for (const attack of ['expired', 'wrong-name'] as const) {
      const checks = runHandshake(attack).events.filter((e) => e.id === 'chain-check');
      expect(checks.map((e) => e.ok)).toEqual([true, true]);
    }
  });

  it('never lets a failed check reach the application data', () => {
    for (const attack of TLS_ATTACKS.filter((a) => a !== 'none')) {
      expect(runHandshake(attack).events.some((e) => e.id === 'record' && e.ok), attack).toBe(false);
    }
  });

  it('repeats exactly', () => {
    for (const attack of TLS_ATTACKS) expect(runHandshake(attack)).toEqual(runHandshake(attack));
  });
});
