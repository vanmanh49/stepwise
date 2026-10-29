import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GraphView, Role, Step } from '../../types/visualization';
import { runAgent, type AgentRun } from '../agents/loop';
import { INITIAL_OFFICE } from '../agents/office';
import { SUBTASKS, taskById } from '../agents/tasks';
import { runTeam, TEAM_TASKS } from '../agents/team';
import { eventSteps, officeGrid, STAND_IN, taskIntro } from '../agents/view';
import { EMPTY } from '../steps';

export const multiAgentCode = `if (setup === 'single') return runAgent(task, allTools)   // one agent, one growing context
// team: an orchestrator splits the task and hands out short briefs
research = runAgent(researchBrief, [get_weather, search_docs])
write = runAgent(writeBrief, [read_note, write_note, send_email])
return orchestrator.combine(research.answer, write.answer)`;

export { TEAM_TASKS };
export const SETUPS = ['single', 'team'];

const line = (snippet: string) => lineOf(multiAgentCode, snippet);

type Edge = 'research' | 'write';

/** Orchestrator above, researcher and writer below; `active` edges carry a message right now. */
function teamGraph(active: Edge | undefined, messages: Record<Edge, number>, done: Edge[] = []): GraphView {
  const role = (e: Edge): Role => (active === e ? 'active' : done.includes(e) ? 'found' : 'default');
  return {
    kind: 'graph',
    directed: true,
    nodes: [
      { id: 'lead', label: 'O', badge: 'orchestrator', x: 50, y: 0, role: active ? 'active' : 'default' },
      { id: 'research', label: 'R', badge: 'researcher', x: 15, y: 100, role: role('research') },
      { id: 'write', label: 'W', badge: 'writer', x: 85, y: 100, role: role('write') },
    ],
    edges: (['research', 'write'] as const).map((e) => ({ from: 'lead', to: e, label: `${messages[e]} msg`, role: role(e) })),
  };
}

/** A sub-agent's steps, without its intro, titled with its name. */
function subSteps(name: string, run: AgentRun, codeLine: number): Step[] {
  const intro: Step = { title: '', why: '', codeLine, view: { kind: 'array', cells: [] } };
  return eventSteps(run, () => codeLine, intro).slice(1).map((s) => ({ ...s, title: `${name}: ${s.title}` }));
}

export function multiAgentSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this setup", why, EMPTY);
  const id = readChoice(values, 'task', 'Task', TEAM_TASKS);
  if (!id.ok) return fail(id.why);
  const setup = readChoice(values, 'setup', 'Setup', SETUPS);
  if (!setup.ok) return fail(setup.why);

  const task = taskById(id.value)!;
  if (setup.value === 'single') {
    const run = runAgent(task, INITIAL_OFFICE, { maxSteps: 12 });
    const intro = taskIntro(task.text, INITIAL_OFFICE, line("if (setup === 'single')"), 'One agent with every tool does the whole task, and its context grows with every observation.');
    const steps = eventSteps(run, () => line("if (setup === 'single')"), intro);
    const last = steps.at(-1)!;
    return [
      ...steps,
      {
        ...last,
        title: `One agent: ${run.modelCalls} model calls; its context grew to ${run.maxContext} words`,
        why: 'Every observation stays in the one context, so the last model call reads everything that happened.',
        next: 'Switch the setup to team to split the same task.',
        variables: { 'model calls': run.modelCalls, 'largest context': run.maxContext },
      },
    ];
  }

  const team = runTeam(task, INITIAL_OFFICE);
  const [researchId, writeId] = id.value === 'weather-compare' ? ['research-weather', 'write-weather'] : ['research-dog', 'write-dog'];
  const brief = (sub: string) => SUBTASKS[sub]!.text;
  const graphStep = (title: string, why: string, codeLine: number, active: Edge | undefined, messages: Record<Edge, number>, done: Edge[]): Step => ({
    title, why, codeLine, view: teamGraph(active, messages, done),
  });
  const intro = taskIntro(task.text, INITIAL_OFFICE, line('// team'), 'An orchestrator splits the task between a researcher and a writer. Each gets a short brief and only the tools it needs.');
  return [
    { ...intro, view: teamGraph(undefined, { research: 0, write: 0 }) },
    graphStep(`Orchestrator → researcher: "${brief(researchId)}"`, `The researcher sees only this brief, not the whole task. ${STAND_IN}`, line('research = runAgent'), 'research', { research: 1, write: 0 }, []),
    ...subSteps('Researcher', team.researcher, line('research = runAgent')),
    graphStep(`Researcher → orchestrator: "${team.researcher.answer}"`, 'Only the short result goes back, not the researcher\'s whole trace.', line('research = runAgent'), 'research', { research: 2, write: 0 }, []),
    graphStep(`Orchestrator → writer: "${brief(writeId)}"`, 'The writer gets the finding in its brief, with its own small set of tools.', line('write = runAgent'), 'write', { research: 2, write: 1 }, ['research']),
    ...subSteps('Writer', team.writer, line('write = runAgent')),
    {
      title: `Team: ${team.modelCalls} model calls; the largest context was ${team.maxContext} words`,
      why: `The orchestrator's ${team.orchestratorCalls} calls plus each agent's own calls add up to more than one agent needs. In return, no single context holds everything, so each stays small and focused.`,
      next: 'Agents need a standard way to find and call tools. The MCP lesson shows one.',
      codeLine: line('return orchestrator.combine'),
      variables: { 'model calls': team.modelCalls, 'largest context': team.maxContext, answer: team.answer },
      view: { kind: 'panels', panels: [{ label: 'Team', view: teamGraph(undefined, { research: 2, write: 2 }, ['research', 'write']) }, { label: 'Office', view: officeGrid(team.office, INITIAL_OFFICE) }] },
    },
  ];
}
