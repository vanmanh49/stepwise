type SqlErrorKind = 'syntax' | 'name' | 'unsupported' | 'limit' | 'constraint';

export interface ConstraintInfo {
  rule: 'NOT NULL' | 'UNIQUE' | 'PRIMARY KEY' | 'CHECK' | 'FOREIGN KEY';
  table: string;
  column?: string;
}

/** A problem with the learner's query, located at a 1-based line and column. */
export class SqlError extends Error {
  constructor(
    message: string,
    readonly kind: SqlErrorKind,
    readonly line: number,
    readonly column: number,
    /** Curriculum id of the lesson that will cover an unsupported feature. */
    readonly topic?: string,
  ) {
    super(message);
    this.name = 'SqlError';
  }

  /** Set when a write broke a constraint. */
  readonly constraint?: ConstraintInfo;
}

/** A write that broke a constraint, with the row that broke it and the row it clashed with. */
export class ConstraintError extends SqlError {
  constructor(
    message: string,
    override readonly constraint: ConstraintInfo,
    /** The new or changed row; for a parent-side foreign key failure, the child row that still refers to it. */
    readonly rowId: string,
    line: number,
    column: number,
    readonly clashWith?: { table: string; rowId: string },
  ) {
    super(message, 'constraint', line, column);
  }
}

/**
 * Learner input must never crash the page, so an unexpected failure becomes an ordinary
 * query error. It is still logged, because it means a bug in the interpreter.
 */
export function asSqlError(error: unknown): SqlError {
  if (error instanceof SqlError) return error;
  console.error(error);
  return new SqlError('Something went wrong running this query. Try simplifying it.', 'limit', 1, 1);
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** The closest candidate within two edits, ignoring case. */
export function suggest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}
