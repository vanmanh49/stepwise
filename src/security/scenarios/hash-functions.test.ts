import { describe, expect, it } from 'vitest';
import lesson from '../../lessons/security/hash-functions';
import { hashFunctionsSteps } from './hash-functions';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const inside = { mode: 'Inside one hash', text: 'abc', text2: 'abd' };
const compare = { ...inside, mode: 'Compare two inputs' };

describe('hash functions scenario', () => {
  it('walks one block through 64 rounds to the real digest', () => {
    const steps = hashFunctionsSteps(inside);
    expect(steps.length).toBeGreaterThanOrEqual(67);
    expect(steps.length).toBeLessThanOrEqual(75);
    expect(steps.at(-1)!.title).toContain(ABC);
  });

  it('reports the bits two nearby inputs differ by', () => {
    const last = hashFunctionsSteps(compare).at(-1)!;
    expect(Number(last.variables!.bits)).toBeGreaterThan(90);
    expect(last.title).toContain('of 256 bits');
    expect(`${last.title} ${last.why}`).toContain('avalanche');
  });

  it('does not claim an avalanche for identical inputs', () => {
    const steps = hashFunctionsSteps({ ...compare, text2: 'abc' });
    expect(steps.at(-1)!.variables!.bits).toBe(0);
    for (const step of steps) expect(`${step.title} ${step.why} ${step.next ?? ''}`.toLowerCase()).not.toContain('avalanche');
  });

  it('counts the 55-byte limit in bytes, not characters', () => {
    const fits = `${'é'.repeat(27)}a`;
    expect(hashFunctionsSteps({ ...inside, text: fits }).length).toBeGreaterThan(60);
    const refused = hashFunctionsSteps({ ...inside, text: 'é'.repeat(28) });
    expect(refused).toHaveLength(1);
    expect(refused[0]!.why).toContain('55');
  });

  it('credits the 0x80 byte with marking where the message ends', () => {
    const why = hashFunctionsSteps(inside)[1]!.why;
    expect(why).toContain('marks where the message ends');
    expect(why).not.toContain('never pad to the same block');
  });

  it('does not grade learners on the length alone stopping equal blocks', () => {
    expect(lesson.quiz.find((q) => q.id === 'q3')!.explanation).not.toContain('Without the length');
  });

  it('hashes empty text', () => {
    expect(hashFunctionsSteps({ ...inside, text: '' }).at(-1)!.title).toContain('e3b0c44298fc1c149afbf4c8996fb924');
  });

  it('refuses a second text that is too long in compare mode only', () => {
    const long = 'x'.repeat(56);
    expect(hashFunctionsSteps({ ...compare, text2: long })).toHaveLength(1);
    expect(hashFunctionsSteps({ ...inside, text2: long }).length).toBeGreaterThan(60);
  });
});
