import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT e.name, m.name AS manager\nFROM employees e\nLEFT JOIN employees m ON m.id = e.manager_id;';

const content: LessonContent = {
  overview:
    'A self join joins a table to itself. You list the table twice with two different aliases, and the database treats them as two copies. It is how you connect rows to other rows of the same table, such as each employee to the employee who manages them.',
  concept: [
    'In employees, manager_id holds the id of another employee. To show a manager’s name next to each employee, you need two employees at once: the one you are looking at and their manager. FROM employees e JOIN employees m gives you both.',
    'The aliases are what make it work. e and m name the same table, but each row pair has one row from each copy, so e.name and m.name can be different people. Without aliases, the database could not tell the two copies apart.',
    'Everything you know about joins still applies. An INNER JOIN drops employees with no manager; a LEFT JOIN keeps them with NULL in the manager’s columns. The ON condition can be anything, such as m.id = e.manager_id for managers or a.department_id = b.department_id for colleagues.',
  ],
  howItWorks: [
    'FROM lists the table with one alias, such as employees e.',
    'JOIN lists the same table again with another alias, such as employees m.',
    'Each row of e is tested against each row of m with the ON condition, as in any join.',
    'Matching pairs become result rows; with LEFT JOIN, rows of e with no match are kept with NULLs.',
    'SELECT and WHERE use the aliases to say which copy each column comes from.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      { label: 'Inner version', query: 'SELECT e.name, m.name AS manager\nFROM employees e\nJOIN employees m ON m.id = e.manager_id;' },
      {
        label: 'Same department',
        query: 'SELECT a.name, b.name\nFROM employees a\nJOIN employees b ON a.department_id = b.department_id AND a.id < b.id;',
      },
      {
        label: 'Earns more than manager',
        query: 'SELECT e.name, e.salary, m.name AS manager, m.salary AS manager_salary\nFROM employees e\nJOIN employees m ON m.id = e.manager_id\nWHERE e.salary > m.salary;',
      },
    ],
    exercises: [
      {
        id: 'with-manager',
        prompt: 'List every employee’s name with their manager’s name, including Lan, who has no manager.',
        solution: 'SELECT e.name, m.name FROM employees e LEFT JOIN employees m ON m.id = e.manager_id;',
        orderMatters: false,
        hint: 'An INNER JOIN drops Lan. Which join keeps rows with no match?',
      },
      {
        id: 'hired-before-manager',
        prompt: 'List the names of employees who were hired before their manager.',
        solution: 'SELECT e.name FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.hired < m.hired;',
        orderMatters: false,
        hint: 'Join each employee to their manager, then compare e.hired with m.hired.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Connects rows to other rows of the same table', 'Uses ordinary join syntax', 'Finds pairs, such as colleagues or duplicates'],
    cons: ['Easy to mix up which alias is which', 'Pairing every row with every row grows fast on big tables', 'Only reaches one level; deeper chains need a recursive CTE'],
    useWhen: ['A column points at another row of the same table', 'You need to compare rows of one table with each other'],
    avoidWhen: ['You need every level of a hierarchy (use a recursive CTE)'],
  },
  applications: [
    'Showing each employee with their manager',
    'Finding pairs of customers in the same city',
    'Comparing a product with others in its category',
    'Spotting duplicate rows that share a name or email',
  ],
  commonMistakes: [
    'Forgetting the aliases, so the database cannot tell the two copies apart.',
    'Using INNER JOIN and losing the rows with no partner, such as the boss with no manager.',
    'Pairing rows with themselves, or listing each pair twice; add a.id < b.id.',
    'Reading the ON condition backwards: m.id = e.manager_id makes m the manager of e.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'FROM has loaded the 12 employees. Everyone except Lan has a manager. How many rows will the LEFT JOIN produce?',
      view: viewAt(datasets.company, query, 1),
      options: ['12', '11', '144'],
      answer: 0,
      explanation: 'Each of the 11 employees with a manager matches exactly one row, and Lan is kept once with NULLs: 12.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'In this query, whose salary is m.salary?',
      code: 'SELECT e.name, m.salary\nFROM employees e\nJOIN employees m ON m.id = e.manager_id;',
      options: ['The manager of e', 'The employee e', 'The average salary'],
      answer: 0,
      explanation: 'ON m.id = e.manager_id picks the row of m whose id is e’s manager, so m is the manager.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why does the INNER JOIN version leave Lan out?',
      options: [
        'Her manager_id is NULL, so ON is never true for her',
        'Lan earns the most',
        'A table cannot be joined to itself with INNER JOIN',
      ],
      answer: 0,
      explanation: 'm.id = NULL is unknown for every m, so Lan has no partner and an INNER JOIN drops her.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why add a.id < b.id when pairing colleagues in the same department?',
      options: [
        'To drop each employee paired with themselves and list each pair once',
        'To sort the result by id',
        'Because self joins need an inequality',
      ],
      answer: 0,
      explanation: 'Without it, Minh–Minh appears, and Minh–Tuan appears again as Tuan–Minh.',
    },
  ],
  summary: [
    'A self join lists one table twice with two aliases.',
    'Each alias is a separate copy, so a row can be paired with another row of the same table.',
    'LEFT JOIN keeps rows with no partner, such as the employee with no manager.',
    'a.id < b.id lists each pair once and never pairs a row with itself.',
  ],
};

export default content;
