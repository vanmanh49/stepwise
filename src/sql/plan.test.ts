import { describe, expect, it } from 'vitest';
import { cloneDataset, datasets, type Dataset } from './datasets';
import { parseQuery } from './parse';
import { planSelect } from './plan';

function withIndexes(db: Dataset, ...indexes: [name: string, table: string, columns: string[]][]): Dataset {
  const copy = cloneDataset(db);
  copy.indexes = indexes.map(([name, table, columns]) => ({ name, table, columns, unique: false, implicit: false }));
  return copy;
}

function plan(db: Dataset, sql: string) {
  const parsed = parseQuery(sql);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return planSelect(db, parsed.statement);
}

const details = (db: Dataset, sql: string) => plan(db, sql).entries.map((e) => e.detail);
const company = withIndexes(datasets.company, ['idx_salary', 'employees', ['salary']], ['idx_dept_salary', 'employees', ['department_id', 'salary']]);

describe('planSelect', () => {
  it('gives the executor each table’s access path, keyed by label', () => {
    const { paths } = plan(company, 'SELECT e.name FROM employees e WHERE e.salary > 5000');
    const path = paths.get('e')!;
    expect(path).toMatchObject({ kind: 'search', label: 'e', table: 'employees', covering: false });
    if (path.kind !== 'search') throw new Error('search expected');
    expect(path.index.name).toBe('idx_salary');
    expect(path.low?.expr.text).toBe('5000');
    expect(path.low?.inclusive).toBe(false);
  });

  it('prefers the index matching more columns with =', () => {
    expect(details(company, 'SELECT name FROM employees WHERE department_id = 2 AND salary > 5000')).toEqual([
      'SEARCH employees USING INDEX idx_dept_salary (department_id=? AND salary>?)',
    ]);
  });

  it('collects IN values for each column', () => {
    const { paths } = plan(company, 'SELECT name FROM employees WHERE department_id IN (2, 3) AND salary > 5000');
    const path = paths.get('employees')!;
    if (path.kind !== 'search') throw new Error('search expected');
    expect(path.equal.map((values) => values.map((v) => v.text))).toEqual([['2', '3']]);
  });

  it('uses only terms whose other side is known when the table is read', () => {
    // m.id = e.manager_id is usable for m (e comes first) but not for e.
    expect(details(datasets.company, 'SELECT e.name FROM employees e JOIN employees m ON m.id = e.manager_id')).toEqual([
      'SCAN e',
      'SEARCH m USING INTEGER PRIMARY KEY (rowid=?)',
    ]);
  });

  it('ignores OR and expressions over the column', () => {
    expect(details(company, 'SELECT name FROM employees WHERE salary > 5000 OR id = 1')).toEqual(['SCAN employees']);
    expect(details(company, 'SELECT name FROM employees WHERE salary * 2 > 5000')).toEqual(['SCAN employees']);
  });
});
