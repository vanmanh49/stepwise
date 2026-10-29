import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { reflectionSteps } from './reflection';

const defaults = { task: 'sam-weather', critic: 'on', retries: '1' };
const lastEmail = (values: Record<string, string>) => {
  const office = (reflectionSteps(values).at(-1)!.view as PanelsView).panels.find((p) => p.label === 'Office')!.view as GridView;
  return office.rows.find((r) => r.label === 'to sam@office.test')!.cells[0]!.value;
};

describe('reflection lesson', () => {
  it('catches the wrong unit before the email is sent', () => {
    expect(lastEmail(defaults)).toBe('It is 31°C and rainy in Hanoi.');
  });

  it('sends °F with no critic, or with no retries left', () => {
    expect(lastEmail({ ...defaults, critic: 'off' })).toBe('It is 88°F and rainy in Hanoi.');
    expect(lastEmail({ ...defaults, retries: '0' })).toBe('It is 88°F and rainy in Hanoi.');
  });

  it('still shows the failed check with no retries left', () => {
    const steps = reflectionSteps({ ...defaults, retries: '0' });
    expect(steps.map((s) => s.title)).toContain('Critic: 0 of 1 check pass');
    const checks = steps.flatMap((s) => (s.view.kind === 'panels' ? s.view.panels.filter((p) => p.label === 'Checks') : []));
    expect(checks.length).toBeGreaterThan(0);
  });

  it('refuses 3 retries with one step', () => {
    expect(reflectionSteps({ ...defaults, retries: '3' })).toHaveLength(1);
  });
});
