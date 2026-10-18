import { describe, expect, it } from 'vitest';
import { matchingColumns } from './evaluate';
import type { ColumnRef } from './execute';

const columns = (...refs: string[]): ColumnRef[] =>
  refs.map((r) => {
    const [table, name] = r.includes('.') ? r.split('.') : [undefined, r];
    return { name: name!, ...(table && { table }) } as ColumnRef;
  });

/** What resolveColumn computed before: every index whose column matches the reference. */
const scan = (cols: ColumnRef[], ref: { table?: string; name: string }) =>
  cols.flatMap((c, i) =>
    c.name.toLowerCase() === ref.name.toLowerCase() && (ref.table === undefined || c.table?.toLowerCase() === ref.table.toLowerCase()) ? [i] : [],
  );

describe('matchingColumns', () => {
  const joined = columns('e.id', 'e.name', 'e.department_id', 'd.id', 'd.name', 'total');

  it('agrees with a direct scan for qualified, unqualified and differently cased names', () => {
    for (const ref of [{ name: 'id' }, { table: 'd', name: 'id' }, { table: 'E', name: 'NAME' }, { name: 'total' }, { name: 'missing' }, { table: 'x', name: 'id' }]) {
      expect(matchingColumns(joined, ref), JSON.stringify(ref)).toEqual(scan(joined, ref));
    }
  });

  it('gives the same answer when asked again', () => {
    const ref = { name: 'name' };
    expect(matchingColumns(joined, ref)).toEqual([1, 4]);
    expect(matchingColumns(joined, ref)).toEqual([1, 4]);
  });

  it('answers for each column list separately, even for the same reference', () => {
    const ref = { name: 'id' };
    const outer = columns('o.id', 'o.total');
    const inner = columns('i.order_id', 'i.qty');
    expect(matchingColumns(joined, ref)).toEqual([0, 3]);
    expect(matchingColumns(outer, ref)).toEqual([0]);
    expect(matchingColumns(inner, ref)).toEqual([]);
  });
});
