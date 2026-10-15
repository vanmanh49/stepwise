import { describe, expect, it } from 'vitest';
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
});
