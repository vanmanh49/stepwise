import type { Dataset } from '../../sql/datasets';
import type { SqlValue } from '../../sql/values';
import { runScript } from '../../sql/script';
import { ORDERS } from './data';

type Row = Record<string, SqlValue>;

export type ShopDb = {
  rows(table: string): Row[];
  run(sql: string): boolean;
  query(sql: string): Row[];
};

/** The interpreter has no bound parameters, so values are quoted. */
export const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export function sql(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((text, part, i) => {
    const value = values[i - 1]!;
    return `${text}${typeof value === 'string' ? quote(value) : value}${part}`;
  });
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
    const rows = result.ok ? result.statements.at(-1)?.result : undefined;
    return rows ? rows.rows.map((row) => Object.fromEntries(row.map((value, i) => [rows.columns[i]!, value]))) : [];
  };

  return {
    rows: (table) => query(`SELECT * FROM ${table}`),
    run: (statement) => {
      const result = runScript(data, statement);
      if (result.ok) data = result.db;
      return result.ok;
    },
    query,
  };
}
