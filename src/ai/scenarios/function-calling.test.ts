import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { functionCallingSteps } from './function-calling';

const run = (request: string, tools = 'all') => functionCallingSteps({ request, tools });
const everything = (steps: Step[]) => JSON.stringify(steps);

describe('function calling lesson', () => {
  it('answers the weather in Paris from the tool result', () => {
    const steps = run('weather-paris');
    expect(steps.at(-1)!.title).toContain('18°C and cloudy');
    expect(everything(steps)).toContain('get_weather({\\"city\\":\\"Paris\\"})');
  });

  it('stops bad arguments before the tool runs', () => {
    const steps = run('add-words');
    expect(everything(steps)).toContain('b must be a number');
    expect(everything(steps)).not.toContain('42');
  });

  it('apologises for an unknown city', () => {
    expect(run('weather-mars').at(-1)!.title).toContain('Sorry');
  });

  it('never calls a tool when none is offered', () => {
    const steps = run('weather-paris', 'none');
    expect(everything(steps)).not.toContain('get_weather(');
    expect(steps.at(-1)!.title).toContain('no weather tool');
  });

  it('answers directly when no tool is needed', () => {
    expect(run('hello').at(-1)!.title).toContain('Hello!');
  });

  it('refuses an unknown request with one step', () => {
    expect(run('weather-moon')).toHaveLength(1);
  });

  it('explains each direct answer for what it is', () => {
    expect(run('add', 'none').at(-1)!.why).not.toContain('instead of guessing');
    expect(run('weather-paris', 'none').at(-1)!.why).toContain('instead of guessing');
  });
});
