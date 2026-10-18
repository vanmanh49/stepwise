import { describe, expect, it } from 'vitest';
import type { SqlTable, Step, TableView } from '../types/visualization';
import { datasets, findTable } from './datasets';
import { runScript } from './script';
import { scriptSteps, scriptViewAt } from './scriptSteps';
import { querySteps } from './steps';
import { toPlain } from './values';

const shop = datasets.shop;

function steps(sql: string, db = shop): Step[] {
  const result = scriptSteps(db, sql);
  if (!result.ok) throw new Error(result.error.message);
  return result.steps;
}

const view = (step: Step) => step.view as TableView;
const tableIn = (step: Step, label: string): SqlTable => {
  const table = view(step).tables.find((t) => t.label === label);
  if (!table) throw new Error(`no table ${label} in "${step.title}": ${view(step).tables.map((t) => t.label)}`);
  return table;
};

function expectWellFormed(list: Step[], sql: string) {
  const lines = sql.split('\n').length;
  expect(list.length).toBeLessThanOrEqual(400);
  for (const step of list) {
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
    expect(step.view.kind).toBe('table');
  }
}

const EXAMPLE = "INSERT INTO customers (id, name, city) VALUES (11, 'Tam', 'Hue');\nUPDATE customers SET city = 'Hanoi'\nWHERE id = 11;\nSELECT * FROM customers WHERE id = 11;";

describe('scriptSteps', () => {
  it('steps through a single SELECT exactly like querySteps', () => {
    const sql = 'SELECT name FROM customers WHERE city IS NULL';
    const ours = scriptSteps(shop, sql);
    const theirs = querySteps(shop, sql);
    expect(ours.ok && theirs.ok && ours.steps).toEqual(theirs.ok && theirs.steps);
  });

  it('opens every statement with a header step', () => {
    const list = steps(EXAMPLE);
    expectWellFormed(list, EXAMPLE);
    const headers = list.filter((s) => s.title.startsWith('Statement '));
    expect(headers.map((s) => s.title)).toEqual([
      'Statement 1 of 3: INSERT INTO customers',
      'Statement 2 of 3: UPDATE customers',
      'Statement 3 of 3: SELECT',
    ]);
    expect(headers.map((s) => s.codeLine)).toEqual([1, 2, 4]);
  });

  it('shows the inserted row and then the changed cell, following the same row id', () => {
    const list = steps(EXAMPLE);
    const inserted = list.find((s) => s.title.startsWith('Insert'))!;
    const row = tableIn(inserted, 'customers').rows.find((r) => r.note === 'inserted')!;
    expect(row.role).toBe('found');
    expect(view(inserted).clauses).toEqual(['INSERT', 'VALUES']);
    const updated = list.find((s) => view(s).current === 'SET')!;
    const changed = tableIn(updated, 'customers').rows.find((r) => r.note === 'city: Hue → Hanoi')!;
    expect(changed.id).toBe(row.id);
    expect(changed.focus).toEqual([2]);
    expect(view(updated).clauses).toEqual(['UPDATE', 'WHERE', 'SET']);
    expect(updated.codeLine).toBe(2);
  });

  it('marks deleted rows, then shows the table without them', () => {
    const list = steps('DELETE FROM order_items WHERE order_id = 3');
    const deleted = list.find((s) => tableIn(s, 'order_items').rows.some((r) => r.note === 'deleted'))!;
    expect(tableIn(deleted, 'order_items').rows.filter((r) => r.note === 'deleted').every((r) => r.role === 'discarded')).toBe(true);
    const after = list[list.indexOf(deleted) + 1]!;
    expect(tableIn(after, 'order_items').rows.some((r) => r.cells[0] === 3)).toBe(false);
  });

  it('shows a constraint failure next to the row it clashes with, then the undo', () => {
    const sql = "INSERT INTO students (name, email) VALUES ('X', 'mai@school.edu')";
    const result = scriptSteps(datasets.school, sql);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.result.ok).toBe(false);
    const failure = result.steps.find((s) => s.why.includes('UNIQUE failed'))!;
    const rows = tableIn(failure, 'students').rows;
    expect(rows.find((r) => r.role === 'discarded')?.cells[1]).toBe('X');
    expect(rows.find((r) => r.role === 'compare')?.cells[1]).toBe('Mai');
    const undo = result.steps.at(-1)!;
    expect(undo.title).toBe('The statement is undone');
    expect(tableIn(undo, 'students').rows).toHaveLength(10);
  });

  it('shows the parent row a foreign key protects', () => {
    const result = scriptSteps(shop, 'DELETE FROM customers WHERE id = 1');
    if (!result.ok) throw new Error(result.error.message);
    const failure = result.steps.find((s) => s.why.includes('FOREIGN KEY failed'))!;
    expect(view(failure).tables.some((t) => t.rows.some((r) => r.role === 'compare'))).toBe(true);
  });

  it('names the failing statement and keeps the steps before it', () => {
    const sql = "INSERT INTO customers (name) VALUES ('Tam');\nDELETE FROM order_items WHERE order_id = 3;\nSELECT nope FROM customers";
    const result = scriptSteps(shop, sql);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message.startsWith('Statement 3 of 3 failed: ')).toBe(true);
    expect(result.error.line).toBe(3);
    expect(result.steps.filter((s) => s.title.startsWith('Statement ')).length).toBe(2);
  });

  it('keeps every header and stays within 400 steps for a long script', () => {
    const sql =
      'CREATE TABLE big (id INTEGER PRIMARY KEY, n INTEGER);\n' +
      `INSERT INTO big (n) VALUES ${Array.from({ length: 45 }, (_, i) => `(${i})`).join(', ')};\n` +
      'INSERT INTO big (n) SELECT n FROM big WHERE n < 5;\n' +
      'UPDATE big SET n = n + 1 WHERE n >= 0;\n' +
      'DELETE FROM big WHERE n > 40';
    const list = steps(sql);
    expectWellFormed(list, sql);
    expect(list.filter((s) => s.title.startsWith('Statement ')).length).toBe(5);
    const final = list.at(-1)!;
    const expected = runScript(shop, sql);
    if (!expected.ok) throw new Error(expected.error.message);
    expect(tableIn(final, 'big').rows.map((r) => r.cells)).toEqual(findTable(expected.db, 'big')!.rows.map((r) => r.map(toPlain)));
  });

  it('shows constraint badges on a created table and at most three tables at the end', () => {
    const sql =
      'CREATE TABLE a (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nCREATE TABLE b (x INTEGER);\nCREATE TABLE c (x INTEGER);\nCREATE TABLE d (x INTEGER);\nINSERT INTO d VALUES (1)';
    const list = steps(sql);
    const created = list.find((s) => s.title === 'CREATE TABLE a')!;
    expect(tableIn(created, 'a').columnNotes).toEqual(['PK', 'NOT NULL']);
    expect(view(list.at(-1)!).tables.length).toBeLessThanOrEqual(3);
  });

  it('gives a quiz view at an index', () => {
    expect(scriptViewAt(shop, EXAMPLE, 0).kind).toBe('table');
    expect(() => scriptViewAt(shop, 'SELECT nope FROM customers', 0)).toThrow();
  });
});
