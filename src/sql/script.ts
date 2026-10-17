import type { Statement } from './ast';
import { cloneDataset, findTable, type Dataset } from './datasets';
import { asSqlError, ConstraintError, type SqlError } from './errors';
import type { QueryResult } from './execute';
import { parseScript } from './parse';
import { executeStatement, relationOf, type Emit } from './write';

export interface StatementOutcome {
  kind: Statement['kind'];
  line: number;
  /** Rows written or removed; for a SELECT, rows returned. */
  affected: number;
  result?: QueryResult;
}

export type ScriptResult =
  | { ok: true; db: Dataset; statements: StatementOutcome[] }
  /**
   * `db` holds the changes of the statements before the failing one. `failedIndex` is -1 when
   * the script could not be parsed, so nothing ran.
   */
  | { ok: false; error: SqlError; db: Dataset; statements: StatementOutcome[]; failedIndex: number };

/**
 * Runs a script on a fresh copy of `db`, one statement at a time. Stops at the first error;
 * the failing statement's changes are undone, as in SQLite. Never throws.
 */
export function runScript(db: Dataset, sql: string, emit?: Emit): ScriptResult {
  const work = cloneDataset(db);
  const parsed = parseScript(sql);
  if (!parsed.ok) return { ok: false, error: parsed.error, db: work, statements: [], failedIndex: -1 };
  const statements: StatementOutcome[] = [];
  const total = parsed.statements.length;
  for (const [index, statement] of parsed.statements.entries()) {
    emit?.({ kind: 'statement-start', index, total, statement });
    const snapshot = structuredClone(work.tables);
    try {
      const { affected, result } = executeStatement(work, statement, emit);
      statements.push({ kind: statement.kind, line: statement.line, affected, ...(result && { result }) });
    } catch (error) {
      work.tables = snapshot;
      if (error instanceof ConstraintError) {
        const table = findTable(work, error.constraint.table);
        emit?.({ kind: 'rolled-back', table: error.constraint.table, ...(table && { relation: relationOf(work, table) }) });
      }
      return { ok: false, error: asSqlError(error), db: work, statements, failedIndex: index };
    }
  }
  return { ok: true, db: work, statements };
}
