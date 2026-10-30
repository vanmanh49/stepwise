import type { Dataset } from '../../sql/datasets';
import type { SqlValue } from '../../sql/values';
import { runScript, type ScriptResult } from '../../sql/script';
import { ORDERS } from './data';

type Row = Record<string, SqlValue>;

export type ShopDb = {
  rows(table: string): Row[];
  run(sql: string): boolean;
  query(sql: string): Row[];
  /** Runs every statement, and keeps their writes even if a later one fails. */
  execute(sql: string): { ok: boolean; rows: Row[]; error?: string };
};

/** The interpreter has no bound parameters, so values are quoted. */
export const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export function sql(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((text, part, i) => {
    const value = values[i - 1]!;
    return `${text}${typeof value === 'string' ? quote(value) : value}${part}`;
  });
}

/** The rows of the last statement that returned any. */
function rowsOf(result: ScriptResult): Row[] {
  const rows = result.statements.findLast((statement) => statement.result)?.result;
  return rows ? rows.rows.map((row) => Object.fromEntries(row.map((value, i) => [rows.columns[i]!, value]))) : [];
}

const text = (name: string) => ({ name, type: 'TEXT' as const });

export function createDb(users: { name: string; role: string; hash: string; salt: string }[]): ShopDb {
  let data: Dataset = {
    // Never registered, so this id is only a label.
    id: 'shop',
    title: 'Shop accounts',
    tables: [
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }, text('name'), text('role'), text('hash'), text('salt')],
        rows: users.map((user, i) => [i + 1, user.name, user.role, user.hash, user.salt]),
      },
      { name: 'sessions', columns: [{ ...text('id'), primaryKey: true }, text('name'), text('level')], rows: [] },
      {
        name: 'orders',
        columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }, text('owner'), text('item'), { name: 'total', type: 'INTEGER' }],
        rows: ORDERS.map((order) => [order.id, order.owner, order.item, order.total]),
      },
    ],
  };

  const query = (statement: string): Row[] => {
    const result = runScript(data, statement);
    return result.ok ? rowsOf(result) : [];
  };

  return {
    rows: (table) => query(`SELECT * FROM ${table}`),
    run: (statement) => {
      const result = runScript(data, statement);
      if (result.ok) data = result.db;
      return result.ok;
    },
    query,
    execute: (statement) => {
      const result = runScript(data, statement);
      data = result.db;
      return result.ok ? { ok: true, rows: rowsOf(result) } : { ok: false, rows: [], error: result.error.message };
    },
  };
}
