import { describe, expect, it } from 'vitest';
import { ipSubnetsSteps } from './ip-subnets';
import type { GridView, PanelsView } from '../../types/visualization';

const run = (address: string, other: string) => ipSubnetsSteps({ address, other });
const titles = (address: string, other: string) => run(address, other).map((step) => step.title).join('\n');

describe('IP Addresses & Subnets', () => {
  it('works out a /24', () => {
    const list = titles('192.168.1.10/24', '192.168.1.77');
    expect(list).toContain('Network: 192.168.1.0');
    expect(list).toContain('Broadcast: 192.168.1.255');
    expect(list).toContain('254 usable hosts');
  });

  it('works out a /20', () => {
    const list = titles('10.0.12.7/20', '10.0.15.200');
    expect(list).toContain('Network: 10.0.0.0');
    expect(list).toContain('Broadcast: 10.0.15.255');
    expect(list).toContain('4094 usable hosts');
  });

  it('gives a /31 two hosts and no broadcast', () => {
    const list = titles('10.0.0.0/31', '10.0.0.1');
    expect(list).toContain('2 usable hosts');
    expect(list).not.toContain('Broadcast: ');
  });

  it('gives a /32 one host', () => {
    expect(titles('10.0.0.5/32', '10.0.0.6')).toContain('1 usable host');
  });

  it('runs a /0', () => {
    expect(titles('8.8.8.8/0', '1.1.1.1')).toContain('Network: 0.0.0.0');
  });

  it('sends a different subnet via the gateway', () => {
    expect(run('192.168.1.10/24', '192.168.2.10').at(-1)!.title).toContain('via the gateway');
  });

  it('keeps a same-subnet address local', () => {
    expect(run('192.168.1.10/24', '192.168.1.77').at(-1)!.title).toContain('directly');
  });

  it('mentions no gateway on a /31', () => {
    expect(run('10.0.0.0/31', '10.0.0.9').at(-1)!.title).not.toContain('gateway');
  });

  it('marks the boundary between network and host bits', () => {
    const view = run('10.0.12.7/20', '10.0.12.8')[0]!.view as PanelsView;
    const bits = view.panels[0]!.view as GridView;
    expect(bits.rows.map((row) => row.cells[1]!.value)).toEqual(['00001010', '00000000', '0000|1100', '00000111']);
  });

  it('keeps every text row short enough for a phone', () => {
    for (const step of run('192.168.100.200/23', '192.168.101.1')) {
      for (const panel of (step.view as PanelsView).panels) {
        for (const row of (panel.view as GridView).rows) {
          expect(row.cells.map((cell) => cell?.value).join(' ').length).toBeLessThan(40);
        }
      }
    }
  });

  it.each([['10.0.0.1', '10.0.0.2'], ['10.0.0.1/33', '10.0.0.2'], ['10.0.0.1/24', 'nope']])('refuses %j and %j', (address, other) => {
    expect(run(address, other)).toHaveLength(1);
  });
});
