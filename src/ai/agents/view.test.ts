import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { runAgent } from './loop';
import { INITIAL_OFFICE } from './office';
import { taskById, TASKS } from './tasks';
import { eventSteps } from './view';

const intro: Step = { title: 'intro', why: 'intro', codeLine: 1, view: { kind: 'array', cells: [] } };
const steps = (id: string, options = {}) => {
  const run = runAgent(taskById(id)!, INITIAL_OFFICE, { maxSteps: 12, ...options });
  return { run, steps: eventSteps(run, () => 1, intro) };
};
const officeOf = (s: Step) => (s.view as PanelsView).panels[1]!.view as GridView;

describe('agent run → steps', () => {
  it('makes one step per event except thoughts, after the intro', () => {
    const { run, steps: s } = steps('weather-compare');
    expect(s[0]).toBe(intro);
    expect(s).toHaveLength(1 + run.events.filter((e) => e.kind !== 'thought').length);
    expect(s[1]!.title).toBe('Call get_weather({"city":"Paris"})');
    expect(s[2]!.title).toBe('Observation: 18°C and cloudy');
    expect(s[1]!.why).toContain('Next I need to get the weather in Paris.');
  });

  it('stays within 200 steps for every task', () => {
    for (const task of TASKS) expect(steps(task.id).steps.length).toBeLessThanOrEqual(200);
  });

  it("marks the attacker's email in the office", () => {
    const { steps: s } = steps('travel-summary', { quirks: ['trusts-tool-output'] });
    const row = officeOf(s.at(-1)!).rows.find((r) => String(r.cells[0]?.value).includes('Pack light'));
    const eve = officeOf(s.at(-1)!).rows.find((r) => r.label === 'to eve@evil.test');
    expect(row).toBeDefined();
    expect(eve!.cells[0]!.role).toBe('discarded');
  });

  it('ends a cut-off run with a Stop step', () => {
    const { steps: s } = steps('weather-compare', { maxSteps: 1 });
    expect(s.at(-1)!.title).toBe('Stop: reached 1 model call without an answer');
  });
});
