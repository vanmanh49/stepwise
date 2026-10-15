import { school } from './school';
import { shop } from './shop';

export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';

export interface DatasetTable {
  name: string;
  columns: { name: string; type: ColumnType }[];
  rows: (number | string | null)[][];
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
