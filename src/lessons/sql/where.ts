import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT name, price\nFROM products\nWHERE price > 30;';

const content: LessonContent = {
  overview:
    'WHERE filters rows. It checks a condition against every row that FROM produced and keeps only the rows where the condition is true. Everything after WHERE sees only the rows it kept.',
  concept: [
    'Think of WHERE as a gate. Each row walks up to it, the condition is checked with that row’s values, and the row passes only if the answer is true.',
    'Conditions compare values with =, <>, <, <=, > and >=, and combine with AND, OR and NOT. BETWEEN, IN and LIKE are shortcuts for common comparisons.',
    'WHERE runs after FROM and before SELECT. It filters whole rows; it does not change which columns you get back.',
  ],
  howItWorks: [
    'FROM loads every row of the table.',
    'For each row, WHERE evaluates the condition using that row’s column values.',
    'If the condition is true, the row is kept; if it is false, the row is removed.',
    'AND needs both sides true, OR needs at least one, and NOT flips the result.',
    'SELECT then builds output rows from the rows that were kept.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Exact match', query: "SELECT name\nFROM products\nWHERE category = 'Books';" },
      { label: 'Two conditions', query: "SELECT name, price\nFROM products\nWHERE category = 'Electronics' AND price < 20;" },
      { label: 'A range', query: 'SELECT name, price\nFROM products\nWHERE price BETWEEN 10 AND 30;' },
      { label: 'A pattern', query: "SELECT name\nFROM customers\nWHERE name LIKE 'A%';" },
    ],
    exercises: [
      {
        id: 'books',
        prompt: 'List the names of products in the Books category.',
        solution: "SELECT name FROM products WHERE category = 'Books';",
        orderMatters: false,
        hint: "Text values go in single quotes: 'Books'.",
      },
      {
        id: 'price-range',
        prompt: 'List the name and price of products costing from 10 to 50, inclusive.',
        solution: 'SELECT name, price FROM products WHERE price BETWEEN 10 AND 50;',
        orderMatters: false,
        hint: 'BETWEEN includes both ends.',
      },
      {
        id: 'starts-a',
        prompt: 'List the names of customers whose name starts with A.',
        solution: "SELECT name FROM customers WHERE name LIKE 'A%';",
        orderMatters: false,
        hint: '% in a LIKE pattern matches any run of characters.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Returns only what you need, so less data travels to your app', 'Databases can use indexes to skip non-matching rows', 'Conditions read almost like English'],
    cons: ['Long chains of AND and OR are easy to get wrong without parentheses', 'NULL values make conditions unknown, which silently removes rows (see the next lesson)'],
    useWhen: ['You want rows that meet a condition', 'You want to narrow a table before sorting or summarising it'],
    avoidWhen: ['The condition is about a group total, such as "categories with more than 3 products" (use HAVING)'],
  },
  applications: [
    'Search filters on a shop page: category, price range, in stock',
    'Finding orders that are still pending',
    'Looking up one customer by id',
    'Cleaning data by finding rows with suspicious values',
  ],
  commonMistakes: [
    'Mixing AND and OR without parentheses: a OR b AND c means a OR (b AND c).',
    "Comparing text with the wrong case: in SQLite, 'books' = 'Books' is false.",
    'Writing = NULL instead of IS NULL; = NULL is never true.',
    'Putting an aggregate such as COUNT(*) in WHERE; group conditions belong in HAVING.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'WHERE price > 30 has just kept Data Atlas (42). Row 3 is Poetry Pocket at 8.75. What happens to it?',
      view: viewAt(datasets.shop, query, 3),
      options: ['It is removed', 'It is kept', 'WHERE stops checking rows'],
      answer: 0,
      explanation: '8.75 > 30 is false, so WHERE removes the row. WHERE always checks every row.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'Which products does this return?',
      code: "SELECT name\nFROM products\nWHERE category = 'Kitchen' OR price < 7;",
      options: ['Teapot, Chef Knife and USB Cable', 'Only USB Cable', 'Only Teapot and Chef Knife'],
      answer: 0,
      explanation: 'OR keeps a row when either side is true: both Kitchen products, plus USB Cable at 6.5.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which prices does WHERE price BETWEEN 10 AND 30 keep?',
      options: ['Prices from 10 to 30, including both 10 and 30', 'Prices above 10 and below 30 only', 'Only the prices 10 and 30'],
      answer: 0,
      explanation: 'BETWEEN is inclusive: it means price >= 10 AND price <= 30.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: "WHERE category = 'books' returns no rows, but 'Books' works. Why?",
      options: ['Comparing text with = is case-sensitive', 'WHERE cannot compare text', 'The table has no category column'],
      answer: 0,
      explanation: "In SQLite and most databases, = compares text exactly, so 'books' and 'Books' are different values.",
    },
  ],
  summary: [
    'WHERE keeps only the rows where its condition is true.',
    'It runs after FROM and before SELECT, so it filters rows, not columns.',
    'Combine conditions with AND, OR and NOT, and use parentheses when you mix them.',
    'BETWEEN, IN and LIKE are shortcuts for ranges, lists and text patterns.',
  ],
};

export default content;
