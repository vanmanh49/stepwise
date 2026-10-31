import { SqlError } from './errors';

type TokenKind = 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'punct' | 'eof';

export interface Token {
  kind: TokenKind;
  /** Exact source text. */
  text: string;
  /** Keywords upper-cased, identifiers and strings unquoted. */
  value: string;
  /** 1-based. */
  line: number;
  column: number;
  /** Offsets into the query, end exclusive. */
  start: number;
  end: number;
}

/** Every word the parser recognises, including ones it only recognises to explain they are unsupported. */
const KEYWORDS: ReadonlySet<string> = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'DISTINCT', 'ALL',
  'JOIN', 'INNER', 'LEFT', 'OUTER', 'ON', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC',
  'LIMIT', 'OFFSET', 'IS', 'NULL', 'IN', 'BETWEEN', 'LIKE', 'TRUE', 'FALSE',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
  'UNION', 'INTERSECT', 'EXCEPT', 'WITH', 'OVER', 'PARTITION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'EXISTS', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'USING',
]);

const OPERATORS = ['<>', '!=', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '%'];
const PUNCT = '(),.;:';
const NUMBER = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;
const WORD = /^[A-Za-z_][A-Za-z0-9_]*/;

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  const push = (kind: TokenKind, start: number, end: number, value: string) =>
    tokens.push({ kind, text: sql.slice(start, end), value, line, column: start - lineStart + 1, start, end });
  const fail = (message: string, at: number): never => {
    throw new SqlError(message, 'syntax', line, at - lineStart + 1);
  };

  while (pos < sql.length) {
    const ch = sql[pos]!;
    const rest = sql.slice(pos);

    if (ch === '\n') {
      pos++;
      line++;
      lineStart = pos;
      continue;
    }
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }
    if (rest.startsWith('--')) {
      while (pos < sql.length && sql[pos] !== '\n') pos++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const start = pos;
      let value = '';
      pos++;
      for (;;) {
        if (pos >= sql.length || sql[pos] === '\n') {
          fail(ch === "'" ? 'This string is missing its closing quote.' : 'This name is missing its closing quote.', start);
        }
        if (sql[pos] === ch) {
          if (sql[pos + 1] === ch) {
            value += ch;
            pos += 2;
            continue;
          }
          pos++;
          break;
        }
        value += sql[pos];
        pos++;
      }
      push(ch === "'" ? 'string' : 'identifier', start, pos, value);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      push('number', pos, pos + number[0].length, number[0]);
      pos += number[0].length;
      continue;
    }
    const word = WORD.exec(rest);
    if (word) {
      const upper = word[0].toUpperCase();
      const keyword = KEYWORDS.has(upper);
      push(keyword ? 'keyword' : 'identifier', pos, pos + word[0].length, keyword ? upper : word[0]);
      pos += word[0].length;
      continue;
    }
    const operator = OPERATORS.find((op) => rest.startsWith(op));
    if (operator) {
      push('operator', pos, pos + operator.length, operator);
      pos += operator.length;
      continue;
    }
    if (PUNCT.includes(ch)) {
      push('punct', pos, pos + 1, ch);
      pos++;
      continue;
    }
    fail(`Unexpected character \`${ch}\`.`, pos);
  }

  push('eof', pos, pos, '');
  return tokens;
}
