import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';

const query =
  "CREATE INDEX idx_dept ON employees(department_id);\nEXPLAIN QUERY PLAN\nSELECT e.name, d.name\nFROM departments d\nJOIN employees e ON e.department_id = d.id\nWHERE d.name = 'Sales';";

export const queryPlans: Lesson = {
  id: 'query-plans',
  title: 'Query Plans',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Database internals',
  description: 'Ask the database how it will run a query: which tables it scans, which indexes it searches, and where it sorts.',
  keywords: ['explain', 'explain query plan', 'query plan', 'scan', 'search', 'covering index', 'temp b-tree', 'optimizer', 'performance'],
  prerequisites: ['indexes', 'inner-join'],
  overview:
    'SQL says what you want, not how to get it; the database decides how. EXPLAIN QUERY PLAN shows that decision without running the query: SCAN when a table is read row by row, SEARCH when an index or the row id jumps to the right rows, and USE TEMP B-TREE when rows must be sorted or grouped afterwards.',
  concept: [
    'A query plan is like the route a navigation app picks: same destination, many possible roads. EXPLAIN QUERY PLAN shows the route. Each line is one step, in the order the database takes it.',
    'SCAN t reads every row of t. SEARCH t USING INDEX i (salary>?) walks the index to the matching rows only; the ? stands for the value being looked for. SEARCH t USING INTEGER PRIMARY KEY (rowid=?) finds rows by their id, which every SQLite table is stored by, so no index is needed for that.',
    'COVERING INDEX means the index holds every column the query needs, so the table itself is never read. USE TEMP B-TREE FOR ORDER BY means no index gives the rows in the wanted order, so they are sorted afterwards; an index on the ORDER BY column removes that step.',
    'With a join, the lines are nested loops: for each row of the first table, the second line runs. Searching the inner table by an index makes each loop cheap. The plans here follow SQLite’s rules for the order tables are written in; in this course’s step-by-step view, only indexes you create change how rows are read.',
  ],
  howItWorks: [
    'The database looks at each table in FROM and JOIN, and the conditions on it.',
    'A condition on the row id, or on the leading columns of an index, allows a SEARCH; otherwise the table is SCANned.',
    'If an index holds every column the query needs, it is a COVERING index.',
    'If GROUP BY, DISTINCT or ORDER BY need an order no index gives, a TEMP B-TREE sorts the rows.',
    'EXPLAIN QUERY PLAN prints these decisions as a tree, one line each.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'company',
    initialQuery: query,
    examples: [
      {
        label: 'SCAN, then SEARCH',
        query: 'EXPLAIN QUERY PLAN\nSELECT name FROM employees WHERE salary > 5000;\nCREATE INDEX idx_salary ON employees(salary);\nEXPLAIN QUERY PLAN\nSELECT name FROM employees WHERE salary > 5000;',
      },
      { label: 'Covering index', query: 'CREATE INDEX idx_salary ON employees(salary);\nEXPLAIN QUERY PLAN\nSELECT salary FROM employees WHERE salary > 5000;' },
      {
        label: 'Sorting with an index',
        query: 'CREATE INDEX idx_salary ON employees(salary);\nEXPLAIN QUERY PLAN\nSELECT name FROM employees ORDER BY salary;\nEXPLAIN QUERY PLAN\nSELECT name FROM employees ORDER BY name;',
      },
      { label: 'Lookup by id', query: 'EXPLAIN QUERY PLAN\nSELECT e.name, m.name\nFROM employees e\nJOIN employees m ON m.id = e.manager_id;' },
    ],
    exercises: [
      {
        id: 'covering',
        prompt: 'Create an index that answers SELECT department_id, salary FROM employees WHERE department_id = 2 from the index alone, so its plan says COVERING INDEX.',
        solution: 'CREATE INDEX idx_dept_salary ON employees(department_id, salary);',
        orderMatters: false,
        probes: ['EXPLAIN QUERY PLAN SELECT department_id, salary FROM employees WHERE department_id = 2'],
        hint: 'The index must hold both columns the query reads, with department_id first so the search can use it.',
      },
      {
        id: 'no-temp-btree',
        prompt: 'SELECT name, salary FROM employees ORDER BY salary sorts with a temporary B-tree. Create an index so the rows come out in salary order already.',
        solution: 'CREATE INDEX idx_salary ON employees(salary);',
        orderMatters: false,
        probes: ['EXPLAIN QUERY PLAN SELECT name, salary FROM employees ORDER BY salary'],
        hint: 'An index keeps its values sorted; reading it in order gives the rows in that order.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Shows exactly why a query is slow', 'Costs nothing: the query is not run', 'Confirms that a new index is actually used'],
    cons: ['The wording is terse and specific to each database', 'The best plan can change as the data grows', 'Small tables may be scanned even when an index exists'],
    useWhen: ['A query is slower than expected', 'You add an index and want to check it is used'],
    avoidWhen: ['Guessing at speed-ups without measuring', 'Tiny tables, where every plan is fast'],
  },
  applications: [
    'Finding the full scan that makes a page slow',
    'Checking that a join uses an index on its join column',
    'Removing a sort by adding the right index',
    'Reviewing new queries before they reach production',
  ],
  commonMistakes: [
    'Reading SCAN as an error; on a small table it is often the fastest choice.',
    'Adding an index and not checking the plan to see whether it is used.',
    'Expecting an index on salary to help ORDER BY name.',
    'Forgetting that a join’s inner table is searched once for every outer row.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Line 1 reads every department. What will line 2 do for each of them?',
      view: scriptViewAt(datasets.company, query, 3),
      options: ['Search idx_dept for that department’s employees', 'Read all 12 employees again', 'Sort the employees with a temp B-tree'],
      answer: 0,
      explanation: 'The index on department_id lets each department find its employees directly: SEARCH e USING INDEX idx_dept (department_id=?).',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'There is no index on name. What does the plan say?',
      code: "EXPLAIN QUERY PLAN\nSELECT * FROM employees WHERE name = 'Lan';",
      options: ['SCAN employees', 'SEARCH employees USING INDEX (name=?)', 'SEARCH employees USING INTEGER PRIMARY KEY (rowid=?)'],
      answer: 0,
      explanation: 'Nothing can jump to the name Lan, so every row is read and checked.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What does USE TEMP B-TREE FOR ORDER BY tell you?',
      options: ['The rows are sorted after they are read, because no index gives that order', 'An index is being created', 'The query reads a temporary table the user made'],
      answer: 0,
      explanation: 'A temporary B-tree sorts the rows. An index on the ORDER BY column would make that step unnecessary.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'WHERE id = 3 plans as SEARCH employees USING INTEGER PRIMARY KEY (rowid=?) with no index at all. Why?',
      options: ['An INTEGER PRIMARY KEY is the row id, and the table is stored in row-id order', 'SQLite creates an index on every column', 'Numbers are always searched'],
      answer: 0,
      explanation: 'SQLite keeps each table sorted by its row id, so finding id 3 is already a search.',
    },
    {
      id: 'q5',
      type: 'multiple-choice',
      prompt: 'What does COVERING INDEX mean in a plan?',
      options: ['Every column the query needs is in the index, so the table is not read', 'The index covers every row of the table', 'The index is UNIQUE'],
      answer: 0,
      explanation: 'The index holds the values itself, so fetching the rows from the table is skipped.',
    },
  ],
  summary: [
    'EXPLAIN QUERY PLAN shows how a query will run, without running it.',
    'SCAN reads every row; SEARCH jumps to matching rows by index or row id.',
    'COVERING INDEX skips the table; TEMP B-TREE means an extra sort.',
    'Use the plan to check that an index you add is really used.',
  ],
};
