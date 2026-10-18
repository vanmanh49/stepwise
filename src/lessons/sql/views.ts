import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { LessonContent } from '../../types/lesson';

const query = 'CREATE VIEW dept_pay AS\nSELECT department_id, SUM(salary) AS total\nFROM employees\nGROUP BY department_id;\nSELECT * FROM dept_pay;';

const content: LessonContent = {
  overview:
    'A view is a query with a name. CREATE VIEW stores the query, not its rows; whenever the view is read, the query runs on the tables as they are at that moment. Views let you name a useful result once and use it everywhere, like a CTE that lasts beyond one statement.',
  concept: [
    'A view is like a saved search in a mail app. The search "unread from Lan" is stored, not the emails. Open it tomorrow and it shows tomorrow’s mail. CREATE VIEW dept_pay AS SELECT … stores the query; SELECT * FROM dept_pay runs it.',
    'Because only the query is stored, a view is never out of date. Add an employee, and the next read of dept_pay includes their salary. Nothing has to be refreshed.',
    'A view is read exactly like a table: select from it, filter it, join it to other tables, or build another view on top of it. A column list, CREATE VIEW pay (who, monthly) AS …, renames its columns.',
    'Here, views are read-only: to change the data, change the tables the view reads. DROP VIEW removes only the stored query; the tables are untouched.',
  ],
  howItWorks: [
    'CREATE VIEW checks the query once, so a missing table or column is reported straight away.',
    'Only the query is stored, under the view’s name.',
    'When a query reads the view, the view’s query runs first, on the current tables.',
    'Its rows then work like a table for the rest of the query.',
    'DROP VIEW removes the stored query and nothing else.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      {
        label: 'Manager names',
        query:
          "CREATE VIEW manager_names AS\nSELECT e.name AS employee, m.name AS manager\nFROM employees e\nLEFT JOIN employees m ON m.id = e.manager_id;\nSELECT * FROM manager_names WHERE manager = 'Minh';",
      },
      {
        label: 'A view in a JOIN',
        query:
          'CREATE VIEW dept_pay AS\nSELECT department_id, SUM(salary) AS total\nFROM employees GROUP BY department_id;\nSELECT d.name, p.total\nFROM departments d\nJOIN dept_pay p ON p.department_id = d.id;',
      },
      { label: 'A column list', query: 'CREATE VIEW pay (who, monthly) AS\nSELECT name, salary FROM employees;\nSELECT who FROM pay WHERE monthly > 6000;' },
      {
        label: 'Always up to date',
        query: "CREATE VIEW names AS SELECT name FROM employees;\nINSERT INTO employees (name, salary) VALUES ('Tam', 1000);\nSELECT COUNT(*) FROM names;",
      },
    ],
    exercises: [
      {
        id: 'manager-names',
        prompt: 'Create a view manager_names with two columns: each employee’s name and their manager’s name. Include Lan, who has no manager.',
        solution: 'CREATE VIEW manager_names AS SELECT e.name AS employee, m.name AS manager FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;',
        orderMatters: false,
        probes: ['SELECT * FROM manager_names'],
        hint: 'Put a self join inside CREATE VIEW manager_names AS …. A LEFT JOIN keeps Lan.',
      },
      {
        id: 'big-departments',
        prompt: 'Create a view big_departments listing the names of departments whose total salary is above 10,000.',
        solution:
          'CREATE VIEW big_departments AS SELECT d.name FROM departments d JOIN employees e ON e.department_id = d.id GROUP BY d.id, d.name HAVING SUM(e.salary) > 10000;',
        orderMatters: false,
        probes: ['SELECT * FROM big_departments', "INSERT INTO employees (name, department_id, salary) VALUES ('Tam', 1, 2000); SELECT * FROM big_departments"],
        hint: 'Join departments to employees, group by department, and keep groups with HAVING SUM(salary) > 10000.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Names a query once so it can be reused everywhere', 'Always shows current data', 'Hides complicated joins behind a simple name'],
    cons: ['The query runs every time the view is read', 'A view on top of views can hide how much work a query does', 'Read-only here; changes go to the underlying tables'],
    useWhen: ['The same query is needed in many places', 'You want to give people a simpler picture of the data'],
    avoidWhen: ['The result is needed once (a CTE is enough)', 'The query is slow and read very often (store the result instead)'],
  },
  applications: [
    'A report everyone reads, such as payroll per department',
    'Hiding sensitive columns by exposing only some of them',
    'Giving a long join a short, meaningful name',
    'Keeping old query names working after tables are reorganised',
  ],
  commonMistakes: [
    'Expecting a view to store rows; it stores the query, so it always reflects the current tables.',
    'Trying to INSERT into a view instead of the table it reads.',
    'Naming a view like an existing table.',
    'Forgetting that dropping a table breaks the views that read it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'CREATE VIEW dept_pay has just run. How many rows has it stored?',
      view: scriptViewAt(datasets.company, query, 1),
      options: ['None: it stores the query', '4', '12'],
      answer: 0,
      explanation: 'A view stores only its query. The rows are worked out each time the view is read, as the next statement does.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'Three employees earn more than 6000. What does the last SELECT return?',
      code: "CREATE VIEW well_paid AS\nSELECT name FROM employees WHERE salary > 6000;\nUPDATE employees SET salary = 7000 WHERE name = 'Tuan';\nSELECT COUNT(*) FROM well_paid;",
      options: ['4', '3', 'An error'],
      answer: 0,
      explanation: 'The view’s query runs when it is read, after the UPDATE, so Tuan is counted too.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What does DROP VIEW dept_pay remove?',
      options: ['Only the stored query', 'The query and the employees table', 'Every row of employees'],
      answer: 0,
      explanation: 'A view owns no rows. Dropping it removes the name and its query; the tables it read are untouched.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why can a view never be out of date?',
      options: ['Its query runs again every time it is read', 'The database copies new rows into it', 'Views are refreshed every minute'],
      answer: 0,
      explanation: 'Nothing is copied, so there is nothing to refresh: each read sees the tables as they are.',
    },
  ],
  summary: [
    'CREATE VIEW name AS SELECT … stores a query under a name.',
    'Reading the view runs the query on the current tables.',
    'A view can be selected from, filtered and joined like a table.',
    'Views are read-only here; DROP VIEW removes only the query.',
  ],
};

export default content;
