import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { agentMemorySteps } from './agent-memory';

const emailTo = (memory: string) => {
  const last = agentMemorySteps({ memory }).at(-1)!;
  const office = (last.view as PanelsView).panels[1]!.view as GridView;
  return office.rows.find((r) => r.label === 'to sam@office.test')!.cells[0]!.value;
};

describe('agent memory lesson', () => {
  it('opens with the earlier session', () => {
    const intro = agentMemorySteps({ memory: 'none' })[0]!;
    const session = (intro.view as PanelsView).panels[0]!.view as GridView;
    expect(session.rows[0]).toMatchObject({ label: 'user', cells: [{ value: 'Sam likes temperatures in °C, remember that.' }] });
  });

  it('forgets °C with no memory, and with chat memory cut to its budget', () => {
    expect(emailTo('none')).toBe('It is 88°F and rainy in Hanoi.');
    expect(emailTo('chat')).toBe('It is 88°F and rainy in Hanoi.');
  });

  it('remembers °C through the notes', () => {
    expect(emailTo('notes')).toBe('It is 31°C and rainy in Hanoi.');
  });

  it('refuses an unknown memory with one step', () => {
    expect(agentMemorySteps({ memory: 'brain' })).toHaveLength(1);
  });
});
