import { describe, expect, it } from 'vitest';
import type { BucketsView, CallsView, GridView, PanelsView, TrieView } from '../../types/visualization';
import { rolesInRun, rolesInView } from './roles';

describe('rolesInView', () => {
  it('collects the roles of every row in a table view', () => {
    const view = {
      kind: 'table' as const,
      clauses: ['FROM'],
      tables: [
        {
          label: 't',
          columns: ['a'],
          rows: [
            { id: '1', cells: [1], role: 'found' as const },
            { id: '2', cells: [null], role: 'discarded' as const },
          ],
        },
      ],
    };
    expect(rolesInView(view)).toEqual(['found', 'discarded']);
    expect(rolesInRun([view])).toEqual(['found', 'discarded']);
  });

  it('collects roles from grid cells and skips gaps', () => {
    const view: GridView = {
      kind: 'grid',
      rows: [{ cells: [{ id: 'a', value: 1, role: 'active' }, null, { id: 'b', value: 2, role: 'sorted' }] }],
    };
    expect(rolesInView(view)).toEqual(['active', 'sorted']);
  });

  it('collects roles from trie nodes', () => {
    const view: TrieView = {
      kind: 'trie',
      nodes: [
        { id: 't:', letter: '', role: 'visited' },
        { id: 't:a', parent: 't:', letter: 'a', word: 'a', role: 'found' },
      ],
    };
    expect(rolesInView(view)).toEqual(['visited', 'found']);
  });

  it('collects roles from call frames in order', () => {
    const view: CallsView = {
      kind: 'calls',
      frames: [
        { id: 'a', label: 'f(2)', role: 'active' },
        { id: 'b', label: 'f(1)', parent: 'a', role: 'sorted', result: '1' },
      ],
    };
    expect(rolesInView(view)).toEqual(['active', 'sorted']);
  });

  it('collects roles from the input row, then the buckets', () => {
    const view: BucketsView = {
      kind: 'buckets',
      input: { label: 'in', cells: [{ id: 'a', value: 1, role: 'active' }] },
      buckets: [{ label: '0', cells: [{ id: 'b', value: 10, role: 'found' }] }, { label: '1', cells: [] }],
    };
    expect(rolesInView(view)).toEqual(['active', 'found']);
  });

  it('collects roles from every panel', () => {
    const view: PanelsView = {
      kind: 'panels',
      panels: [
        { label: 'board', view: { kind: 'grid', rows: [{ cells: [{ id: 'q', value: 'Q', role: 'found' }] }] } },
        { view: { kind: 'calls', frames: [{ id: 'f', label: 'place(0)', role: 'discarded' }, { id: 'g', label: 'x', role: 'default' }] } },
      ],
    };
    expect(rolesInView(view)).toEqual(['found', 'discarded', 'default']);
    expect(rolesInRun([view])).toEqual(['found', 'discarded']);
  });
});
