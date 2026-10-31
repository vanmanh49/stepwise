import { describe, expect, it } from 'vitest';
import { ethernetSwitchingSteps, SCENES } from './ethernet-switching';
import type { PanelsView, ServicesView, Step } from '../../types/visualization';

const [FIRST, REPLY, AGED, MOVED] = SCENES;
const run = (scene: string, overrides: Record<string, string> = {}) => ethernetSwitchingSteps({ scene, sender: 'A', receiver: 'B', aging: '300', ...overrides });

const messages = (step: Step) => ((step.view as PanelsView).panels[0]!.view as ServicesView).messages;
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));

describe('Ethernet & Switches', () => {
  it('floods the first frame to 3 ports', () => {
    expect(messages(titled(run(FIRST!), 'floods')[0]!).map((message) => message.to).toSorted()).toEqual(['B', 'C', 'D']);
  });

  it('sends the reply to one port', () => {
    const forward = titled(run(REPLY!), 'Forward to port');
    expect(messages(forward[0]!).map((message) => message.to)).toEqual(['A']);
  });

  it('floods again once the entry ages out', () => {
    const steps = run(AGED!, { aging: '1' });
    expect(titled(steps, 'aged out')).toHaveLength(1);
    expect(titled(steps, 'floods')).toHaveLength(2);
  });

  it('learns a moved host on its new port', () => {
    const steps = run(MOVED!);
    expect(titled(steps, 'on port p5')).toHaveLength(1);
    expect(titled(steps, 'Forward to port p5')).toHaveLength(1);
  });

  it('refuses the same sender and receiver', () => {
    expect(run(FIRST!, { receiver: 'A' })).toHaveLength(1);
  });

  it('refuses an aging time out of range', () => {
    expect(run(FIRST!, { aging: '0' })).toHaveLength(1);
  });
});
