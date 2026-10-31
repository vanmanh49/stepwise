import { describe, expect, it } from 'vitest';
import { dhcpSteps, SCENES } from './dhcp';
import { MAX_STEPS } from '../steps';

const [FIRST, RENEWAL, EXHAUSTED, DOWN] = SCENES;
const run = (scene: string, overrides: Record<string, string> = {}) => dhcpSteps({ scene, lease: '60', pool: '4', ...overrides });
const titles = (scene: string, overrides?: Record<string, string>) => run(scene, overrides).map((step) => step.title);

describe('DHCP lesson', () => {
  it('runs the 4 messages from 0.0.0.0', () => {
    const list = titles(FIRST!).join('\n');
    const places = ['asks for an address', 'Offer: 10.0.0.100', 'requests 10.0.0.100', 'Ack: 10.0.0.100'].map((text) => list.indexOf(text));
    expect(places.every((place) => place >= 0)).toBe(true);
    expect(places).toEqual(places.toSorted((a, b) => a - b));
    expect(JSON.stringify(run(FIRST!)[0]!.view)).toContain('0.0.0.0');
  });

  it('ends with the laptop holding its address', () => {
    expect(run(FIRST!).at(-1)!.title).toContain('Laptop now has 10.0.0.100');
  });

  it('renews twice, keeping the address', () => {
    const list = titles(RENEWAL!);
    expect(list.filter((title) => title.includes('renews 10.0.0.100'))).toHaveLength(2);
    expect(list.at(-1)).toContain('10.0.0.100');
  });

  it('gives the phone a link-local address when the pool runs out', () => {
    const list = titles(EXHAUSTED!, { pool: '1' });
    expect(list.join()).toContain('pool is empty');
    expect(list.at(-1)).toContain('Phone gives itself 169.254.0.2');
  });

  it('gives the laptop a link-local address when the server is down', () => {
    expect(titles(DOWN!).at(-1)).toContain('Laptop gives itself 169.254.0.1');
  });

  it('still falls back at the smallest lease', () => {
    expect(titles(DOWN!, { lease: '10' }).at(-1)).toContain('gives itself 169.254.0.1');
  });

  it('stays within the step cap at the smallest lease', () => {
    expect(run(RENEWAL!, { lease: '10' }).length).toBeLessThanOrEqual(MAX_STEPS + 1);
  });

  it('refuses a lease out of range', () => {
    expect(run(FIRST!, { lease: '9' })).toHaveLength(1);
  });
});
