export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';

export interface ColumnDef {
  name: string;
  type: ColumnType;
  primaryKey?: boolean;
  notNull?: boolean;
  unique?: boolean;
  /** A literal. */
  default?: number | string | null;
  /** SQL expression over this row's columns. */
  check?: string;
  references?: { table: string; column: string };
}

/** A table's columns and constraints, shared by the sample datasets and CREATE TABLE. */
export interface TableSchema {
  name: string;
  columns: ColumnDef[];
  /** Table-level, possibly composite. */
  primaryKey?: string[];
  unique?: string[][];
  checks?: string[];
  foreignKeys?: { columns: string[]; table: string; refColumns: string[] }[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The column SQLite treats as the rowid: a single INTEGER PRIMARY KEY. It gets the next
 * id automatically when a row leaves it out.
 */
export function isRowidAlias(table: TableSchema): string | undefined {
  const keys = table.primaryKey ?? table.columns.filter((c) => c.primaryKey).map((c) => c.name);
  if (keys.length !== 1) return undefined;
  const column = table.columns.find((c) => same(c.name, keys[0]!));
  return column?.type === 'INTEGER' ? column.name : undefined;
}

export function formatLiteral(value: number | string | null): string {
  if (value === null) return 'NULL';
  return typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

function singleForeignKey(table: TableSchema, column: ColumnDef): { table: string; column: string } | undefined {
  if (column.references) return column.references;
  const fk = table.foreignKeys?.find((f) => f.columns.length === 1 && same(f.columns[0]!, column.name));
  return fk && { table: fk.table, column: fk.refColumns[0]! };
}

/** One short badge per column, such as "PK", "NOT NULL" or "→ customers.id"; empty when the column has none. */
export function columnNotes(table: TableSchema): string[] {
  return table.columns.map((c) => {
    const ref = singleForeignKey(table, c);
    const notes = [
      c.primaryKey || table.primaryKey?.some((k) => same(k, c.name)) ? 'PK' : '',
      c.notNull ? 'NOT NULL' : '',
      c.unique ? 'UNIQUE' : '',
      c.default !== undefined ? `DEFAULT ${formatLiteral(c.default)}` : '',
      c.check ? 'CHECK' : '',
      ref ? `→ ${ref.table}.${ref.column}` : '',
    ];
    return notes.filter(Boolean).join(' ');
  });
}

/** CREATE TABLE text that SQLite accepts, column constraints inline and table constraints last. */
export function createTableSql(table: TableSchema): string {
  const columns = table.columns.map((c) =>
    [
      `${c.name} ${c.type}`,
      c.primaryKey ? 'PRIMARY KEY' : '',
      c.notNull ? 'NOT NULL' : '',
      c.unique ? 'UNIQUE' : '',
      c.default !== undefined ? `DEFAULT ${formatLiteral(c.default)}` : '',
      c.check ? `CHECK (${c.check})` : '',
      c.references ? `REFERENCES ${c.references.table}(${c.references.column})` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const constraints = [
    ...(table.primaryKey ? [`PRIMARY KEY (${table.primaryKey.join(', ')})`] : []),
    ...(table.unique ?? []).map((u) => `UNIQUE (${u.join(', ')})`),
    ...(table.checks ?? []).map((c) => `CHECK (${c})`),
    ...(table.foreignKeys ?? []).map((f) => `FOREIGN KEY (${f.columns.join(', ')}) REFERENCES ${f.table}(${f.refColumns.join(', ')})`),
  ];
  return `CREATE TABLE ${table.name} (${[...columns, ...constraints].join(', ')})`;
}
