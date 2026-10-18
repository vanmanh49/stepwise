import type { Expr } from './ast';
import { findTable, type Dataset, type DatasetTable } from './datasets';
import { ConstraintError, SqlError, type ConstraintInfo } from './errors';
import { evaluateTruth } from './evaluate';
import { cellValue } from './execute';
import { parseExpression } from './parse';
import { formatLiteral } from './schema';
import { applyAffinity, valueKey } from './values';

type Stored = number | string | null;

const parsedChecks = new Map<string, Expr>();

function checkExpr(text: string): Expr {
  let expr = parsedChecks.get(text);
  if (!expr) {
    expr = parseExpression(text);
    parsedChecks.set(text, expr);
  }
  return expr;
}

const index = (table: DatasetTable, name: string) => table.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
const keyOf = (values: Stored[]) => values.map(valueKey).join('|');
const show = (values: Stored[]) => (values.length === 1 ? formatLiteral(values[0]!) : `(${values.map(formatLiteral).join(', ')})`);
const showColumns = (table: string, columns: string[]) => (columns.length === 1 ? `${table}.${columns[0]}` : `${table}.(${columns.join(', ')})`);

/** The keys whose values must not repeat: the primary key and every UNIQUE constraint. */
function keys(table: DatasetTable): { rule: 'PRIMARY KEY' | 'UNIQUE'; columns: string[] }[] {
  const primary = table.primaryKey ?? table.columns.filter((c) => c.primaryKey).map((c) => c.name);
  return [
    ...(primary.length > 0 ? [{ rule: 'PRIMARY KEY' as const, columns: primary }] : []),
    ...table.columns.filter((c) => c.unique).map((c) => ({ rule: 'UNIQUE' as const, columns: [c.name] })),
    ...(table.unique ?? []).map((columns) => ({ rule: 'UNIQUE' as const, columns })),
  ];
}

/**
 * Checks one written row the way SQLite does as it writes: NOT NULL, then CHECK, then the
 * primary key and UNIQUE constraints. Throws a ConstraintError for the first rule broken.
 */
export function checkRow(db: Dataset, table: DatasetTable, rowIndex: number, line: number): void {
  const values = table.rows[rowIndex]!;
  const rowId = table.rowIds![rowIndex]!;
  const fail = (message: string, constraint: ConstraintInfo, clashWith?: { table: string; rowId: string }) => {
    throw new ConstraintError(message, constraint, rowId, line, 1, clashWith);
  };

  table.columns.forEach((c, i) => {
    if (c.notNull && values[i] === null) {
      fail(`NOT NULL failed: ${table.name}.${c.name} can't be NULL (row ${rowIndex + 1}).`, { rule: 'NOT NULL', table: table.name, column: c.name });
    }
  });

  const checks = [
    ...table.columns.flatMap((c) => (c.check ? [{ text: c.check, column: c.name }] : [])),
    ...(table.checks ?? []).map((text) => ({ text, column: undefined })),
  ];
  if (checks.length > 0) {
    const scope = {
      columns: table.columns.map((c) => ({ table: table.name, name: c.name, type: c.type })),
      row: { id: rowId, values: values.map((v, i) => cellValue(v, table.columns[i]!.type)) },
      db,
      ctx: { cache: new Map(), work: 0 },
    };
    for (const check of checks) {
      if (evaluateTruth(checkExpr(check.text), scope) === false) {
        fail(`CHECK failed: ${check.text} is false for this row.`, {
          rule: 'CHECK',
          table: table.name,
          ...(check.column && { column: check.column }),
        });
      }
    }
  }

  // A UNIQUE index made with CREATE UNIQUE INDEX works like a UNIQUE constraint.
  const uniqueIndexes = (db.indexes ?? []).filter((i) => i.unique && i.table.toLowerCase() === table.name.toLowerCase());
  for (const key of [...keys(table), ...uniqueIndexes.map((i) => ({ rule: 'UNIQUE' as const, columns: i.columns }))]) {
    const columns = key.columns.map((name) => index(table, name));
    const mine = columns.map((i) => values[i]!);
    if (mine.some((v) => v === null)) continue; // NULLs never clash
    const clash = table.rows.findIndex((other, j) => j !== rowIndex && keyOf(columns.map((i) => other[i]!)) === keyOf(mine));
    if (clash >= 0) {
      fail(
        `${key.rule} failed: ${showColumns(table.name, key.columns)} already has ${show(mine)} (row ${clash + 1}).`,
        { rule: key.rule, table: table.name, ...(key.columns.length === 1 && { column: key.columns[0] }) },
        { table: table.name, rowId: table.rowIds![clash]! },
      );
    }
  }
}

