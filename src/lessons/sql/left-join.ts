import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id;';

const content: LessonContent = {
  overview:
    'LEFT JOIN works like INNER JOIN, with one difference: every row of the left table appears in the result, even when nothing in the right table matches it. For those rows, the right table’s columns are NULL.',
  concept: [
    'Ask for every customer with their orders and an INNER JOIN quietly drops customers who never ordered. LEFT JOIN keeps them, filling the order columns with NULL.',
    'The "left" table is the one written first, after FROM. The right table is the one after LEFT JOIN.',
    'Because unmatched rows have NULLs, WHERE o.id IS NULL finds exactly the left rows with no partner: customers who never ordered.',
  ],
  howItWorks: [
    'Each left row is tested against every right row, as in an INNER JOIN.',
    'Every pair where ON is true becomes a result row.',
    'If a left row matched nothing, it is added once with NULL in every right-table column.',
    'WHERE then runs on the joined rows; a condition on a right-table column removes the NULL rows unless it allows NULL.',
    'Put conditions about the right table in ON to filter partners while still keeping every left row.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Never ordered', query: 'SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.id IS NULL;' },
      { label: 'Condition in ON', query: "SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'pending';" },
      { label: 'Condition in WHERE', query: "SELECT c.name, o.id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.status = 'pending';" },
      { label: 'Count per customer', query: 'SELECT c.name, COUNT(o.id)\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.name;' },
    ],
    exercises: [
      {
        id: 'all-customers',
        prompt: 'List every customer name with their order ids, including customers with no orders.',
        solution: 'SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;',
        orderMatters: false,
      },
      {
        id: 'never-ordered',
        prompt: 'List the names of customers who have never ordered.',
        solution: 'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;',
        orderMatters: false,
        hint: 'After a LEFT JOIN, unmatched customers have NULL order columns.',
      },
      {
        id: 'qty-per-product',
        prompt: 'List every product name with its total quantity ordered, including products never ordered.',
        solution: 'SELECT p.name, SUM(oi.quantity) FROM products p LEFT JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name;',
        orderMatters: false,
        hint: 'LEFT JOIN products to order_items, then group by product.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Never loses rows of the main table', 'Finds missing relationships with IS NULL', 'Counts that include zero, such as customers with 0 orders'],
    cons: ['A WHERE condition on the right table can silently turn it back into an inner join', 'NULLs in the result need handling in reports'],
    useWhen: ['Every row of the main table must appear', 'You want rows that have no partner'],
    avoidWhen: ['You only want rows that have a partner (INNER JOIN is clearer)'],
  },
  applications: [
    'Customers and their order count, including customers with none',
    'Products that have never been sold',
    'Courses with their enrolment numbers, including empty courses',
    'Finding records whose related data is missing',
  ],
  commonMistakes: [
    "Filtering the right table in WHERE (WHERE o.status = 'pending'), which removes the NULL rows and undoes the LEFT JOIN; move the condition into ON.",
    'Using COUNT(*) per customer after a LEFT JOIN, which counts 1 for customers with no orders; count a right-table column such as COUNT(o.id).',
    'Swapping the tables: the table that must keep all its rows goes first.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'FROM has loaded 10 customers. Customers 1, 2 and 3 have 3, 2 and 2 orders, five others have 1, and two have none. How many rows will the LEFT JOIN produce?',
      view: viewAt(datasets.shop, query, 1),
      options: ['14', '12', '10'],
      answer: 0,
      explanation: 'The 12 matched pairs, plus one row each for the two customers with no orders: 14.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this return?',
      code: 'SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.id IS NULL;',
      options: ['Customers who have never ordered', 'Orders with no customer', 'Every customer'],
      answer: 0,
      explanation: 'Only the customers with no matching order get NULL in o.id, so IS NULL picks exactly them.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: "Why does adding WHERE o.status = 'pending' remove the customers with no orders?",
      options: [
        'Their o.status is NULL, and NULL = \'pending\' is unknown, so WHERE drops them',
        'LEFT JOIN cannot be combined with WHERE',
        'pending orders belong to other customers',
      ],
      answer: 0,
      explanation: 'WHERE runs after the join. Move the condition into ON to keep every customer.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which table keeps all its rows in FROM customers c LEFT JOIN orders o?',
      options: ['customers', 'orders', 'Both'],
      answer: 0,
      explanation: 'The left table is the one written first. Every customer appears; orders appear only when they match.',
    },
  ],
  summary: [
    'LEFT JOIN keeps every row of the left table.',
    'Unmatched left rows get NULL in every right-table column.',
    'WHERE right_column IS NULL finds rows with no partner.',
    'Conditions on the right table usually belong in ON, not WHERE.',
  ],
};

export default content;
