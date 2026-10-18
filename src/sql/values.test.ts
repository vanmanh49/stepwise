import { describe, expect, it } from 'vitest';
import { suggest } from './errors';
import {
  applyAffinity,
  and,
  arithmetic,
  compare,
  compareValues,
  formatValue,
  like,
  not,
  or,
  Real,
  valueKey,
} from './values';

describe('arithmetic', () => {
  it('truncates integer division toward zero', () => {
    expect(arithmetic('/', 7, 2)).toBe(3);
    expect(arithmetic('/', -7, 2)).toBe(-3);
  });

  it('returns a REAL when either side is REAL', () => {
    expect(arithmetic('/', 7, new Real(2))).toEqual(new Real(3.5));
    expect(arithmetic('*', new Real(1.5), 2)).toEqual(new Real(3));
  });

  it('returns NULL for division by zero and NULL operands', () => {
    expect(arithmetic('/', 5, 0)).toBeNull();
    expect(arithmetic('%', 5, 0)).toBeNull();
    expect(arithmetic('+', null, 1)).toBeNull();
  });

  it('computes the integer remainder', () => {
    expect(arithmetic('%', 7, 3)).toBe(1);
  });
});

describe('compare', () => {
  it('is unknown when either side is NULL', () => {
    expect(compare('=', null, null)).toBeNull();
    expect(compare('<', 1, null)).toBeNull();
  });

  it('compares integers and reals numerically', () => {
    expect(compare('<', 2, new Real(2.5))).toBe(true);
    expect(compare('=', 2, new Real(2))).toBe(true);
  });

  it('orders numbers before text', () => {
    expect(compare('<', 99, 'a')).toBe(true);
  });
});

describe('three-valued logic', () => {
  it('follows the SQL truth tables', () => {
    expect(and(false, null)).toBe(false);
    expect(and(true, null)).toBeNull();
    expect(or(true, null)).toBe(true);
    expect(or(false, null)).toBeNull();
    expect(not(null)).toBeNull();
    expect(not(true)).toBe(false);
  });
});

describe('like', () => {
  it('matches % and _ case-insensitively', () => {
    expect(like('Anna', 'a%')).toBe(true);
    expect(like('Bo', '_o')).toBe(true);
    expect(like('Bo', 'b')).toBe(false);
  });

  it('is unknown for NULL and works on numbers', () => {
    expect(like(null, '%')).toBeNull();
    expect(like(15, '1%')).toBe(true);
  });
});

describe('compareValues', () => {
  it('sorts NULL first, then numbers, then text', () => {
    const sorted = ['b', 2, null, new Real(1.5), 'a'].sort(compareValues);
    expect(sorted).toEqual([null, new Real(1.5), 2, 'a', 'b']);
  });
});

describe('formatting and keys', () => {
  it('formats values the way SQLite prints them', () => {
    expect(formatValue(new Real(42))).toBe('42.0');
    expect(formatValue(new Real(9.5))).toBe('9.5');
    expect(formatValue(null)).toBe('NULL');
    expect(formatValue('Ana')).toBe('Ana');
  });

  it('gives SQL-equal values the same key', () => {
    expect(valueKey(2)).toBe(valueKey(new Real(2)));
    expect(valueKey(null)).toBe(valueKey(null));
    expect(valueKey('2')).not.toBe(valueKey(2));
  });
});

describe('suggest', () => {
  it('finds the closest name within two edits', () => {
    expect(suggest('cutomer_id', ['id', 'customer_id'])).toBe('customer_id');
    expect(suggest('NAME', ['name'])).toBe('name');
    expect(suggest('zzz', ['id'])).toBeUndefined();
  });
});

describe('applyAffinity', () => {
  it.each([
    ['5', 5],
    [' 5 ', 5],
    ['2.5', 2.5],
    ['1e2', 100],
    ['abc', 'abc'],
    ['5abc', '5abc'],
    ['', ''],
    [new Real(3), 3],
    [new Real(2.5), 2.5],
    [7, 7],
    [null, null],
  ] as const)('INTEGER stores %o as %o', (value, stored) => {
    expect(applyAffinity(value, 'INTEGER')).toBe(stored);
  });

  it.each([
    [5, 5],
    ['2.5', 2.5],
    ['3', 3],
    ['x', 'x'],
    [new Real(1.5), 1.5],
    [null, null],
  ] as const)('REAL stores %o as %o', (value, stored) => {
    expect(applyAffinity(value, 'REAL')).toBe(stored);
  });

  it.each([
    [5, '5'],
    [new Real(2.5), '2.5'],
    [new Real(3), '3.0'],
    ['a', 'a'],
    [null, null],
  ] as const)('TEXT stores %o as %o', (value, stored) => {
    expect(applyAffinity(value, 'TEXT')).toBe(stored);
  });
});
