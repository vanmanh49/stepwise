import { describe, expect, it } from 'vitest';
import type { CallsView, GridView } from '../../types/visualization';
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
});
