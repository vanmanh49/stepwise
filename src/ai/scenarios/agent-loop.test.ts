import { describe, expect, it } from 'vitest';
import { agentLoopSteps } from './agent-loop';

const defaults = { task: 'weather-compare', maxSteps: '8', quirk: 'none' };
const titles = (values: Record<string, string>) => agentLoopSteps(values).map((s) => s.title);

describe('agent loop lesson', () => {
  it('answers the weather comparison after calling its tools', () => {
    const t = titles(defaults);
    expect(t).toContain('Answer: "Tokyo is warmer (24°C vs 18°C). I emailed Sam."');
    expect(t.filter((x) => x.startsWith('Call '))).toHaveLength(4);
  });

  it('answers wrongly without a tool call when overconfident', () => {
    const t = titles({ ...defaults, quirk: 'answers-early' });
    expect(t.some((x) => x.startsWith('Call '))).toBe(false);
    expect(t).toContain('Answer: "Yes, Paris is warmer."');
  });

  it('stops unfinished with too few steps', () => {
    expect(titles({ ...defaults, maxSteps: '1' }).at(-1)).toBe('Stop: reached 1 model call without an answer');
  });

  it('refuses 13 steps with one step', () => {
    expect(agentLoopSteps({ ...defaults, maxSteps: '13' })).toHaveLength(1);
  });
});
