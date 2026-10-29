import { describe, expect, it } from 'vitest';
import { runAgent } from './loop';
import { INITIAL_OFFICE } from './office';
import { taskById } from './tasks';
import { runTeam, TEAM_TASKS } from './team';

describe.each(TEAM_TASKS)('team on %s', (id) => {
  const task = taskById(id)!;
  const team = runTeam(task, INITIAL_OFFICE);
  const single = runAgent(task, INITIAL_OFFICE, { maxSteps: 12 });

  it('ends with the same office and answer as a single agent', () => {
    expect(team.office).toEqual(single.offices.at(-1));
    expect(team.answer).toBe(single.answer);
  });

  it('makes more model calls, but each context stays smaller', () => {
    expect(team.modelCalls).toBe(team.orchestratorCalls + team.researcher.modelCalls + team.writer.modelCalls);
    expect(team.modelCalls).toBeGreaterThan(single.modelCalls);
    expect(team.maxContext).toBeLessThan(single.maxContext);
  });

  it('gives the researcher and the writer only their own tools', () => {
    const tools = (r: typeof team.researcher) => r.events.flatMap((e) => (e.kind === 'action' ? [e.call.name] : []));
    expect(tools(team.researcher).every((n) => n === 'get_weather' || n === 'search_docs')).toBe(true);
    expect(tools(team.writer).every((n) => ['read_note', 'write_note', 'send_email'].includes(n))).toBe(true);
  });
});
