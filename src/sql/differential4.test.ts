import { describe, expect, it } from 'vitest';
import { corpus } from './corpus.testutil';
import { cloneDataset, datasets, type Dataset } from './datasets';
import { runQuery } from './execute';
import { corpus3 } from './queryCorpus3.testutil';
import { planCorpus } from './planCorpus.testutil';
import { runScript } from './script';
import { openSqlite } from './sqlite.testutil';
import { toPlain } from './values';

type Cell = number | string | null;

/** Each plan entry's detail with its depth in the plan tree. */
function shape(rows: Cell[][]): [string, number][] {
  const depth = new Map<Cell, number>([[0, 0]]);
  return rows.map(([id, parent, , detail]) => {
    const d = (depth.get(parent!) ?? 0) + 1;
    depth.set(id!, d);
    return [String(detail), d];
  });
}

it('has a plan corpus of at least 40 queries', () => {
  expect(planCorpus.length).toBeGreaterThanOrEqual(40);
});

describe.each(planCorpus)('$dataset: $sql ($setup)', ({ dataset, setup, sql }) => {
  it('explains the query as SQLite does', async () => {
    const script = `${setup ? `${setup};\n` : ''}EXPLAIN QUERY PLAN ${sql}`;
    const ours = runScript(datasets[dataset], script);
    if (!ours.ok) throw new Error(ours.error.message);
    const result = ours.statements.at(-1)!.result!;
    expect(result.columns).toEqual(['id', 'parent', 'notused', 'detail']);
    const sqlite = await openSqlite(datasets[dataset]);
    if (setup) sqlite.run(setup);
    const theirs = sqlite.query(`EXPLAIN QUERY PLAN ${sql}`);
    sqlite.close();
    expect(shape(result.rows as Cell[][])).toEqual(shape(theirs.rows));
  });
});

/** Every column of every table indexed, so any query that can use an index does. */
function fullyIndexed(db: Dataset): Dataset {
  const copy = cloneDataset(db);
  copy.indexes = copy.tables.flatMap((t) => t.columns.map((c) => ({ name: `idx_${t.name}_${c.name}`, table: t.name, columns: [c.name], unique: false, implicit: false })));
  return copy;
}

const asMultiset = (rows: unknown[][]) => rows.map((r) => JSON.stringify(r.map(toPlain as (v: unknown) => unknown))).toSorted();

describe.each([...corpus, ...corpus3].map((entry) => [entry.db, entry.sql] as const))('%s with every column indexed: %s', (db, sql) => {
  it('returns the same rows as without indexes', () => {
    const plain = runQuery(datasets[db], sql);
    const indexed = runQuery(fullyIndexed(datasets[db]), sql);
    if (!plain.ok || !indexed.ok) throw new Error(plain.ok ? (indexed as { error: Error }).error.message : plain.error.message);
    expect(asMultiset(indexed.result.rows)).toEqual(asMultiset(plain.result.rows));
  });
});
