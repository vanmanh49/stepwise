import { describe, expect, it } from 'vitest';
import { concat, hex, utf8 } from './bytes';
import { INITIAL_STATE, padding, resume, sha256, traceBlock } from './sha256';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('sha256', () => {
  it('matches the published vector for abc', () => {
    expect(hex(sha256(utf8('abc')))).toBe(ABC);
  });

  it('matches the published vector for empty input', () => {
    expect(hex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('traces all 64 rounds and ends at the digest', () => {
    const message = utf8('abc');
    const trace = traceBlock(INITIAL_STATE, concat(message, padding(message.length)));
    expect(trace.rounds).toHaveLength(64);
    expect(trace.schedule).toHaveLength(64);
    expect(trace.out.map((w) => w.toString(16).padStart(8, '0')).join('')).toBe(ABC);
  });

  it('pads to a whole number of blocks', () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65]) {
      expect((length + padding(length).length) % 64, String(length)).toBe(0);
    }
    expect(padding(55)).toHaveLength(9);
    expect(padding(56)).toHaveLength(72);
  });

  it('resumes from a digest as if the padded message had been hashed first', () => {
    const message = utf8('0123456789');
    const extra = utf8('&admin=true');
    expect(hex(resume(sha256(message), 64, extra))).toBe(hex(sha256(concat(message, padding(10), extra))));
  });
});
