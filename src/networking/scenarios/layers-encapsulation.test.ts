import { describe, expect, it } from 'vitest';
import type { PanelsView, Step } from '../../types/visualization';
import { layersEncapsulationSteps } from './layers-encapsulation';

const run = (message: string, corrupt = 'No') => layersEncapsulationSteps({ message, corrupt });
const titles = (steps: Step[]) => steps.map((step) => step.title);

describe('Layers & Encapsulation', () => {
  it('wraps going down and unwraps coming up, in order', () => {
    const list = titles(run('hello')).join('\n');
    const order = ['UDP adds', 'IP adds', 'Ethernet adds', 'on the wire', 'Ethernet removes', 'IP removes', 'UDP removes', '"hello" reaches'];
    const places = order.map((text) => list.indexOf(text));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
  });

  it('shows the header as 5 rows of 4 bytes', () => {
    const shown = run('hello').find((step) => step.view.kind === 'panels' && step.view.panels.some((panel) => panel.label === 'IPv4 header'))!;
    const grid = (shown.view as PanelsView).panels.find((panel) => panel.label === 'IPv4 header')!.view;
    expect(grid.kind === 'grid' && grid.rows.map((row) => row.cells.length)).toEqual([4, 4, 4, 4, 4]);
  });

  it('ends with a checksum of 0 on a clean run', () => {
    expect(run('hello').at(-1)!.variables?.checksum).toBe(0);
  });

  it('stops at the failed check when a byte is corrupted', () => {
    const steps = run('hello', 'Yes');
    expect(steps.at(-1)!.title).toContain('checksum failed');
    expect(steps.at(-1)!.variables?.checksum).not.toBe(0);
    expect(titles(steps).join()).not.toContain('UDP removes');
  });

  it('counts the bytes each layer adds', () => {
    expect(run('hello').find((step) => step.title.includes('on the wire'))!.title).toContain('47 bytes');
  });

  it.each([['a'.repeat(33)], ['é'.repeat(17)], ['']])('refuses the message %j', (message) => {
    expect(run(message)).toHaveLength(1);
  });

  it('refuses an unknown corrupt choice', () => {
    expect(run('hello', 'maybe')).toHaveLength(1);
  });
});
