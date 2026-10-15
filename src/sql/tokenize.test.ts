import { describe, expect, it } from 'vitest';
import { SqlError } from './errors';
import { tokenize } from './tokenize';

function failure(sql: string): SqlError {
  try {
    tokenize(sql);
  } catch (error) {
    if (error instanceof SqlError) return error;
    throw error;
  }
  throw new Error('expected tokenize to throw');
}

describe('tokenize', () => {
  it('splits a query into kinds and drops comments', () => {
    const tokens = tokenize('select Name from t -- hi\nwhere x >= 2.5');
    expect(tokens.map((t) => t.kind)).toEqual([
      'keyword',
      'identifier',
      'keyword',
      'identifier',
      'keyword',
      'identifier',
      'operator',
      'number',
      'eof',
    ]);
    expect(tokens[0]!.value).toBe('SELECT');
    expect(tokens[1]!.value).toBe('Name');
    expect(tokens[5]).toMatchObject({ value: 'x', line: 2, column: 7 });
  });

  it('reads escaped quotes inside strings', () => {
    const [token] = tokenize("'it''s'");
    expect(token).toMatchObject({ kind: 'string', value: "it's" });
  });

  it('reads double-quoted identifiers', () => {
    const [token] = tokenize('"order"');
    expect(token).toMatchObject({ kind: 'identifier', value: 'order' });
  });

  it('reads every operator and punctuation mark', () => {
    const tokens = tokenize('<> != <= >= = < > + - * / % ( ) , . ;');
    expect(tokens.slice(0, -1).map((t) => t.text)).toEqual([
      '<>', '!=', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '%', '(', ')', ',', '.', ';',
    ]);
    expect(tokens.slice(0, 12).every((t) => t.kind === 'operator')).toBe(true);
    expect(tokens.slice(12, -1).every((t) => t.kind === 'punct')).toBe(true);
  });

  it('records source offsets', () => {
    const [, second] = tokenize('a  bc');
    expect(second).toMatchObject({ start: 3, end: 5 });
  });

  it('rejects an unterminated string at its opening quote', () => {
    const error = failure("SELECT\n  'abc");
    expect(error.message).toBe('This string is missing its closing quote.');
    expect(error).toMatchObject({ kind: 'syntax', line: 2, column: 3 });
  });

  it('rejects unknown characters', () => {
    expect(failure('SELECT @').message).toBe('Unexpected character `@`.');
  });
});
