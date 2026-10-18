import { company } from './company';
import { school } from './school';
import { shop } from './shop';

import type { SelectStatement } from '../ast';
import { implicitIndexes, type IndexDef, type TableSchema } from '../schema';

export type { ColumnType, IndexDef } from '../schema';

export interface DatasetTable extends TableSchema {
  rows: (number | string | null)[][];
  /** Stable ids parallel to rows; absent on the static datasets, where a scan falls back to `${name}#${i}`. */
  rowIds?: string[];
}

export type DatasetId = 'shop' | 'school' | 'company';

/** A read-only sample database. Tables hold at most 20 rows. */
export interface Dataset {
  id: DatasetId;
  title: string;
  tables: DatasetTable[];
  /** Indexes made with CREATE INDEX; implicit ones come from the table schemas (see indexesOf). */
  indexes?: IndexDef[];
  views?: ViewDef[];
}

/** A stored SELECT, read like a table. */
export interface ViewDef {
  name: string;
  columns?: string[];
  sql: string;
  query: SelectStatement;
}

export const datasets: Record<DatasetId, Dataset> = { shop, school, company };

export function findTable(db: Dataset, name: string): DatasetTable | undefined {
  const wanted = name.toLowerCase();
  return db.tables.find((t) => t.name.toLowerCase() === wanted);
}

/** A table's indexes: SQLite's implicit ones first, then those made with CREATE INDEX, in creation order. */
export function indexesOf(db: Dataset, table: string): IndexDef[] {
  const schema = findTable(db, table);
  if (!schema) return [];
  const wanted = table.toLowerCase();
  return [...implicitIndexes(schema), ...(db.indexes ?? []).filter((i) => i.table.toLowerCase() === wanted)];
}

/** A deep copy that a script may change, with a stable id for every row. */
export function cloneDataset(db: Dataset): Dataset {
  return {
    ...db,
    tables: db.tables.map((t) => ({
      ...structuredClone(t),
      rowIds: t.rowIds ? [...t.rowIds] : t.rows.map((_, i) => `${t.name}#${i}`),
    })),
    ...(db.indexes && { indexes: db.indexes.map((i) => ({ ...i, columns: [...i.columns] })) }),
    ...(db.views && { views: db.views.map((v) => ({ ...v })) }),
  };
}
