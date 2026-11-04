import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { decoratorLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, layers: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, layers, t));
};
const fact = (pattern: boolean, changed: boolean, layers: string, label: string) =>
  run(pattern, changed, layers).result!.facts.find(([l]) => l === label)![1];

describe('Decorator', () => {
  it('stores the same bytes either way', () => {
    for (const layers of ['Logging', 'Compression', 'Logging + Compression']) {
      expect(fact(true, false, layers, 'Stored'), layers).toBe(fact(false, false, layers, 'Stored'));
    }
    expect(fact(true, false, 'Logging', 'Stored')).toBe('24 bytes');
    expect(fact(true, false, 'Compression', 'Stored')).toBe('6 bytes');
    expect(fact(true, false, 'Logging + Compression', 'Log')).toBe('writing 24 bytes');
  });

  it('gives different sizes for the two encryption orders', () => {
    expect(fact(true, true, 'Compress, then encrypt', 'Stored')).toBe('6 bytes');
    expect(fact(true, true, 'Encrypt, then compress', 'Stored')).toBe('48 bytes');
    expect(fact(false, true, 'Compress, then encrypt', 'Stored')).toBe('6 bytes');
  });

  it('needs a class per combination without the pattern', () => {
    expect(fact(false, false, 'Logging', 'Sink classes')).toBe('4');
    expect(fact(false, true, 'Logging', 'Sink classes')).toBe('8');
    expect(fact(true, false, 'Logging', 'Sink classes')).toBe('3');
    expect(fact(true, true, 'Logging', 'Sink classes')).toBe('4');
  });

  it('nests calls through each layer', () => {
    const trace = run(true, false, 'Logging + Compression');
    expect(trace.calls.map((c) => [c.callee, c.depth])).toEqual([
      ['LoggingSink#1', 0],
      ['CompressingSink#1', 1],
      ['FileSink#1', 2],
    ]);
  });

  it('refuses the encrypt-first order on the naive design', () => {
    expect(patternSteps(lesson, { design: 'Naive', change: lesson.change, layers: 'Encrypt, then compress' })).toHaveLength(1);
    expect(patternSteps(lesson, { design: 'Pattern', change: 'None', layers: 'Compress, then encrypt' })).toHaveLength(1);
  });

  it('adds 4 classes without the pattern, and 1 with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['EncryptingSink', 'LoggingEncryptingSink', 'CompressingEncryptingSink', 'LoggingCompressingEncryptingSink']);
    expect(naive.classesEdited).toEqual([]);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([26, 0]);
    expect(pattern.classesAdded).toEqual(['EncryptingSink']);
    expect(pattern.classesEdited).toEqual([]);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([10, 0]);
  });
});
