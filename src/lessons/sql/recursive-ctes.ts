import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query =
  'WITH RECURSIVE chart(id, name, level) AS (\n  SELECT id, name, 1 FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.id, e.name, c.level + 1\n  FROM employees e\n  JOIN chart c ON e.manager_id = c.id\n)\nSELECT name, level FROM chart;';

const content: LessonContent = {
  overview:
    'A recursive CTE refers to itself. It starts from a few rows, the anchor, and then keeps adding the rows it can reach from the rows it found last time, until a round finds nothing new. It answers questions such as "everyone under this manager, at any depth" in one query.',
  concept: [
    'Think of passing a message down an organisation. The boss hears it first. In round 1, everyone who reports to the boss hears it. In round 2, everyone who reports to those people hears it, and so on, until a round reaches nobody new.',
    'WITH RECURSIVE name AS (anchor UNION ALL recursive part) has two halves. The anchor is an ordinary SELECT that gives the starting rows. The recursive part joins the table to name itself, and in each round it sees only the rows added in the round before.',
    'The recursion stops when a round adds no rows. A WHERE in the recursive part, such as WHERE x < 10, is often what makes that happen. Without one, a query that keeps producing rows never ends; Stepwise stops it and says so.',
    'With UNION instead of UNION ALL, rows already found are not added again. That also stops a walk that goes round in a circle, because the repeated rows count as nothing new.',
  ],
  howItWorks: [
    'The anchor SELECT runs once; its rows are the start.',
    'The recursive SELECT runs using only the rows added in the previous round.',
    'Its rows are added to the CTE (UNION also drops rows already there).',
    'The previous step repeats until a round adds no rows.',
    'The main query then reads all the rows the CTE collected.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      {
        label: 'Numbers 1 to 10',
        query: 'WITH RECURSIVE numbers(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM numbers WHERE n < 10\n)\nSELECT n FROM numbers;',
      },
      {
        label: 'Managers above Bao',
        query:
          "WITH RECURSIVE up(id, name, manager_id) AS (\n  SELECT id, name, manager_id FROM employees WHERE name = 'Bao'\n  UNION ALL\n  SELECT e.id, e.name, e.manager_id\n  FROM employees e\n  JOIN up u ON e.id = u.manager_id\n)\nSELECT name FROM up;",
      },
      {
        label: 'UNION stops repeats',
        query: 'WITH RECURSIVE cycle(n) AS (\n  SELECT 1\n  UNION\n  SELECT n % 3 + 1 FROM cycle\n)\nSELECT n FROM cycle;',
      },
    ],
    exercises: [
      {
        id: 'under-minh',
        prompt: 'List the names of everyone who works under Minh (id 2), directly or through other managers.',
        solution:
          'WITH RECURSIVE under(id, name) AS (SELECT id, name FROM employees WHERE manager_id = 2 UNION ALL SELECT e.id, e.name FROM employees e JOIN under u ON e.manager_id = u.id) SELECT name FROM under;',
        orderMatters: false,
        hint: 'Start from Minh’s direct reports, then repeatedly add the people who report to someone already found.',
      },
      {
        id: 'above-bao',
        prompt: 'List the names of every manager above Bao, all the way to the top. Do not include Bao.',
        solution:
          "WITH RECURSIVE up(id, name, manager_id) AS (SELECT id, name, manager_id FROM employees WHERE name = 'Bao' UNION ALL SELECT e.id, e.name, e.manager_id FROM employees e JOIN up u ON e.id = u.manager_id) SELECT name FROM up WHERE name <> 'Bao';",
        orderMatters: false,
        hint: 'Start from Bao and, each round, join to the employee whose id is the manager_id you just found.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Walks a hierarchy of any depth in one query', 'Can generate series of numbers or dates', 'The level or path can be built up as it goes'],
    cons: ['A missing stop condition makes it run forever', 'Harder to read than a plain join', 'Each round joins again, which can be slow on big trees'],
    useWhen: ['The data is a tree or chain, such as managers, categories or folders', 'You do not know how many levels deep it goes'],
    avoidWhen: ['There is a fixed, small number of levels (a self join is simpler)'],
  },
  applications: [
    'Org charts: everyone under a manager',
    'Category trees: a category and all its subcategories',
    'Finding every part needed to build a product',
    'Generating a calendar of dates to join reports against',
  ],
  commonMistakes: [
    'Forgetting RECURSIVE, so the CTE cannot refer to itself.',
    'Leaving out the condition that ends the recursion, such as WHERE n < 10.',
    'Joining in the wrong direction: e.manager_id = c.id walks down, e.id = c.manager_id walks up.',
    'Using UNION ALL on data with cycles, so the same rows are found again and again.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Round 1 found Minh, Hoa and Thu, who report to Lan. Tuan and Vy report to Minh, Linh and Quang to Hoa, and nobody to Thu. How many rows will round 2 add?',
      view: viewAt(datasets.company, query, 1),
      options: ['4', '3', '8'],
      answer: 0,
      explanation: 'Round 2 reads only the rows from round 1 and finds their reports: Tuan, Vy, Linh and Quang.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many rows does this return?',
      code: 'WITH RECURSIVE n(x) AS (\n  SELECT 1\n  UNION ALL\n  SELECT x + 2 FROM n WHERE x < 7\n)\nSELECT x FROM n;',
      options: ['4', '7', '3'],
      answer: 0,
      explanation: 'It produces 1, 3, 5 and 7. For x = 7, x < 7 is false, so that round adds nothing and the recursion stops.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'When does a recursive CTE stop?',
      options: ['When a round adds no new rows', 'After 10 rounds', 'When the anchor returns no rows a second time'],
      answer: 0,
      explanation: 'Each round works only on the rows from the round before. When a round finds nothing, there is nothing left to build on.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which join condition walks up from an employee to their managers?',
      options: ['e.id = u.manager_id', 'e.manager_id = u.id', 'e.id = u.id'],
      answer: 0,
      explanation: 'Each round looks for the employee whose id is the manager_id of a row already found: the next manager up.',
    },
  ],
  summary: [
    'WITH RECURSIVE lets a CTE read its own rows.',
    'The anchor gives the starting rows; the recursive part adds rows reached from the last round.',
    'It stops when a round adds nothing, so make sure something ends it.',
    'UNION drops rows already found, which also stops cycles.',
  ],
};

export default content;
