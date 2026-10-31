import { describe, expect, it } from 'vitest';
import { arpSteps, CACHE_OPTIONS } from './arp';
import type { PanelsView, Step } from '../../types/visualization';

const [EMPTY_CACHE, CACHED] = CACHE_OPTIONS;
const run = (target: string, cache = EMPTY_CACHE!) => arpSteps({ target, cache });
const titles = (steps: Step[]) => steps.map((step) => step.title);
const arpFrames = (steps: Step[]) => steps.filter((step) => step.title.startsWith('Who has') || step.title.includes(' is at '));

describe('ARP', () => {
  it('broadcasts one request, gets one reply, then sends the waiting packet', () => {
    const steps = run('10.0.0.2');
    const list = titles(steps);
    expect(arpFrames(steps)).toHaveLength(2);
    expect(list.findIndex((title) => title.startsWith('Who has'))).toBeLessThan(list.findIndex((title) => title.includes(' is at ')));
    expect(list.findIndex((title) => title.includes(' is at '))).toBeLessThan(list.findIndex((title) => title.includes('leaves')));
  });

  it('sends no ARP frame on a cache hit', () => {
    const steps = run('10.0.0.2', CACHED);
    expect(arpFrames(steps)).toHaveLength(0);
    expect(titles(steps).join()).toContain('already has');
  });

  it('fails after 1000 ms when nobody answers', () => {
    const last = run('10.0.0.9').at(-1)!;
    expect(last.title).toContain('Nobody answered');
    expect(last.variables?.time).toBe('1 s');
  });

  it('shows the cache filling in', () => {
    const last = run('10.0.0.2').at(-1)!;
    expect((last.view as PanelsView).panels.some((panel) => panel.view.kind === 'grid')).toBe(true);
  });

  it('refuses an unknown target', () => {
    expect(run('8.8.8.8')).toHaveLength(1);
  });
});
