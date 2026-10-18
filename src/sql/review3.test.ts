import { describe, expect, it } from 'vitest';
import { datasets } from './datasets';
import { executeSelect, runQuery, type TraceEvent } from './execute';
import { parseQuery } from './parse';
import { fullLesson } from '../lessons/all.testutil';
import { checkExercise } from './check';

const { company } = datasets;

function error(sql: string): string {
  const result = runQuery(company, sql);
  if (result.ok) throw new Error(`expected an error for: ${sql}`);
  return result.error.message;
}

// 12 × 12 × 12 = 1,728 rows.
const cube = 'SELECT a.id AS x FROM employees a JOIN employees b ON 1 = 1 JOIN employees c ON 1 = 1';

describe('recursive CTE column lists', () => {
  it('checks the column list against the anchor SELECT', () => {
    expect(error('WITH RECURSIVE x(a) AS (SELECT 1, 2 UNION ALL SELECT a + 1, 2 FROM x WHERE a < 3) SELECT * FROM x')).toBe(
      'CTE `x` lists 1 columns but its SELECT returns 2.',
    );
    expect(error('WITH RECURSIVE x(a, b) AS (SELECT 1 UNION ALL SELECT a + 1 FROM x WHERE a < 3) SELECT * FROM x')).toBe(
      'CTE `x` lists 2 columns but its SELECT returns 1.',
    );
  });
});

describe('one work budget per query', () => {
  // Each part alone stays under 200,000 row checks; together they go over.
  const heavy = '(SELECT COUNT(*) FROM employees a JOIN employees b ON 1 = 1 JOIN employees c ON 1 = 1 WHERE a.id > n.x - 1000)';

  it('counts every round of a recursion against the same budget', () => {
    expect(error(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 100 AND ${heavy} > 0) SELECT COUNT(*) FROM n`)).toMatch(
      /too much work/,
    );
  });

  it('counts every side of a UNION and every CTE against the same budget', () => {
    const side = 'SELECT COUNT(*) FROM employees a JOIN employees b ON 1 = 1 JOIN employees c ON 1 = 1 JOIN employees d ON a.id = d.id';
    // About 22,600 row checks each, so ten of them pass 200,000.
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(error(ten.map(() => side).join(' UNION ALL '))).toMatch(/too much work/);
    expect(error(`WITH ${ten.map((i) => `c${i} AS (${side})`).join(', ')} SELECT 1`)).toMatch(/too much work/);
  });
});

describe('window functions on many rows', () => {
  it('traces at most 400 window rows', () => {
    const parsed = parseQuery(`WITH big AS (${cube}) SELECT x, COUNT(*) OVER (ORDER BY x) FROM big`);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const events: TraceEvent[] = [];
    executeSelect(company, parsed.statement, (e) => events.push(e));
    expect(events.filter((e) => e.kind === 'window-row').length).toBeLessThanOrEqual(400);
  });

  it('ranks thousands of tied rows quickly', () => {
    const start = performance.now();
    const result = runQuery(company, `WITH big AS (${cube} UNION ALL ${cube} UNION ALL ${cube}) SELECT DENSE_RANK() OVER (ORDER BY 1) AS d, RANK() OVER (ORDER BY 1) AS r FROM big`);
    expect(performance.now() - start).toBeLessThan(1500);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.result.rows.at(-1)).toEqual([1, 1]);
  });
});

describe('recursive CTE restrictions', () => {
  it('rejects a self-reference inside a subquery', () => {
    expect(error('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 3 AND x IN (SELECT x FROM n)) SELECT x FROM n')).toBe(
      'A recursive CTE must refer to itself exactly once, in FROM or JOIN.',
    );
  });

  it('rejects aggregates and window functions in the recursive SELECT', () => {
    expect(error('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT MAX(x) + 1 FROM n HAVING MAX(x) < 4) SELECT x FROM n')).toBe(
      "Aggregates like MAX can't be used in the recursive SELECT of a CTE.",
    );
    expect(error('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT ROW_NUMBER() OVER () + x FROM n WHERE x < 4) SELECT x FROM n')).toBe(
      "Window functions can't be used in the recursive SELECT of a CTE.",
    );
  });
});

describe('window functions inside aggregates', () => {
  it('is an error, not NULL', () => {
    expect(error('SELECT SUM(RANK() OVER (ORDER BY salary)) FROM employees')).toBe("Window functions can't be used inside aggregates.");
  });
});

describe('top-earners exercise', () => {
  it('says how employees without a department count', () => {
    const lesson = fullLesson('window-functions');
    if (lesson.visualization.kind !== 'sql') throw new Error('sql lesson');
    const exercise = lesson.visualization.exercises.find((e) => e.id === 'top-earners')!;
    expect(exercise.prompt).toMatch(/Thu/);
    expect(checkExercise(company, exercise.solution, exercise)).toEqual({ status: 'correct' });
  });
});
