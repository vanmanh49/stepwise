import { describe, expect, it } from 'vitest';
import { planningDecompositionSteps } from './planning-decomposition';

const titles = (values: Record<string, string>) => planningDecompositionSteps({ task: 'weather-compare', ...values }).map((s) => s.title);
const emailed = (t: string[]) => t.some((x) => x.startsWith('Call send_email'));

describe('planning lesson', () => {
  it('drops the email when a step is skipped without a plan', () => {
    const t = titles({ planner: 'off', quirk: 'skips-step' });
    expect(emailed(t)).toBe(false);
    expect(t).toContain('Answer: "Tokyo is warmer (24°C vs 18°C)."');
  });

  it('catches the skipped step with a plan', () => {
    const t = titles({ planner: 'on', quirk: 'skips-step' });
    expect(t).toContain('Plan: 4 steps');
    expect(t).toContain('Plan check: step 4 is not done');
    expect(emailed(t)).toBe(true);
  });

  it('ticks plan steps off as they are done', () => {
    const steps = planningDecompositionSteps({ task: 'weather-compare', planner: 'on', quirk: 'none' });
    const plan = (i: number) => {
      const view = steps[i]!.view;
      const panel = view.kind === 'panels' ? view.panels.find((p) => p.label === 'Plan') : undefined;
      return panel && panel.view.kind === 'grid' ? panel.view.rows.map((r) => r.cells[0]!.role) : [];
    };
    expect(plan(1)).toEqual(['default', 'default', 'default', 'default']);
    expect(plan(steps.length - 1)).toEqual(['found', 'found', 'found', 'found']);
  });

  it('refuses a task without a plan to make', () => {
    expect(planningDecompositionSteps({ task: 'cleanup', planner: 'on', quirk: 'none' })).toHaveLength(1);
  });
});
