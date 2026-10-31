import { describe, expect, it } from 'vitest';
import { natSteps, SCENES } from './nat';
import type { GridView, PanelsView, Step } from '../../types/visualization';

const [ONE, SAME, UNSOLICITED, EXPIRED] = SCENES;
const run = (scene: string, overrides: Record<string, string> = {}) => natSteps({ scene, port: '5000', timeout: '30', ...overrides });
const titles = (steps: Step[]) => steps.map((step) => step.title);
const packet = (step: Step) => {
  const view = (step.view as PanelsView).panels.find((panel) => panel.label === 'Packet')?.view as GridView | undefined;
  return Object.fromEntries((view?.rows ?? []).map((row) => [row.label, row.cells[0]!.value]));
};

describe('NAT lesson', () => {
  it('rewrites the source going out', () => {
    const hop = run(ONE!).find((step) => step.title.startsWith('Router forwards'))!;
    expect(packet(hop)['Source IP']).toBe('198.51.100.1');
  });

  it('restores the inside address on the reply', () => {
    const last = run(ONE!).at(-1)!;
    expect(last.title).toContain('A got "hi" on port 5000');
    expect(titles(run(ONE!)).join()).toContain('belongs to 192.168.1.10:5000');
  });

  it('gives host B port 40000 on a clash', () => {
    expect(titles(run(SAME!)).join()).toContain('192.168.1.11:5000 gets public port 40000');
  });

  it('keeps host B\'s port when there is no clash', () => {
    expect(titles(run(SAME!, { port: '6000' })).join()).toContain('192.168.1.11:6000 goes out as 198.51.100.1:6000');
  });

  it('drops unsolicited inbound traffic', () => {
    expect(run(UNSOLICITED!).at(-1)!.title).toContain('dropped');
  });

  it('drops a reply after the mapping expires', () => {
    expect(run(EXPIRED!, { timeout: '1' }).at(-1)!.title).toContain('dropped');
  });

  it('never shows a private address past the router', () => {
    const outside = run(ONE!).filter((step) => step.variables?.device === 'Internet');
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.map((step) => JSON.stringify(packet(step))).join()).not.toContain('192.168');
  });

  it('refuses a port out of range', () => {
    expect(run(ONE!, { port: '80' })).toHaveLength(1);
  });
});
