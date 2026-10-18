import { describe, expect, it } from 'vitest';
import { datasets } from './datasets';
import { runScript } from './script';
import { scriptCorpus4 } from './scriptCorpus4.testutil';
import { openSqlite } from './sqlite.testutil';
import { toPlain } from './values';

type Cell = number | string | null;

const asMultiset = (rows: Cell[][]) => rows.map((r) => JSON.stringify(r)).toSorted();

it('has a corpus of at least 30 scripts', () => {
  expect(scriptCorpus4.length).toBeGreaterThanOrEqual(30);
});

describe.each(scriptCorpus4.map((s) => [s.db, s.statements.join('; '), s] as const))('%s: %s', (_db, _sql, { db, statements }) => {
  it('matches SQLite', async () => {
    const ours = runScript(datasets[db], statements.join(';\n'));
    if (!ours.ok) throw new Error(`our script stopped: ${ours.error.message}`);
    const sqlite = await openSqlite(datasets[db]);
    try {
      const theirs = statements.map((sql) => sqlite.exec(sql));
      // A transaction still open when the script ends is rolled back.
      sqlite.exec('ROLLBACK');
      expect(ours.statements.map((s) => s.error !== undefined)).toEqual(theirs.map((t) => t.error !== undefined));
      ours.statements.forEach((s, i) => {
        if (s.kind === 'select' && !s.error) expect(asMultiset(s.result!.rows.map((r) => r.map(toPlain))), statements[i]).toEqual(asMultiset(theirs[i]!.rows));
      });
      const tables = sqlite.tables();
      for (const table of ours.db.tables) expect(asMultiset(table.rows), table.name).toEqual(asMultiset(tables[table.name] ?? []));
      expect(ours.db.tables.map((t) => t.name).toSorted()).toEqual(Object.keys(tables).toSorted());
    } finally {
      sqlite.close();
    }
  });
});
