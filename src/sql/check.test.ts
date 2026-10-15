import { describe, expect, it } from 'vitest';
import { checkExercise, describeCheck } from './check';
import { datasets } from './datasets';
import { SqlError } from './errors';

const shop = datasets.shop;
const exercise = (solution: string, orderMatters = false) => ({ solution, orderMatters });

describe('checkExercise', () => {
  it('accepts the same query', () => {
    expect(checkExercise(shop, 'SELECT name FROM products', exercise('SELECT name FROM products'))).toEqual({ status: 'correct' });
  });

  it('ignores column names', () => {
    expect(checkExercise(shop, 'SELECT name AS n FROM products', exercise('SELECT name FROM products')).status).toBe('correct');
  });

  it('treats 2 and 2.0 as equal', () => {
    expect(checkExercise(shop, 'SELECT id * 1.0 FROM orders', exercise('SELECT id FROM orders')).status).toBe('correct');
  });

  it('ignores row order unless the exercise asks for it', () => {
    const shuffled = 'SELECT name FROM products ORDER BY name DESC';
    expect(checkExercise(shop, shuffled, exercise('SELECT name FROM products ORDER BY name')).status).toBe('correct');
    expect(checkExercise(shop, shuffled, exercise('SELECT name FROM products ORDER BY name', true))).toEqual({ status: 'order' });
  });

  it('counts missing and extra rows', () => {
    expect(checkExercise(shop, 'SELECT name FROM products', exercise("SELECT name FROM products WHERE category = 'Books'"))).toEqual({
      status: 'rows',
      missing: 0,
      extra: 6,
    });
    expect(
      checkExercise(shop, "SELECT name FROM products WHERE category = 'Kitchen'", exercise("SELECT name FROM products WHERE category = 'Books'")),
    ).toEqual({ status: 'rows', missing: 3, extra: 2 });
  });

  it('compares column counts', () => {
    expect(checkExercise(shop, 'SELECT name, price FROM products', exercise('SELECT name FROM products'))).toEqual({
      status: 'columns',
      expected: 1,
      actual: 2,
    });
  });

  it('reports the learner query error', () => {
    const result = checkExercise(shop, 'SELEC name FROM products', exercise('SELECT name FROM products'));
    expect(result.status).toBe('error');
  });

  it('throws when the solution itself fails', () => {
    expect(() => checkExercise(shop, 'SELECT 1 FROM t', exercise('SELECT nope FROM products'))).toThrow();
  });
});

describe('describeCheck', () => {
  it('words each result', () => {
    expect(describeCheck({ status: 'correct' })).toBe('Correct!');
    expect(describeCheck({ status: 'error', error: new SqlError('Expected FROM, found `x`.', 'syntax', 2, 5) })).toBe(
      'Expected FROM, found `x`. (line 2, col 5)',
    );
    expect(describeCheck({ status: 'columns', expected: 2, actual: 3 })).toBe('Expected 2 columns, got 3.');
    expect(describeCheck({ status: 'columns', expected: 1, actual: 2 })).toBe('Expected 1 column, got 2.');
    expect(describeCheck({ status: 'rows', missing: 2, extra: 1 })).toBe('2 rows missing, 1 extra row.');
    expect(describeCheck({ status: 'rows', missing: 1, extra: 0 })).toBe('1 row missing.');
    expect(describeCheck({ status: 'rows', missing: 0, extra: 3 })).toBe('3 extra rows.');
    expect(describeCheck({ status: 'order' })).toBe('Right rows, wrong order.');
  });
});
