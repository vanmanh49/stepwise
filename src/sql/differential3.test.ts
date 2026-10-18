import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { datasets, type DatasetId } from './datasets';
import { runQuery } from './execute';
import { corpus3 } from './queryCorpus3.testutil';
import { openSqlite } from './sqlite.testutil';
import { toPlain } from './values';

type Cell = number | string | null;
type Sqlite = Awaited<ReturnType<typeof openSqlite>>;

const normalise = (rows: Cell[][]) => rows.map((row) => row.map((v) => (typeof v === 'number' ? Number(v.toPrecision(12)) : v)));
const asMultiset = (rows: Cell[][]) => normalise(rows).map((r) => JSON.stringify(r)).sort();

const engines = new Map<DatasetId, Sqlite>();

beforeAll(async () => {
  for (const id of Object.keys(datasets) as DatasetId[]) engines.set(id, await openSqlite(datasets[id]));
});

afterAll(() => {
  for (const engine of engines.values()) engine.close();
});

it('has a corpus of at least 90 queries', () => {
  expect(corpus3.length).toBeGreaterThanOrEqual(90);
});

describe.each(corpus3)('$db: $sql', ({ db, sql, ordered }) => {
  it('matches SQLite', () => {
    const ours = runQuery(datasets[db], sql);
    if (!ours.ok) throw new Error(ours.error.message);
    const theirs = engines.get(db)!.query(sql);
    const rows = ours.result.rows.map((row) => row.map(toPlain));
    expect(ours.result.columns).toHaveLength(theirs.columns.length);
    if (ordered) expect(normalise(rows)).toEqual(normalise(theirs.rows));
    else expect(asMultiset(rows)).toEqual(asMultiset(theirs.rows));
  });
});
