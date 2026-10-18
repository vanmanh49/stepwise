import { school } from './school';
import { shop } from './shop';

import type { TableSchema } from '../schema';

export type { ColumnType } from '../schema';

export interface DatasetTable extends TableSchema {
  rows: (number | string | null)[][];
  /** Stable ids parallel to rows; absent on the static datasets, where a scan falls back to `${name}#${i}`. */
  rowIds?: string[];
}

export type DatasetId = 'shop' | 'school';

/** A read-only sample database. Tables hold at most 20 rows. */
export interface Dataset {
  id: DatasetId;
  title: string;
  tables: DatasetTable[];
}

export const datasets: Record<DatasetId, Dataset> = { shop, school };

export function findTable(db: Dataset, name: string): DatasetTable | undefined {
  const wanted = name.toLowerCase();
  return db.tables.find((t) => t.name.toLowerCase() === wanted);
}

/** A deep copy that a script may change, with a stable id for every row. */
export function cloneDataset(db: Dataset): Dataset {
  return {
    ...db,
    tables: db.tables.map((t) => ({
      ...structuredClone(t),
      rowIds: t.rowIds ? [...t.rowIds] : t.rows.map((_, i) => `${t.name}#${i}`),
    })),
  };
}