interface ForeignKey {
  columns: string[];
  table: string;
  refColumns: string[];
}

function foreignKeys(table: DatasetTable): ForeignKey[] {
  return [
    ...table.columns.flatMap((c) => (c.references ? [{ columns: [c.name], table: c.references.table, refColumns: [c.references.column] }] : [])),
    ...(table.foreignKeys ?? []),
  ];
}

const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && a.every((name) => b.some((other) => other.toLowerCase() === name.toLowerCase()));

/** Whether `columns` are the table's primary key or one of its UNIQUE keys, which a foreign key must refer to. */
function isKey(table: DatasetTable, columns: string[]): boolean {
  return keys(table).some((key) => sameNames(key.columns, columns));
}

/**
 * Checks every foreign key at the end of a statement, as SQLite does for immediate constraints.
 * `before` is the database before the statement, to tell a new child row without a parent
 * from a parent row that was removed or changed while children still refer to it.
 */
export function checkForeignKeys(db: Dataset, before: DatasetTable[], line: number): void {
  for (const child of db.tables) {
    for (const fk of foreignKeys(child)) {
      const childColumns = fk.columns.map((name) => index(child, name));
      const parent = findTable(db, fk.table);
      const parentColumns = parent ? fk.refColumns.map((name) => index(parent, name)) : [];
      const hasValues = child.rows.some((row) => childColumns.every((i) => row[i] !== null));
      if (parent && hasValues && (parentColumns.includes(-1) || !isKey(parent, fk.refColumns))) {
        throw new SqlError(
          `Foreign key mismatch: ${showColumns(child.name, fk.columns)} refers to ${showColumns(parent.name, fk.refColumns)}, which is not a PRIMARY KEY or UNIQUE column.`,
          'name',
          line,
          1,
        );
      }
      const parentKeys = new Set(
        parent ? parent.rows.map((row) => keyOf(parentColumns.map((i) => row[i]!))) : [],
      );
      child.rows.forEach((row, r) => {
        const values = childColumns.map((i) => row[i]!);
        if (values.some((v) => v === null)) return;
        // The child value is compared using the parent column's type, as SQLite does.
        const wanted = keyOf(values.map((v, k) => (parent ? applyAffinity(v, parent.columns[parentColumns[k]!]!.type) : v)));
        if (parentKeys.has(wanted)) return;
        const constraint: ConstraintInfo = { rule: 'FOREIGN KEY', table: child.name, ...(fk.columns.length === 1 && { column: fk.columns[0] }) };
        const rowId = child.rowIds![r]!;
        if (!parent) {
          throw new ConstraintError(
            `FOREIGN KEY failed: ${showColumns(child.name, fk.columns)} refers to table \`${fk.table}\`, which doesn't exist.`,
            constraint,
            rowId,
            line,
            1,
          );
        }
        const oldParent = before.find((t) => t.name.toLowerCase() === fk.table.toLowerCase());
        const oldIndex = oldParent?.rows.findIndex((p) => keyOf(parentColumns.map((i) => p[i]!)) === wanted) ?? -1;
        const oldChild = before.find((t) => t.name === child.name);
        const childUnchanged = oldChild?.rowIds?.includes(rowId) && keyOf(oldChild.rows[oldChild.rowIds.indexOf(rowId)]!) === keyOf(row);
        if (childUnchanged && oldParent && oldIndex >= 0) {
          throw new ConstraintError(
            `FOREIGN KEY failed: ${parent.name} row ${oldIndex + 1} still has rows in ${child.name} that refer to it.`,
            constraint,
            rowId,
            line,
            1,
            { table: parent.name, rowId: oldParent.rowIds?.[oldIndex] ?? `${parent.name}#${oldIndex}` },
          );
        }
        throw new ConstraintError(
          `FOREIGN KEY failed: ${showColumns(child.name, fk.columns)} ${show(values)} has no matching ${showColumns(parent.name, fk.refColumns)}.`,
          constraint,
          rowId,
          line,
          1,
        );
      });
    }
  }
}
