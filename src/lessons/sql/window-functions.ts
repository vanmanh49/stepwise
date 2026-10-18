import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query =
  'SELECT name, department_id, salary,\n  RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS pay_rank\nFROM employees;';

export const windowFunctions: Lesson = {
  id: 'window-functions',
  title: 'Window Functions',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Advanced querying',
  description: 'Rank rows, keep running totals and look at neighbouring rows, without collapsing rows into groups.',
  keywords: ['window function', 'over', 'partition by', 'rank', 'dense_rank', 'row_number', 'lag', 'lead', 'running total', 'analytic'],
  prerequisites: ['group-by-having', 'ctes'],
  overview:
    'A window function computes a value for each row from a set of related rows, its window, and keeps every row in the result. RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) ranks each employee by pay within their own department, while still listing every employee.',
  concept: [
    'GROUP BY squeezes each department into one row. A window function is like looking at the department through a window instead: each employee keeps their own row, and gets an extra value worked out from the people around them.',
    'OVER (…) describes the window. PARTITION BY splits the rows into separate groups, here one per department; without it, all rows form one window. ORDER BY sets the order inside each partition, which ranking and running totals need.',
    'ROW_NUMBER() numbers rows 1, 2, 3, … with no ties. RANK() gives tied rows the same rank and then skips, so two people sharing 2nd are followed by 4th. DENSE_RANK() does not skip, so they are followed by 3rd.',
    'Aggregates work as window functions too. SUM(salary) OVER (ORDER BY hired) is a running total; AVG(salary) OVER (PARTITION BY department_id) puts the department average beside each row. LAG(salary) reads the previous row’s value and LEAD the next one’s.',
    'Window functions are worked out after WHERE and GROUP BY, so they cannot be used in WHERE. To keep only rank 1, compute the rank in a CTE and filter it in the main query.',
  ],
  howItWorks: [
    'FROM, WHERE and GROUP BY run first, as usual.',
    'PARTITION BY splits the rows into partitions; without it there is one partition.',
    'ORDER BY sorts each partition.',
    'The function is worked out for each row from its partition: a rank, a running total, or a neighbour’s value.',
    'SELECT shows the result as an extra column; every row is kept.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      {
        label: 'ROW_NUMBER, RANK, DENSE_RANK',
        query:
          'SELECT name, salary,\n  ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num,\n  RANK() OVER (ORDER BY salary DESC) AS rank,\n  DENSE_RANK() OVER (ORDER BY salary DESC) AS dense\nFROM employees;',
      },
      {
        label: 'Running payroll',
        query: 'SELECT name, hired, salary,\n  SUM(salary) OVER (ORDER BY hired) AS payroll\nFROM employees;',
      },
      {
        label: 'LAG: previous hire',
        query: 'SELECT name, hired, salary,\n  LAG(salary) OVER (ORDER BY hired) AS previous_salary\nFROM employees;',
      },
      {
        label: 'Department average',
        query: 'SELECT name, department_id, salary,\n  AVG(salary) OVER (PARTITION BY department_id) AS dept_avg\nFROM employees;',
      },
    ],
    exercises: [
      {
        id: 'top-earners',
        prompt: 'List the names of the top earners in each department (rank 1 by salary within the department). Use a CTE to compute the rank.',
        solution:
          'WITH ranked AS (SELECT name, RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS r FROM employees) SELECT name FROM ranked WHERE r = 1;',
        orderMatters: false,
        hint: 'A window function cannot go in WHERE. Rank inside a CTE, then keep r = 1 in the main query.',
      },
      {
        id: 'above-average',
        prompt: 'List each employee’s name with their salary minus their department’s average salary.',
        solution: 'SELECT name, salary - AVG(salary) OVER (PARTITION BY department_id) FROM employees;',
        orderMatters: false,
        hint: 'AVG(salary) OVER (PARTITION BY department_id) gives the department average on every row.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Keeps every row while adding group-level values', 'Ranks, running totals and neighbour lookups in one query', 'Replaces many self joins and correlated subqueries'],
    cons: ['Cannot be used in WHERE or GROUP BY', 'RANK, DENSE_RANK and ROW_NUMBER are easy to mix up', 'Sorting each partition costs time on big tables'],
    useWhen: ['You need a per-row value that depends on other rows', 'Top-N per group, running totals, or comparing with the previous row'],
    avoidWhen: ['You only need one summary row per group (use GROUP BY)'],
  },
  applications: [
    'Ranking salespeople within each region',
    'Running balances in a bank statement',
    'Comparing each month’s sales with the month before',
    'Picking the latest order of each customer',
  ],
  commonMistakes: [
    'Putting a window function in WHERE; filter it in an outer query or CTE instead.',
    'Forgetting PARTITION BY, so the ranking runs over the whole table instead of each group.',
    'Using ROW_NUMBER when ties should share a place, or RANK when no gaps are wanted.',
    'Forgetting ORDER BY inside OVER for a running total or LAG.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'In department 2, Tuan and Vy share rank 3 on 5200. The next row is Nam on 4100. What is his RANK()?',
      view: viewAt(datasets.company, query, 7),
      options: ['5', '4', '3'],
      answer: 0,
      explanation: 'RANK skips after a tie: two rows share 3rd place, so the next rank is 5.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'In Sales, the salaries are 6500, 4800, 4800 and 3900. What is DENSE_RANK() for 3900?',
      code: 'DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC)',
      options: ['3', '4', '2'],
      answer: 0,
      explanation: 'DENSE_RANK gives 1, 2, 2 and then 3, with no gap after the tie. RANK would give 4.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'How does AVG(salary) OVER (PARTITION BY department_id) differ from GROUP BY department_id?',
      options: [
        'It keeps every employee row and adds the average to each',
        'It returns one row per department',
        'It averages over the whole table',
      ],
      answer: 0,
      explanation: 'A window function never removes rows; each row gets its partition’s average.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does WHERE RANK() OVER (…) = 1 not work?',
      options: [
        'Window functions are worked out after WHERE has already run',
        'RANK only works with GROUP BY',
        'WHERE cannot compare with numbers',
      ],
      answer: 0,
      explanation: 'Compute the rank in a CTE or subquery first, then filter it in the outer query.',
    },
  ],
  summary: [
    'A window function adds a value to each row, computed from its window, and keeps every row.',
    'PARTITION BY splits rows into groups; ORDER BY orders each group.',
    'ROW_NUMBER never ties; RANK ties and skips; DENSE_RANK ties without skipping.',
    'Aggregates with OVER give running totals and group averages; LAG and LEAD read neighbouring rows.',
  ],
};
