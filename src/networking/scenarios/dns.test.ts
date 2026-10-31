import { describe, expect, it } from 'vitest';
import type { PanelsView, LadderView, Step } from '../../types/visualization';
import { dnsSteps } from './dns';

const run = (scene: string, name = 'www.example.com') => dnsSteps({ scene, name });
const titles = (steps: Step[]) => steps.map((step) => step.title);
const ladder = (step: Step) => (step.view as PanelsView).panels.find((panel) => panel.label === 'Ladder')!.view as LadderView;

describe('DNS', () => {
  it('makes 3 stops on a cold lookup', () => {
    const steps = run('Cold lookup');
    expect(steps.filter((step) => step.title.includes('refers it')).length).toBe(2);
    expect(steps.at(-1)!.title).toContain('192.0.2.10');
    expect(ladder(steps.at(-2)!).rows.map(({ label }) => label)).toEqual(expect.arrayContaining(['DNS www.example.com', 'DNS referral', 'DNS answer']));
  });

  it('sends nothing past the resolver the second time', () => {
    const steps = run('Cached');
    const cachedAt = steps.findIndex((step) => step.title.includes('already knows'));
    expect(cachedAt).toBeGreaterThan(0);
    expect(titles(steps.slice(cachedAt)).filter((title) => title.startsWith('Resolver asks'))).toEqual([]);
    expect(steps.at(-1)!.why).toContain('0');
  });

  it('asks twice for a name that failed, and says so', () => {
    const steps = run('Cached', 'nothing.example.com');
    expect(steps.filter((step) => step.title.includes('passes on NXDOMAIN'))).toHaveLength(2);
    expect(steps.at(-1)!.why).toContain("aren't cached here");
  });

  it('ends a missing name in NXDOMAIN', () => {
    const steps = run('No such name', 'nothing.example.com');
    expect(titles(steps)).toContain("Authoritative says nothing.example.com doesn't exist");
    expect(steps.at(-1)!.title).toContain('NXDOMAIN');
  });

  it('tells the truth when No such name gets a name that exists', () => {
    expect(run('No such name').at(-1)!.title).toContain('192.0.2.10');
  });

  it('resends a lost query after 1000 ms', () => {
    const steps = run('Lost query');
    const retry = steps.find((step) => step.title.includes('asks again'))!;
    expect(retry.variables!.time).toBe('1 s');
    expect(steps.at(-1)!.title).toContain('192.0.2.10');
  });

  it('refuses a bad choice', () => {
    expect(dnsSteps({ scene: 'x', name: 'www.example.com' })).toHaveLength(1);
    expect(dnsSteps({ scene: 'Cached', name: 'x' })).toHaveLength(1);
  });
});
