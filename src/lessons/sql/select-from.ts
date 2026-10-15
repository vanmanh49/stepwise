import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT name, price\nFROM products;';

export const selectFrom: Lesson = {
  id: 'select-from',
  title: 'SELECT and FROM',
  category: 'sql',
  difficulty: 'beginner',
  group: 'Querying',
  description: 'Read columns from a table: the first query everyone writes.',
  keywords: ['select', 'from', 'columns', 'alias', 'as', 'star', 'query'],
  prerequisites: [],
  overview:
    'Every SQL query that reads data starts with two clauses. FROM names the table to read, and SELECT says which columns you want back. Together they turn a whole table into exactly the columns you asked for.',
  concept: [
    'A table is a grid: each row is one thing (a product, a customer) and each column is one fact about it (its name, its price). A query describes the grid you want back.',
    'You write SELECT first, but the database runs FROM first. It cannot pick columns until it knows which table they come from. Watching the steps makes this order visible.',
    'SELECT can do more than copy columns. It can rename them with AS and compute new ones, such as price * 2, for every row.',
  ],
  howItWorks: [
    'FROM loads every row of the named table.',
    'SELECT then visits each row and builds an output row from the listed expressions.',
    'A plain column name copies that column; * copies every column.',
    'An expression such as price * 2 is computed for each row, and AS gives the output column a name.',
    'The result has one output row for every input row, in no guaranteed order.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Every column', query: 'SELECT *\nFROM products;' },
      { label: 'Rename a column', query: 'SELECT name AS product, price\nFROM products;' },
      { label: 'Compute a column', query: 'SELECT name, price * 2 AS double_price\nFROM products;' },
      { label: 'Another table', query: 'SELECT name, city\nFROM customers;' },
    ],
    exercises: [
      {
        id: 'names-prices',
        prompt: "List every product's name and price.",
        solution: 'SELECT name, price FROM products;',
        orderMatters: false,
        hint: 'Name both columns after SELECT, separated by a comma.',
      },
      {
        id: 'home-city',
        prompt: "Show each customer's name and city, with the city column named home_city.",
        solution: 'SELECT name, city AS home_city FROM customers;',
        orderMatters: false,
        hint: 'Write AS home_city right after city.',
      },
      {
        id: 'with-tax',
        prompt: "Show each product's name and its price with 20% tax added.",
        solution: 'SELECT name, price * 1.2 FROM products;',
        orderMatters: false,
        hint: 'Adding 20% is the same as multiplying by 1.2.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Readable: it says what you want, not how to get it', 'Works the same way on a table of ten rows or ten million', 'Computed columns save work in application code'],
    cons: ['SELECT * returns columns you may not need', 'Without ORDER BY the row order is not guaranteed'],
    useWhen: ['You need some or all columns of one table', 'You want a derived value, such as a price with tax, for every row'],
    avoidWhen: ['You only need a few rows (add WHERE, covered next)', 'You need data from several tables at once (use JOIN)'],
  },
  applications: [
    'Showing a product list on a shop page',
    'Exporting a table to a spreadsheet',
    'Feeding a report with computed columns such as totals with tax',
    'Checking what a table contains before writing a bigger query',
  ],
  commonMistakes: [
    'Forgetting the comma between columns: SELECT name price reads as a syntax error, or in some databases as an alias.',
    'Using SELECT * in application code, then breaking when someone adds a column.',
    'Expecting rows in a particular order without ORDER BY.',
    'Writing the clauses in the wrong order: FROM must come after the column list.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'FROM has loaded all 9 products. What does the next step do?',
      view: viewAt(datasets.shop, query, 1),
      options: [
        'SELECT keeps only the name and price columns',
        'SELECT removes the cheapest products',
        'The rows are sorted by name',
        'Nothing; FROM is the last clause',
      ],
      answer: 0,
      explanation: 'SELECT runs after FROM and builds each output row from the listed columns. It never removes rows; that is WHERE’s job.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many columns does this query return?',
      code: 'SELECT name, price * 2 AS double_price, category\nFROM products;',
      options: ['3', '2', '4'],
      answer: 0,
      explanation: 'Each comma-separated item in the SELECT list is one output column: name, double_price and category.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which clause does the database run first, even though it is written second?',
      options: ['FROM', 'SELECT', 'Both at the same time'],
      answer: 0,
      explanation: 'The database must know which table it is reading before it can pick columns from it, so FROM runs first.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does SELECT * FROM products return?',
      options: ['Every column of every product', 'Only rows whose value is a star', 'Only the first column'],
      answer: 0,
      explanation: 'The star means "all columns". Every row is still returned because there is no WHERE clause.',
    },
  ],
  summary: [
    'FROM picks the table; SELECT picks or computes the columns.',
    'FROM runs first, even though SELECT is written first.',
    'AS renames an output column, and expressions like price * 2 are computed per row.',
    'Without ORDER BY, rows come back in no guaranteed order.',
  ],
};
