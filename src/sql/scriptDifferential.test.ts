import { describe, expect, it } from 'vitest';
import { datasets, type Dataset } from './datasets';
import type { SqlError } from './errors';
import { runScript } from './script';
import { scriptCorpus } from './scriptCorpus.testutil';
import { openSqlite } from './sqlite.testutil';
import { toPlain } from './values';

type Cell = number | string | null;

const normalise = (rows: Cell[][]) => rows.map((row) => row.map((v) => (typeof v === 'number' ? Number(v.toPrecision(12)) : v)));
const asMultiset = (rows: Cell[][]) => normalise(rows).map((r) => JSON.stringify(r)).toSorted();

/** One label per kind of failure, comparable across the two engines. */
function ourFailure(error: SqlError): string {
  if (error.kind !== 'constraint') return 'OTHER';
  if (error.message.includes('must be a whole number')) return 'DATATYPE';
  // SQLite reports a broken PRIMARY KEY as a UNIQUE failure.
  return error.constraint!.rule === 'PRIMARY KEY' ? 'UNIQUE' : error.constraint!.rule;
}

function theirFailure(message: string): string {
  for (const [needle, label] of [
    ['NOT NULL constraint failed', 'NOT NULL'],
    ['UNIQUE constraint failed', 'UNIQUE'],
    ['CHECK constraint failed', 'CHECK'],
    ['FOREIGN KEY constraint failed', 'FOREIGN KEY'],
    ['datatype mismatch', 'DATATYPE'],
  ] as const) {
    if (message.includes(needle)) return label;
  }
  return 'OTHER';
}

function ourTables(db: Dataset): Record<string, Cell[][]> {
  return Object.fromEntries(db.tables.map((t) => [t.name, t.rows]));
}

it('has a corpus of at least 80 scripts', () => {
  expect(scriptCorpus.length).toBeGreaterThanOrEqual(80);
});

describe.each(scriptCorpus)('$db: $sql', ({ db, sql }) => {
  it('matches SQLite', async () => {
    const sqlite = await openSqlite(datasets[db]);
    try {
      const theirs = sqlite.run(sql);
      const ours = runScript(datasets[db], sql);
      if (!ours.ok && ours.failedIndex === -1) throw new Error(`parse error: ${ours.error.message}`);
      expect(ours.ok ? undefined : ours.failedIndex, theirs.error).toBe(theirs.failedIndex);
      if (!ours.ok) expect(ourFailure(ours.error), `${ours.error.message} / ${theirs.error}`).toBe(theirFailure(theirs.error!));

      const tables = sqlite.tables();
      const mine = ourTables(ours.db);
      expect(Object.keys(mine).map((n) => n.toLowerCase()).toSorted()).toEqual(Object.keys(tables).map((n) => n.toLowerCase()).toSorted());
      for (const [name, rows] of Object.entries(mine)) expect(asMultiset(rows), name).toEqual(asMultiset(tables[name]!));

      ours.statements.forEach((statement, i) => {
        if (statement.kind !== 'select') return;
        const rows = statement.result!.rows.map((row) => row.map(toPlain));
        expect(asMultiset(rows), `SELECT #${i + 1}`).toEqual(asMultiset(theirs.results[i]!));
      });
    } finally {
      sqlite.close();
    }
  });
});
