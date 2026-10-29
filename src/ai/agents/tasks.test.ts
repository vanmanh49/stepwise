import { describe, expect, it } from 'vitest';
import { INITIAL_OFFICE, runOfficeTool } from './office';
import { SUBTASKS, TASKS } from './tasks';

describe('agent tasks', () => {
  it.each(TASKS.map((t) => [t.id, t] as const))('%s: its goals succeed and meet every requirement', (_id, task) => {
    let office = INITIAL_OFFICE;
    for (const goal of task.goals) {
      const out = runOfficeTool(office, goal.call);
      expect(out.result.ok, goal.label).toBe(true);
      office = out.office;
    }
    const lastEmail = office.outbox.at(-1)?.body ?? '';
    for (const r of task.requirements) expect(r.check(office, r.stage === 'email' ? lastEmail : task.answer), r.label).toBe(true);
  });

  it('allows exactly the tools its goals use', () => {
    for (const task of TASKS) expect(task.allowedTools).toEqual([...new Set(task.goals.map((g) => g.call.name))]);
  });

  it('has the six tasks and four team subtasks', () => {
    expect(TASKS.map((t) => t.id)).toEqual(['weather-compare', 'rag-note', 'travel-summary', 'sam-weather', 'sum-and-save', 'cleanup']);
    expect(Object.keys(SUBTASKS)).toEqual(['research-weather', 'write-weather', 'research-dog', 'write-dog']);
  });
});
