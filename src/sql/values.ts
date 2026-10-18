import type { ColumnType } from './schema';

/** A REAL value. Plain JS numbers are INTEGERs, so integer division can truncate the way SQLite does. */
export class Real {
  constructor(readonly value: number) {}
}

export type SqlValue = null | number | string | Real;
/** Three-valued logic: null means unknown. */
export type Truth = boolean | null;

const NUMERIC_PREFIX = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;

/** How SQLite reads text in a numeric context: the longest numeric prefix, else 0. */
function textToNumber(text: string): number | Real {
  const match = NUMERIC_PREFIX.exec(text);
  if (!match) return 0;
  const n = Number(match[0]);
  return /[.eE]/.test(match[0]) ? new Real(n) : n;
}

function numeric(v: number | string | Real): number | Real {
  return typeof v === 'string' ? textToNumber(v) : v;
}

const raw = (v: number | Real) => (v instanceof Real ? v.value : v);

export function toNumber(v: SqlValue): number | null {
  return v === null ? null : raw(numeric(v));
}

export function arithmetic(op: '+' | '-' | '*' | '/' | '%', a: SqlValue, b: SqlValue): SqlValue {
  if (a === null || b === null) return null;
  const x = numeric(a);
  const y = numeric(b);
  const real = x instanceof Real || y instanceof Real;
  const l = raw(x);
  const r = raw(y);
  switch (op) {
    case '+':
      return real ? new Real(l + r) : l + r;
    case '-':
      return real ? new Real(l - r) : l - r;
    case '*':
      return real ? new Real(l * r) : l * r;
    case '/':
      if (r === 0) return null;
      return real ? new Real(l / r) : Math.trunc(l / r);
    case '%': {
      // SQLite takes the remainder of the integer parts.
      const li = Math.trunc(l);
      const ri = Math.trunc(r);
      if (ri === 0) return null;
      const rem = li % ri;
      return real ? new Real(rem) : rem;
    }
  }
}

export function negate(a: SqlValue): SqlValue {
  if (a === null) return null;
  const x = numeric(a);
  return x instanceof Real ? new Real(-x.value) : -x;
}

const typeRank = (v: SqlValue) => (v === null ? 0 : typeof v === 'string' ? 2 : 1);

/** A total order for sorting: NULL, then numbers, then text (by code unit, like SQLite's BINARY collation). */
export function compareValues(a: SqlValue, b: SqlValue): number {
  const rank = typeRank(a) - typeRank(b);
  if (rank !== 0) return rank;
  if (a === null || b === null) return 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return raw(a as number | Real) - raw(b as number | Real);
}

export function compare(op: '=' | '<>' | '<' | '<=' | '>' | '>=', a: SqlValue, b: SqlValue): Truth {
  if (a === null || b === null) return null;
  const c = compareValues(a, b);
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '<=':
      return c <= 0;
    case '>':
      return c > 0;
    case '>=':
      return c >= 0;
  }
}

export function and(a: Truth, b: Truth): Truth {
  if (a === false || b === false) return false;
  return a === null || b === null ? null : true;
}

export function or(a: Truth, b: Truth): Truth {
  if (a === true || b === true) return true;
  return a === null || b === null ? null : false;
}

export function not(a: Truth): Truth {
  return a === null ? null : !a;
}

/** Whether a value counts as true in a condition. */
export function truth(v: SqlValue): Truth {
  return v === null ? null : toNumber(v) !== 0;
}

const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** SQLite LIKE: % matches any run, _ matches one character, ASCII letters ignore case. */
export function like(value: SqlValue, pattern: SqlValue): Truth {
  if (value === null || pattern === null) return null;
  let source = '^';
  for (const ch of asciiLower(formatValue(pattern))) {
    if (ch === '%') source += '.*';
    else if (ch === '_') source += '.';
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source + '$', 'su').test(asciiLower(formatValue(value)));
}

/** A key that is equal for SQL-equal values, for DISTINCT, grouping and result comparison. */
export function valueKey(v: SqlValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `t:${v}`;
  return `n:${raw(v)}`;
}

/** How SQLite prints a value. */
export function formatValue(v: SqlValue): string {
  if (v === null) return 'NULL';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Number.isInteger(v.value) && Math.abs(v.value) < 1e15) return `${v.value}.0`;
  return String(Number(v.value.toPrecision(15)));
}

export function toPlain(v: SqlValue): number | string | null {
  return v instanceof Real ? v.value : v;
}

const WHOLE_NUMBER_TEXT = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

/**
 * The plain value SQLite stores for `value` in a column of `type` (its type affinity).
 * Numeric columns turn text that is entirely a number into that number; TEXT columns
 * store numbers as text. Whole REAL values in an INTEGER column become integers.
 */
export function applyAffinity(value: SqlValue, type: ColumnType): number | string | null {
  if (value === null) return null;
  if (type === 'TEXT') return typeof value === 'string' ? value : formatValue(value);
  if (typeof value === 'string') {
    if (!WHOLE_NUMBER_TEXT.test(value)) return value;
    return Number(value.trim());
  }
  return raw(value);
}
