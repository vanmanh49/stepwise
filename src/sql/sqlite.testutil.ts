// Test-only: loads a dataset into real SQLite (sql.js) to check the interpreter against it.
import initSqlJs from 'sql.js';
import type { Dataset } from './datasets';
import { createTableSql } from './schema';

type Cell = number | string | null;

export async function openSqlite(dataset: Dataset) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  // The interpreter enforces foreign keys, which SQLite only does when asked.
  db.run('PRAGMA foreign_keys = ON');
  for (const table of dataset.tables) {
    db.run(createTableSql(table));
    const insert = db.prepare(`INSERT INTO ${table.name} VALUES (${table.columns.map(() => '?').join(', ')})`);
    for (const row of table.rows) insert.run(row);
    insert.free();
  }
  return {
    query(sql: string): { columns: string[]; rows: Cell[][] } {
      const [result] = db.exec(sql);
      if (result) return { columns: result.columns, rows: result.values as Cell[][] };
      // exec returns nothing for an empty result, so read the column names from a prepared statement.
      const statement = db.prepare(sql);
      const columns = statement.getColumnNames();
      statement.free();
      return { columns, rows: [] };
    },
    /**
     * Runs a script one statement at a time, like the interpreter, and stops at the first error.
     * Returns each statement's rows (empty for writes) and the failing statement's index and message.
     */
    run(script: string): { results: Cell[][][]; failedIndex?: number; error?: string } {
      const results: Cell[][][] = [];
      const statements = db.iterateStatements(script);
      // Preparing a statement can fail too (an unknown table or column), so each step of the iterator is guarded.
      for (let index = 0; ; index++) {
        let statement;
        try {
          const next = statements.next();
          if (next.done) break;
          statement = next.value;
          const rows: Cell[][] = [];
          while (statement.step()) rows.push(statement.get() as Cell[]);
          results.push(rows);
        } catch (error) {
          statement?.free();
          return { results, failedIndex: index, error: (error as Error).message };
        }
      }
      return { results };
    },
    /** Every table's rows. */
    tables(): Record<string, Cell[][]> {
      const names = (db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((r) => String(r[0]));
      return Object.fromEntries(names.map((name) => [name, (db.exec(`SELECT * FROM ${name}`)[0]?.values ?? []) as Cell[][]]));
    },
    close() {
      db.close();
    },
  };
}
