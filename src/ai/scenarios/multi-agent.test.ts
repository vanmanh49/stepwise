import { describe, expect, it } from 'vitest';
import { multiAgentSteps } from './multi-agent';

const run = (task: string, setup: string) => multiAgentSteps({ task, setup });

describe.each(['weather-compare', 'rag-note'])('multi-agent lesson on %s', (task) => {
  it('draws the delegation graph for the team', () => {
    expect(run(task, 'team').some((s) => s.view.kind === 'graph')).toBe(true);
    expect(run(task, 'single').some((s) => s.view.kind === 'graph')).toBe(false);
  });

  it('ends with more model calls but a smaller largest context for the team', () => {
    const team = run(task, 'team').at(-1)!.variables!;
    const single = run(task, 'single').at(-1)!.variables!;
    expect(Number(team['model calls'])).toBeGreaterThan(Number(single['model calls']));
    expect(Number(team['largest context'])).toBeLessThan(Number(single['largest context']));
  });

  it('labels each sub-agent step with its agent', () => {
    const titles = run(task, 'team').map((s) => s.title);
    expect(titles.some((t) => t.startsWith('Researcher: Call'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Writer: Call'))).toBe(true);
  });
});

describe('multi-agent lesson input', () => {
  it('refuses a task the team cannot split with one step', () => {
    expect(run('cleanup', 'team')).toHaveLength(1);
  });
});
