import { describe, expect, it } from 'vitest';
import type { LadderView, PanelsView } from '../../types/visualization';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { facadeLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, clients: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, clients, t));
};

describe('Facade', () => {
  it('places one order per client, with all 3 steps in order, in every design', () => {
    for (const pattern of [false, true]) {
      for (const changed of [false, true]) {
        const result = run(pattern, changed, '3 clients').result!;
        expect(result.ok).toBe(true);
        expect(result.facts.map(([label]) => label)).toEqual(['Web shop', 'Mobile app', 'Phone orders']);
        expect(result.facts[0]![1]).toBe(`reserved book · ${changed ? 'captured 20 USD' : 'charged $20'} · shipping to 12 Elm St`);
      }
    }
    expect(run(true, false, '2 clients').result!.facts).toHaveLength(2);
  });

  it('sends every subsystem call through the facade', () => {
    const trace = run(true, false, '3 clients');
    expect(trace.calls.filter((c) => c.method === 'place').map((c) => c.caller)).toEqual(['WebShop#1', 'MobileApp#1', 'PhoneOrders#1']);
    const subsystem = trace.calls.filter((c) => ['reserve', 'charge', 'book'].includes(c.method));
    expect(subsystem).toHaveLength(9);
    expect(new Set(subsystem.map((c) => c.caller))).toEqual(new Set(['OrderFacade#1']));
    expect(new Set(run(false, false, '3 clients').calls.filter((c) => c.method === 'charge').map((c) => c.caller))).toEqual(
      new Set(['WebShop#1', 'MobileApp#1', 'PhoneOrders#1']),
    );
  });

  it('edits every client without the pattern, and only the facade with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesEdited).toEqual(['Payment', 'WebShop', 'MobileApp', 'PhoneOrders']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([5, 5]);
    expect(pattern.classesEdited).toEqual(['Payment', 'OrderFacade']);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([3, 3]);
  });

  it('shows the learner the facade fanning out to the subsystems', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', clients: '2 clients' });
    const charge = steps.find((s) => s.title === 'OrderFacade#1 calls Payment#1.charge(20)')!;
    const ladder = (charge.view as PanelsView).panels[0]!.view as LadderView;
    expect(ladder.rows.at(-1)).toMatchObject({ from: 'OrderFacade#1', to: 'Payment#1', role: 'active' });
  });
});
