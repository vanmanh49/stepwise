import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import * as naive from './naive';
import * as pattern from './pattern';
import { mediatorLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, account: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, account, t));
};
const facts = (usePattern: boolean, changed: boolean, account: string) => Object.fromEntries(run(usePattern, changed, account).result!.facts);

describe('Mediator', () => {
  it('enables Submit only when the required fields are filled, the same on both designs', () => {
    const expected: [string, boolean, string][] = [
      ['Personal', false, 'enabled'],
      ['Company, all filled', false, 'enabled'],
      ['Company, no company name', false, 'disabled'],
      ['Personal', true, 'enabled'],
      ['Company, all filled', true, 'enabled'],
      ['Company, no company name', true, 'disabled'],
      ['Company, no VAT number', true, 'disabled'],
    ];
    for (const [account, changed, submit] of expected) {
      for (const usePattern of [false, true]) expect(facts(usePattern, changed, account).Submit, `${account} ${changed} ${usePattern}`).toBe(submit);
    }
  });

  it('stops waiting for the company name once Company is turned off again', () => {
    const form = new naive.SignupForm();
    form.name.type('Lan');
    form.account.toggle();
    expect([form.company.visible, form.submit.enabled]).toEqual([true, false]);
    form.account.toggle();
    expect([form.company.visible, form.submit.enabled]).toEqual([false, true]);
    const dialog = new pattern.SignupDialog();
    dialog.name.type('Lan');
    dialog.account.toggle();
    expect([dialog.company.visible, dialog.submit.enabled]).toEqual([true, false]);
    dialog.account.toggle();
    expect([dialog.company.visible, dialog.submit.enabled]).toEqual([false, true]);
  });

  it('links widgets to each other without the pattern, and only to the dialog with it', () => {
    expect(facts(false, false, 'Personal')['Links between widgets']).toBe('7');
    expect(facts(false, true, 'Personal')['Links between widgets']).toBe('10');
    expect(facts(true, false, 'Personal')['Links between widgets']).toBe('0');
    expect(facts(true, true, 'Personal')['Links between widgets']).toBe('0');
    const objects = patternSteps(lesson, { design: 'Pattern', change: 'None', account: 'Company, all filled' }).at(-2)!.view;
    if (objects.kind !== 'panels') throw new Error('expected panels');
    const links = objects.panels[1]!.view;
    if (links.kind !== 'services') throw new Error('expected the objects view');
    expect(links.links.length).toBeGreaterThan(0);
    expect(links.links.every((l) => l.from === 'SignupDialog#1' || l.to === 'SignupDialog#1')).toBe(true);
  });

  it('edits the widgets without the pattern, and only the dialog with it', () => {
    const naiveCost = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naiveCost.classesAdded).toEqual([]);
    expect(naiveCost.classesEdited).toEqual(['SubmitButton', 'Checkbox', 'SignupForm']);
    expect([naiveCost.linesAdded, naiveCost.linesRemoved]).toEqual([9, 3]);
    expect(patterned.classesAdded).toEqual([]);
    expect(patterned.classesEdited).toEqual(['SignupDialog']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([4, 2]);
  });
});
