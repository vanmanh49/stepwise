import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';

const query = 'CREATE INDEX idx_salary ON employees(salary);\nSELECT name, salary FROM employees\nWHERE salary > 5000;';

export const indexes: Lesson = {
  id: 'indexes',
  title: 'Indexes',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Database internals',
  description: 'Build a B-tree over a column so searches jump to the matching rows instead of reading them all.',
  keywords: ['create index', 'b-tree', 'btree', 'index', 'unique index', 'composite index', 'lookup', 'performance', 'full table scan'],
  prerequisites: ['where', 'order-by-limit', 'create-table'],
  overview:
    'Without an index, finding the employees who earn more than 5000 means reading every row. CREATE INDEX builds a B-tree: a sorted, layered structure of the column’s values, each pointing at its row. A search walks down the tree to the first match and reads only the matching rows.',
  concept: [
    'An index is like the index at the back of a book. To find "B-tree" you don’t read every page: you look it up in the sorted index, which tells you the page. CREATE INDEX idx_salary ON employees(salary) builds that sorted list of salaries, each with the row it belongs to.',
    'The list is kept as a B-tree. The bottom level, the leaves, holds every value in order. Each level above holds a few separator values that say which branch below holds which values. A search starts at the root and goes down one level at a time, skipping every branch that can’t hold a match.',
    'Once at the leaves, the search reads along them, because they are linked in order, until it passes the last match. With 12 rows the saving is small; with a million rows, a search reads a handful of nodes instead of a million rows.',
    'An index on two columns, (department_id, salary), is sorted by department and then by salary within each department. It helps WHERE department_id = 2 AND salary > 5000, and WHERE department_id = 2 alone, but not WHERE salary > 5000 on its own, just as a phone book sorted by last name can’t find everyone called Minh. A UNIQUE index also refuses duplicate values.',
  ],
  howItWorks: [
    'CREATE INDEX sorts the column’s values into the leaves of a B-tree, each with its row’s id.',
    'A query whose WHERE compares the indexed column with a value can use the index.',
    'The search goes from the root down to the leaf where the first match would be.',
    'It reads along the linked leaves until a value is past the condition.',
    'Only the rows the matching leaf entries point to are fetched; WHERE still checks them.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      { label: 'Find one name', query: "CREATE INDEX idx_name ON employees(name);\nSELECT * FROM employees WHERE name = 'Khoa';" },
      {
        label: 'Two columns',
        query: 'CREATE INDEX idx_dept_salary\nON employees(department_id, salary);\nSELECT name FROM employees\nWHERE department_id = 2 AND salary > 5000;',
      },
      {
        label: 'Index not usable',
        query: 'CREATE INDEX idx_dept_salary\nON employees(department_id, salary);\nSELECT name FROM employees\nWHERE salary > 5000;',
      },
      { label: 'Fails: UNIQUE index', query: "CREATE UNIQUE INDEX idx_name ON employees(name);\nINSERT INTO employees (name, salary) VALUES ('Lan', 4000);" },
    ],
    exercises: [
      {
        id: 'hired-index',
        prompt: "Create an index so that SELECT name FROM employees WHERE hired > '2020-01-01' searches the index instead of reading every row.",
        solution: 'CREATE INDEX idx_hired ON employees(hired);',
        orderMatters: false,
        probes: ["EXPLAIN QUERY PLAN SELECT name FROM employees WHERE hired > '2020-01-01'", "SELECT name FROM employees WHERE hired > '2020-01-01'"],
        hint: 'The query filters on hired, so index that column.',
      },
      {
        id: 'dept-salary-index',
        prompt: 'Create one index that lets SELECT name FROM employees WHERE department_id = 2 AND salary > 5000 use both conditions in its search.',
        solution: 'CREATE INDEX idx_dept_salary ON employees(department_id, salary);',
        orderMatters: false,
        probes: ['EXPLAIN QUERY PLAN SELECT name FROM employees WHERE department_id = 2 AND salary > 5000'],
        hint: 'A two-column index: the column compared with = first, then the one with the range.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Searches read a few nodes instead of every row', 'Gives rows in order, which can save a sort', 'A UNIQUE index guarantees no duplicates'],
    cons: ['Every INSERT, UPDATE and DELETE must update the index too', 'Takes extra space', 'Only helps queries that compare the leading indexed columns'],
    useWhen: ['A column is searched or joined on often', 'The table is large and queries need only a few of its rows'],
    avoidWhen: ['The table is tiny', 'Most queries read most rows anyway', 'The column is written far more often than it is searched'],
  },
  applications: [
    'Looking up a user by email at log-in',
    'Finding orders of one customer quickly',
    'Keeping usernames unique with a UNIQUE index',
    'Listing recent posts by date without sorting the whole table',
  ],
  commonMistakes: [
    'Indexing every column "just in case", which slows down every write.',
    'Expecting an index on (a, b) to help a search on b alone.',
    'Wrapping the column in an expression (salary + 0 > 5000), which stops the index being used.',
    'Forgetting that a tiny table is read just as fast without an index.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The search is at the root of idx_salary. How many rows will it fetch for salary > 5000?',
      view: scriptViewAt(datasets.company, query, 5),
      options: ['6', '12', '1'],
      answer: 0,
      explanation: 'Six salaries are above 5000 (5200, 5200, 5400, 6500, 7000 and 9000), so only those six rows are read.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'There is an index on (department_id, salary). Which query can search it?',
      code: 'CREATE INDEX i ON employees(department_id, salary);',
      options: ['WHERE department_id = 3', 'WHERE salary > 5000', 'WHERE name = \'Lan\''],
      answer: 0,
      explanation: 'The index is sorted by department_id first, so only conditions on department_id (then salary) can use it.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the cost of adding an index?',
      options: ['Every write must also update the index', 'SELECT queries return different rows', 'The table can no longer be sorted'],
      answer: 0,
      explanation: 'Results never change; but each INSERT, UPDATE and DELETE now has to keep the B-tree in order as well.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why are the leaves of a B-tree linked to each other?',
      options: ['So a range can be read in order without going back up the tree', 'So the tree stays balanced', 'So duplicate values are removed'],
      answer: 0,
      explanation: 'After finding the first match, a range search just follows the links from leaf to leaf until it passes the last match.',
    },
  ],
  summary: [
    'CREATE INDEX name ON table (columns) builds a B-tree of the values.',
    'A search walks from the root to the leaves and fetches only the matching rows.',
    'A multi-column index helps conditions on its leading columns.',
    'Indexes speed up reads but cost space and time on every write.',
  ],
};
