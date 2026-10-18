import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT o.id, c.name\nFROM orders o\nJOIN customers c ON o.customer_id = c.id;';

const content: LessonContent = {
  overview:
    'Data is split across tables so each fact is stored once: an order stores its customer’s id, not the customer’s name. JOIN puts it back together. It pairs rows from two tables and keeps the pairs where the ON condition is true.',
  concept: [
    'orders.customer_id holds the id of a row in customers. Following that link is what a join does: for each order, find the customer whose id matches.',
    'Conceptually, the database tries every pair of rows, one from each table, and keeps the pairs where ON is true. Watch the steps: each order is tested against each customer.',
    'An INNER JOIN (plain JOIN means the same) keeps only matched pairs. A row with no partner disappears from the result; the next lesson, LEFT JOIN, keeps it.',
  ],
  howItWorks: [
    'FROM loads the first table; give it a short alias such as o.',
    'JOIN names the second table and ON gives the matching condition, usually key = key.',
    'Each row of the first table is paired with each row of the second, and ON is checked for the pair.',
    'Pairs where ON is true become rows holding the columns of both tables.',
    'WHERE, SELECT and the rest run on the joined rows; use the aliases to say which table a column comes from.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Join and filter', query: "SELECT o.id, c.name, o.status\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nWHERE o.status = 'pending';" },
      { label: 'Items with products', query: 'SELECT oi.order_id, p.name, oi.quantity\nFROM order_items oi\nJOIN products p ON oi.product_id = p.id;' },
      { label: 'Three tables', query: 'SELECT c.name, p.name\nFROM order_items oi\nJOIN orders o ON oi.order_id = o.id\nJOIN customers c ON o.customer_id = c.id\nJOIN products p ON oi.product_id = p.id\nWHERE o.id = 1;' },
    ],
    exercises: [
      {
        id: 'order-names',
        prompt: "List each order id with its customer's name.",
        solution: 'SELECT orders.id, customers.name FROM orders JOIN customers ON orders.customer_id = customers.id;',
        orderMatters: false,
        hint: 'Match orders.customer_id with customers.id.',
      },
      {
        id: 'order-1-items',
        prompt: 'List the product names and quantities in order 1.',
        solution: 'SELECT p.name, oi.quantity FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = 1;',
        orderMatters: false,
        hint: 'Join order_items to products, then filter on the order id.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Each fact is stored once and combined on demand', 'Any number of tables can be chained', 'Databases use indexes on the keys to make joins fast'],
    cons: ['Unmatched rows silently disappear', 'A wrong ON condition multiplies rows instead of failing'],
    useWhen: ['You need columns from two related tables in one result', 'You only care about rows that have a partner'],
    avoidWhen: ['Rows without a partner must still appear (use LEFT JOIN)', 'You only need to check whether a partner exists (a subquery with IN can be clearer)'],
  },
  applications: [
    'Showing orders with customer names',
    'Listing the products in a shopping basket',
    'Reporting grades with student and course names',
    'Any screen that shows data from more than one table',
  ],
  commonMistakes: [
    'Forgetting ON or matching the wrong columns, which pairs every row with every other row.',
    'Writing a bare id when both tables have an id column; prefix it, such as o.id.',
    'Expecting customers without orders to appear; INNER JOIN drops them.',
    'Using the full table name after giving it an alias; once orders is o, write o.id.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Order 1 belongs to customer 1, so the first pair matched. Which pair does the JOIN check next?',
      view: viewAt(datasets.shop, query, 2),
      options: ['Order 1 with customer 2', 'Order 2 with customer 1', 'None: order 1 found its customer, so it moves on'],
      answer: 0,
      explanation: 'A join checks each row of the first table against every row of the second, so order 1 is tested against customer 2 next.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'Customers 8 and 10 have no orders. How many rows does this return? (There are 12 orders.)',
      code: 'SELECT c.name, o.id\nFROM customers c\nJOIN orders o ON o.customer_id = c.id;',
      options: ['12', '14', '10'],
      answer: 0,
      explanation: 'Every order matches exactly one customer, giving 12 pairs. Customers without orders have no pair, so INNER JOIN drops them.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why does SELECT id FROM orders JOIN customers ON … fail?',
      options: ['Both tables have an id column, so id is ambiguous', 'id is not allowed after JOIN', 'JOIN needs a WHERE clause'],
      answer: 0,
      explanation: 'After the join there are two id columns. Write orders.id or customers.id (or use aliases) to say which.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does an INNER JOIN do with a row that has no matching partner?',
      options: ['Leaves it out of the result', 'Keeps it with NULLs for the other table', 'Stops with an error'],
      answer: 0,
      explanation: 'INNER JOIN keeps only pairs where ON is true. LEFT JOIN is the variant that keeps unmatched rows with NULLs.',
    },
  ],
  summary: [
    'JOIN pairs rows from two tables and keeps the pairs where ON is true.',
    'ON usually matches a foreign key to a primary key, such as o.customer_id = c.id.',
    'INNER JOIN drops rows that have no partner.',
    'Use aliases and table prefixes to keep column names unambiguous.',
  ],
};

export default content;
