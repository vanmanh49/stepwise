import { describe, expect, it } from 'vitest';
import type { GridView, LadderView, PanelsView, ServicesView, Step } from '../types/visualization';
import { fixtureLesson } from './__fixtures__/lesson';
import { MAX_STEPS, patternCode, patternFields, patternPresets, patternSteps } from './steps';

const run = (design: string, change: string, to: string) => patternSteps(fixtureLesson, { design, change, to });
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((p) => p.label === label)?.view;
const code = patternCode(fixtureLesson);
const lineText = (step: Step) => code.split('\n')[step.codeLine! - 1]!;
const patternStart = code.split('\n').indexOf('// With the pattern') + 1;

describe('patternCode', () => {
  it('shows the naive design first, then the pattern', () => {
    expect(code.startsWith('// Naive\nexport class Mailer {')).toBe(true);
    expect(code).toContain('\n// With the pattern\nexport class Sender {');
  });
});

describe('patternFields and patternPresets', () => {
  it('asks for the design, the change and the scenario', () => {
    expect(patternFields(fixtureLesson).map((f) => [f.name, f.sample, f.options])).toEqual([
      ['design', 'Naive', ['Naive', 'Pattern']],
      ['change', 'None', ['None', 'Add paging']],
      ['to', 'Ann', ['Ann', 'Bob', 'Cy', 'Boom', 'Loop']],
    ]);
  });

  it('offers four presets that each run', () => {
    const presets = patternPresets(fixtureLesson);
    expect(presets.map((p) => p.label)).toEqual(['Naive', 'Pattern', 'Naive + change', 'Pattern + change']);
    expect(presets[3]!.values).toEqual({ design: 'Pattern', change: 'Add paging', to: 'Cy' });
    for (const p of presets) expect(patternSteps(fixtureLesson, p.values).length).toBeGreaterThan(1);
  });
});

describe('patternSteps', () => {
  it('draws one step per call and per value returned, then the result', () => {
    const steps = run('Pattern', 'None', 'Ann');
    expect(steps.map((s) => s.title)).toEqual([
      'client calls Shop#1.order("Ann")',
      'Shop#1 calls Sender#1.send("Ann")',
      'Sender#1 returns "mail to Ann"',
      'Shop#1 returns "mail to Ann"',
      'Sent: mail to Ann',
    ]);
    expect(steps[0]!.why).toBe('The client places an order.');
  });

  it('shows the sequence and the objects at each call', () => {
    const step = run('Pattern', 'None', 'Ann')[1]!;
    const ladder = panel(step, 'Sequence') as LadderView;
    expect(ladder.columns.map((c) => c.id)).toEqual(['client', 'Shop#1', 'Sender#1']);
    expect(ladder.rows.at(-1)).toMatchObject({ from: 'Shop#1', to: 'Sender#1', label: 'send("Ann")', role: 'active' });
    const objects = panel(step, 'Objects') as ServicesView;
    expect(objects.nodes.map((n) => [n.id, n.type, n.role])).toEqual([
      ['client', 'client', 'default'],
      ['Shop#1', 'service', 'default'],
      ['Sender#1', 'service', 'active'],
    ]);
    expect(objects.links).toEqual([{ from: 'Shop#1', to: 'Sender#1', role: 'default' }]);
  });

  it('marks the result right or wrong', () => {
    const result = run('Pattern', 'None', 'Ann').at(-1)!;
    expect(result.variables?.result).toBe('right');
    const grid = panel(result, 'Result') as GridView;
    expect(grid.rows[0]).toMatchObject({ label: 'Message', cells: [{ value: 'mail to Ann', role: 'found' }] });
  });

  it('measures the change for both designs, then lists the chosen one\'s lines', () => {
    const steps = run('Pattern', 'Add paging', 'Cy');
    const cost = steps.at(-2)!.view as GridView;
    expect(cost.colLabels).toEqual(['Naive', 'Pattern']);
    expect(cost.rows.map((r) => r.label)).toEqual(['Classes added', 'Classes edited', 'Lines +', 'Lines −', 'Branches']);
    expect(cost.rows[0]!.cells.map((c) => [c!.value, c!.role])).toEqual([[0, 'found'], [1, 'compare']]);
    expect(cost.rows[1]!.cells.map((c) => [c!.value, c!.role])).toEqual([[1, 'default'], [1, 'default']]);
    const lines = steps.at(-1)!.view as GridView;
    expect(lines.rows.some((r) => r.label === '+' && r.cells[0]!.value === 'Pager: page(to: string) {')).toBe(true);
  });

  it('marks the cheaper side of each cost row as found', () => {
    const cost = run('Naive', 'Add paging', 'Ann').at(-2)!.view as GridView;
    const branches = cost.rows[4]!.cells.map((c) => [c!.value, c!.role]);
    expect(branches).toEqual([['0 → 1', 'default'], ['0 → 1', 'default']]);
    const plus = cost.rows[2]!.cells.map((c) => c!.role);
    expect(plus).toContain('found');
  });

  it('points code lines into the section of the design that ran', () => {
    const naiveSend = run('Naive', 'None', 'Ann').find((s) => s.title.includes('.send('))!;
    const patternSend = run('Pattern', 'None', 'Ann').find((s) => s.title.includes('.send('))!;
    expect(naiveSend.codeLine! < patternStart).toBe(true);
    expect(patternSend.codeLine! > patternStart).toBe(true);
    expect(lineText(naiveSend)).toContain('send(');
    expect(lineText(patternSend)).toContain('send(');
  });

  it('keeps the previous code line for a method that exists only after the change', () => {
    const steps = run('Pattern', 'Add paging', 'Cy');
    const at = steps.findIndex((s) => s.title.includes('.page('));
    expect(steps[at]!.codeLine).toBe(steps[at - 1]!.codeLine);
  });

  it('gives every step a code line inside the code', () => {
    const lines = code.split('\n').length;
    for (const values of patternPresets(fixtureLesson).map((p) => p.values)) {
      for (const step of patternSteps(fixtureLesson, values)) {
        expect(step.codeLine! >= 1 && step.codeLine! <= lines, step.title).toBe(true);
      }
    }
  });

  it('refuses unusable input with one step', () => {
    for (const values of [
      { design: 'Both', change: 'None', to: 'Ann' },
      { design: 'Naive', change: 'Other', to: 'Ann' },
      { design: 'Naive', change: 'None', to: 'Dee' },
      { design: 'Pattern', change: 'None', to: 'Cy' },
      { design: 'Naive', change: 'None', to: 'Bob' },
    ]) {
      expect(patternSteps(fixtureLesson, values), JSON.stringify(values)).toHaveLength(1);
    }
  });

  it('ends a run that throws with a result step naming the error', () => {
    const last = run('Naive', 'None', 'Boom').at(-1)!;
    expect(last.title).toContain('boom');
    expect(last.variables?.result).toBe('wrong');
  });

  it('cuts a runaway run and says so', () => {
    const steps = run('Pattern', 'None', 'Loop');
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
    expect(steps.at(-1)!.title).toContain('200 calls');
  });

  it('repeats exactly', () => {
    expect(run('Naive', 'Add paging', 'Cy')).toEqual(run('Naive', 'Add paging', 'Cy'));
  });
});
