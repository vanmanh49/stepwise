import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';

const query = "UPDATE customers SET city = 'Hanoi'\nWHERE id = 4;\nSELECT * FROM customers WHERE id = 4;";

export const update: Lesson = {
  id: 'update',
  title: 'UPDATE',
  category: 'sql',
  difficulty: 'beginner',
  group: 'Modifying data',
  description: 'Change values in rows that already exist, choosing the rows with WHERE.',
  keywords: ['update set', 'change value', 'modify row', 'edit data', 'where', 'bulk update'],
  prerequisites: ['where'],
  overview:
    'UPDATE changes values in existing rows. SET says which columns get which new values, and WHERE picks the rows to change. Without WHERE, every row of the table is changed.',
  concept: [
    'If INSERT writes a new line on a sign-up sheet, UPDATE crosses out a value on lines that are already there and writes a new one. UPDATE customers SET city = \'Hanoi\' WHERE id = 4 changes the city of customer 4 only.',
    'WHERE works exactly as in a SELECT: each row is tested, and only rows where the condition is true are changed. That is why it pays to run the matching SELECT first: the rows it returns are the rows UPDATE will change.',
    'The new value can be any expression, and it may use the row’s current values: SET price = price * 1.1 raises each price by 10%. All the expressions in one SET read the row as it was before the update, so SET a = b, b = a swaps two columns.',
    'Constraints are checked for every changed row. If one change breaks a rule, the whole UPDATE is undone, so a table is never left half-updated.',
  ],
  howItWorks: [
    'UPDATE names the table.',
    'WHERE picks the rows to change; without it, every row is picked.',
    'For each picked row, the SET expressions are worked out from the row’s current values.',
    'The new values are written and the table’s constraints are checked.',
    'If any row breaks a constraint, every change of the statement is undone.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      {
        label: 'Books +10%',
        query: "UPDATE products SET price = price * 1.1\nWHERE category = 'Books';\nSELECT name, price FROM products WHERE category = 'Books';",
      },
      {
        label: 'Several columns',
        query: "UPDATE customers SET city = 'Hue', joined = '2024-01-01'\nWHERE id = 8;\nSELECT * FROM customers WHERE id = 8;",
      },
      { label: 'Forgot WHERE', query: "UPDATE customers SET city = 'Hue';\nSELECT name, city FROM customers;" },
      {
        label: 'From a subquery',
        query: 'UPDATE products SET price = (SELECT MAX(price) FROM products)\nWHERE id = 3;\nSELECT * FROM products WHERE id = 3;',
      },
    ],
    exercises: [
      {
        id: 'ship-pending',
        prompt: 'Mark every pending order as shipped.',
        solution: "UPDATE orders SET status = 'shipped' WHERE status = 'pending';",
        orderMatters: false,
        probes: ['SELECT id, status FROM orders'],
        hint: "SET status = 'shipped', and use WHERE to pick only the pending orders.",
      },
      {
        id: 'unknown-city',
        prompt: "Give every customer with no city the city 'Unknown'.",
        solution: "UPDATE customers SET city = 'Unknown' WHERE city IS NULL;",
        orderMatters: false,
        probes: ['SELECT id, city FROM customers'],
        hint: 'A missing city is NULL, and city = NULL is never true. Use IS NULL.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Changes many rows with one statement', 'New values can be computed from the old ones', 'Constraints keep the changed data valid'],
    cons: ['A missing WHERE changes every row', 'There is no undo once a change is saved (outside a transaction)'],
    useWhen: ['Correcting or changing data that already exists', 'Applying the same change to many rows'],
    avoidWhen: ['Adding new rows (use INSERT)', 'Removing rows (use DELETE)'],
  },
  applications: [
    'Changing an order’s status as it moves from pending to shipped',
    'Applying a price increase to a whole category',
    'Fixing typos or filling in missing values',
    'Marking messages as read',
  ],
  commonMistakes: [
    'Forgetting WHERE, which changes every row in the table.',
    'Writing WHERE city = NULL, which matches nothing; use IS NULL.',
    'Expecting SET a = b, b = a to copy b into both; both read the old row, so it swaps them.',
    'Not running the matching SELECT first to see which rows will change.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This UPDATE is about to run on the customers shown. How many rows will it change?',
      view: scriptViewAt(datasets.shop, query, 0),
      options: ['1', '10', '0'],
      answer: 0,
      explanation: 'WHERE id = 4 matches exactly one customer, so one row changes.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'A row has a = 1 and b = 2. What are a and b afterwards?',
      code: 'UPDATE t SET a = b, b = a;',
      options: ['a = 2, b = 1', 'a = 2, b = 2', 'a = 1, b = 1'],
      answer: 0,
      explanation: 'Every SET expression reads the row as it was before the update, so the values swap.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: "What does UPDATE customers SET city = 'Hue'; do?",
      options: ['Sets every customer’s city to Hue', 'Sets the city of the first customer only', 'Fails because WHERE is missing'],
      answer: 0,
      explanation: 'Without WHERE, every row is picked. Always check that WHERE is there before running an UPDATE.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'An UPDATE changes 5 rows, and the 4th breaks a UNIQUE constraint. What is left in the table?',
      options: ['None of the 5 changes', 'The first 3 changes', 'All 5 changes'],
      answer: 0,
      explanation: 'A failed statement is undone completely, so the table is exactly as it was before the UPDATE.',
    },
  ],
  summary: [
    'UPDATE table SET column = value WHERE condition changes existing rows.',
    'WHERE picks the rows; without it, every row changes.',
    'SET expressions can use the row’s current values, and all read the row as it was.',
    'If any changed row breaks a constraint, the whole UPDATE is undone.',
  ],
};
