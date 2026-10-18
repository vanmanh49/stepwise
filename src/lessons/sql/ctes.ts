import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query =
  'WITH dept_pay AS (\n  SELECT department_id, AVG(salary) AS avg_salary\n  FROM employees\n  GROUP BY department_id\n)\nSELECT e.name, e.salary, d.avg_salary\nFROM employees e\nJOIN dept_pay d ON d.department_id = e.department_id\nWHERE e.salary > d.avg_salary;';

export const ctes: Lesson = {
  id: 'ctes',
  title: 'Common Table Expressions',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Advanced querying',
  description: 'Name a query with WITH and use it like a table, so a long query reads as a series of steps.',
  keywords: ['with', 'cte', 'common table expression', 'named subquery', 'temporary result', 'readable query', 'with clause'],
  prerequisites: ['subqueries', 'group-by-having'],
  overview:
    'A common table expression, or CTE, gives a query a name. WITH dept_pay AS (SELECT …) runs the inner query, and the main query that follows can read dept_pay as if it were a table. It turns one tangled query into a series of named steps.',
  concept: [
    'A CTE is like a note you write before working out a sum: "average pay per department is …". Once it is written down, you can refer to it by name instead of working it out again in the middle of everything else.',
    'WITH name AS (query) comes before the main SELECT. Inside the main query, name behaves like a table: you can select from it, join it and filter it. It exists only while this one statement runs.',
    'Several CTEs can be listed, separated by commas, and each one can read the ones before it. A CTE can also be used more than once in the main query, which a subquery in FROM cannot do without being written out twice.',
    'A column list after the name, such as WITH dept_pay(dept, payroll) AS (…), renames the columns the inner query returns. The CTE in the opening query has one row per department_id, including one for the employee with no department.',
  ],
  howItWorks: [
    'WITH names a query; the query inside the brackets runs first.',
    'Its rows become a temporary table under that name.',
    'Any further CTEs run in order and may read earlier ones.',
    'The main statement runs and reads the CTEs like tables.',
    'When the statement ends, the CTEs disappear.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      {
        label: 'Two CTEs in a row',
        query:
          'WITH dept_avg AS (\n  SELECT department_id, AVG(salary) AS avg_salary\n  FROM employees\n  GROUP BY department_id\n),\nbest AS (\n  SELECT MAX(avg_salary) AS top FROM dept_avg\n)\nSELECT d.department_id, d.avg_salary\nFROM dept_avg d\nJOIN best b ON d.avg_salary = b.top;',
      },
      {
        label: 'A column list',
        query:
          'WITH dept_pay(dept, payroll, staff) AS (\n  SELECT department_id, SUM(salary), COUNT(*)\n  FROM employees\n  GROUP BY department_id\n)\nSELECT * FROM dept_pay;',
      },
      {
        label: 'One CTE used twice',
        query:
          'WITH staff AS (\n  SELECT id, name, manager_id, salary FROM employees WHERE department_id = 2\n)\nSELECT e.name, m.name AS manager\nFROM staff e\nJOIN staff m ON m.id = e.manager_id;',
      },
    ],
    exercises: [
      {
        id: 'big-payroll',
        prompt: 'Using a CTE that totals salary per department, list the names of departments whose total salary is above 10,000.',
        solution:
          'WITH dept_pay AS (SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id) SELECT d.name FROM departments d JOIN dept_pay p ON p.department_id = d.id WHERE p.total > 10000;',
        orderMatters: false,
        hint: 'The CTE groups employees by department_id; join it to departments to get the names.',
      },
      {
        id: 'best-paid-department',
        prompt: 'List the names of the employees who work in the department with the highest average salary.',
        solution:
          'WITH dept_avg AS (SELECT department_id, AVG(salary) AS avg_salary FROM employees GROUP BY department_id), best AS (SELECT MAX(avg_salary) AS top FROM dept_avg) SELECT e.name FROM employees e JOIN dept_avg a ON a.department_id = e.department_id JOIN best b ON a.avg_salary = b.top;',
        orderMatters: false,
        hint: 'One CTE for the average per department, a second for the highest of those averages.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Breaks a long query into named, readable steps', 'A CTE can be used several times in one statement', 'Later CTEs can build on earlier ones'],
    cons: ['Exists only for one statement', 'Some databases work a CTE out again each time it is used', 'Too many small CTEs can be as hard to follow as one big query'],
    useWhen: ['A subquery is long or used more than once', 'A calculation happens in clear stages'],
    avoidWhen: ['A simple WHERE or JOIN says it directly', 'The result is needed by many statements (use a view or a table)'],
  },
  applications: [
    'Comparing each row with a group average',
    'Building a report step by step: filter, then total, then rank',
    'Reusing one filtered set of rows in several joins',
    'Preparing data before an INSERT, UPDATE or DELETE',
  ],
  commonMistakes: [
    'Putting a semicolon between the CTE and the main query; WITH and the SELECT are one statement.',
    'Forgetting the comma between two CTEs, or adding WITH again before the second.',
    'Trying to use a CTE in a later statement; it is gone once its statement ends.',
    'Giving a column list with a different number of names than the query returns.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'dept_pay has run and has 4 rows. Which department_id values do they hold?',
      view: viewAt(datasets.company, query, 0),
      options: ['1, 2, 3 and NULL', '1, 2, 3 and 4', '1, 2 and 3'],
      answer: 0,
      explanation: 'GROUP BY makes one row per value that occurs. Support (4) has no staff, and Thu has no department, so NULL forms a group.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this return?',
      code: 'WITH big AS (\n  SELECT name FROM employees WHERE salary > 6000\n)\nSELECT COUNT(*) FROM big;',
      options: ['3', '12', '1'],
      answer: 0,
      explanation: 'Lan (9000), Minh (7000) and Hoa (6500) earn more than 6000, so big has 3 rows.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'How long does a CTE exist?',
      options: ['Only while its own statement runs', 'Until the database is closed', 'Until DROP is run on it'],
      answer: 0,
      explanation: 'A CTE belongs to one statement. A later statement cannot see it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which is correct for two CTEs?',
      options: ['WITH a AS (…), b AS (…) SELECT …', 'WITH a AS (…) WITH b AS (…) SELECT …', 'WITH a AS (…); b AS (…); SELECT …'],
      answer: 0,
      explanation: 'One WITH starts the list, and the CTEs are separated by commas.',
    },
  ],
  summary: [
    'WITH name AS (query) names a query for the statement that follows.',
    'The main query reads the CTE like a table: select, join and filter it.',
    'Several CTEs are separated by commas, and each can read the earlier ones.',
    'A CTE exists only while its statement runs.',
  ],
};
