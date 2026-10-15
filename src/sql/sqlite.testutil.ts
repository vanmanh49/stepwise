// Test-only: loads a dataset into real SQLite (sql.js) to check the interpreter against it.
import initSqlJs from 'sql.js';
import type { Dataset } from './datasets';

type Cell = number | string | null;

export async function openSqlite(dataset: Dataset) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  for (const table of dataset.tables) {
    db.run(`CREATE TABLE ${table.name} (${table.columns.map((c) => `${c.name} ${c.type}`).join(', ')})`);
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
    close() {
      db.close();
    },
  };
}
