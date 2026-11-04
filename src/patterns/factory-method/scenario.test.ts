import { describe, expect, it } from 'vitest';
import type { GridView, LadderView, PanelsView } from '../../types/visualization';
import { changeCost, countBranches } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { factoryMethodLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, channel: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, channel, t));
};

describe('Factory Method', () => {
  it('sends all 3 messages on the chosen channel in every design', () => {
    for (const [pattern, changed, channel, word] of [
      [false, false, 'Email', 'email'],
      [true, false, 'SMS', 'sms'],
      [false, true, 'Push', 'push'],
      [true, true, 'Push', 'push'],
    ] as const) {
      const result = run(pattern, changed, channel).result!;
      expect(result.ok).toBe(true);
      expect(result.facts.map(([, sent]) => sent)).toEqual([
        `${word} to ann: Welcome!`,
        `${word} to ann: Your code is 4821`,
        `${word} to ann: You paid $20`,
      ]);
    }
  });

  it('makes the message inside createMessage, the factory method', () => {
    const trace = run(true, false, 'Email');
    const message = trace.objects.find((o) => o.id === 'EmailMessage#1')!;
    expect(message.origin.kind).toBe('made');
    expect(trace.calls[(message.origin as { by: number }).by]).toMatchObject({ callee: 'EmailNotifier#1', method: 'createMessage' });
  });

  it('costs the naive design an edit in all 3 flows, and the pattern none', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['PushMessage']);
    expect(naive.classesEdited).toEqual(['SignupFlow', 'ResetFlow', 'ReceiptFlow']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([11, 3]);
    expect(pattern.classesAdded).toEqual(['PushMessage', 'PushNotifier']);
    expect(pattern.classesEdited).toEqual([]);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([10, 0]);
  });

  it('adds 3 branches to the naive design and none to the pattern', () => {
    expect(countBranches(lesson.designs.naiveChanged.source) - countBranches(lesson.designs.naive.source)).toBe(3);
    expect(countBranches(lesson.designs.patternChanged.source)).toBe(countBranches(lesson.designs.pattern.source));
  });

  it('refuses Push before the change exists', () => {
    expect(patternSteps(lesson, { design: 'Pattern', change: 'None', channel: 'Push' })).toHaveLength(1);
  });

  it('shows the learner createMessage as a call the notifier makes on itself', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', channel: 'Email' });
    const step = steps.find((s) => s.title === 'EmailNotifier#1 calls EmailNotifier#1.createMessage()')!;
    const ladder = (step.view as PanelsView).panels[0]!.view as LadderView;
    expect(ladder.rows.at(-1)).toMatchObject({ label: '↻ createMessage()', role: 'active' });
    const cost = patternSteps(lesson, { design: 'Pattern', change: lesson.change, channel: 'Push' }).at(-2)!.view as GridView;
    expect(cost.rows[1]!.cells.map((c) => c!.value)).toEqual(['3 classes', '0 classes']);
  });
});
