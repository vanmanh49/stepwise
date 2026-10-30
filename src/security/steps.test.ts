import { describe, expect, it } from 'vitest';
import type { GridView, ServicesView } from '../types/visualization';
import { byteGrid, compareDigests, imageGrid, partiesView, stateGrid } from './steps';

const ids = (grid: GridView) => grid.rows.flatMap((r) => r.cells.map((c) => c!.id));

describe('security view builders', () => {
  it('lays bytes out in rows of 6 with stable, unique ids', () => {
    const grid = byteGrid(new Uint8Array(20), 'm');
    expect(grid.rows.map((r) => r.cells.length)).toEqual([6, 6, 6, 2]);
    expect(new Set(ids(grid)).size).toBe(20);
    expect(ids(grid)).toEqual(ids(byteGrid(new Uint8Array(20).fill(7), 'm')));
  });

  it('applies the role callback to each byte', () => {
    const grid = byteGrid(Uint8Array.of(1, 2), 'm', (i) => (i === 1 ? 'compare' : 'default'));
    expect(grid.rows[0]!.cells.map((c) => c!.role)).toEqual(['default', 'compare']);
  });

  it('fills an AES state column by column', () => {
    const grid = stateGrid(Uint8Array.from({ length: 16 }, (_, i) => i), 's');
    expect(grid.rows).toHaveLength(4);
    expect(grid.rows[1]!.cells[0]!.value).toBe('01');
    expect(grid.rows[0]!.cells[1]!.value).toBe('04');
  });

  it('counts the bits two digests differ by', () => {
    expect(compareDigests(new Uint8Array(32), new Uint8Array(32)).bits).toBe(0);
    expect(compareDigests(new Uint8Array(32), new Uint8Array(32).fill(0xff)).bits).toBe(256);
    expect(compareDigests(Uint8Array.of(0b101), Uint8Array.of(0b001)).bits).toBe(1);
  });

  it('marks only the changed bytes in a digest comparison', () => {
    const { view } = compareDigests(Uint8Array.of(1, 2), Uint8Array.of(1, 3));
    const second = view.panels[1]!.view as GridView;
    expect(second.rows[0]!.cells.map((c) => c!.role)).toEqual(['default', 'compare']);
  });

  it('draws a 6×6 image with heat', () => {
    const grid = imageGrid(Array<number>(36).fill(0.5), Array<string>(36).fill('ab'), 'i');
    expect(grid.rows).toHaveLength(6);
    expect(grid.rows[3]!.cells[5]).toMatchObject({ heat: 0.5, value: 'ab', role: 'default' });
  });

  const known = [{ party: 'Alice', values: ['secret 6'] }];

  it('joins client and server directly with no attacker', () => {
    const view = partiesView({ attacker: false, messages: [], known, columns: ['knows'], log: [] });
    const services = view.panels[0]!.view as ServicesView;
    expect(services.nodes.map((n) => n.type)).toEqual(['client', 'service']);
    expect(services.links.map((l) => `${l.from}-${l.to}`)).toEqual(['client-server']);
  });

  it('can name the parties', () => {
    const view = partiesView({ attacker: true, messages: [], known, columns: ['knows'], log: [], names: { client: 'Alice', attacker: 'Eve', server: 'Bob' } });
    expect((view.panels[0]!.view as ServicesView).nodes.map((n) => n.label)).toEqual(['Alice', 'Eve', 'Bob']);
  });

  it('routes through the attacker when there is one', () => {
    const view = partiesView({ attacker: true, messages: [{ from: 'client', to: 'attacker', label: 'A = 8', role: 'active' }], known, columns: ['knows'], log: ['sent'] });
    const services = view.panels[0]!.view as ServicesView;
    expect(services.nodes.find((n) => n.id === 'attacker')).toMatchObject({ type: 'attacker', column: 1 });
    expect(services.links.map((l) => `${l.from}-${l.to}`)).toEqual(['client-attacker', 'attacker-server']);
    expect(services.messages[0]).toMatchObject({ label: 'A = 8', progress: 0.5 });
    expect(services.requests).toEqual([]);
    const grid = view.panels[1]!.view as GridView;
    expect(grid.colLabels).toEqual(['knows']);
    expect(grid.rows[0]!.label).toBe('Alice');
  });
});
