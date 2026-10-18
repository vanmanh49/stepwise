import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';

const query = 'DELETE FROM order_items\nWHERE order_id = 3;\nSELECT * FROM order_items;';

export const deleteLesson: Lesson = {
  id: 'delete',
  title: 'DELETE',
  category: 'sql',
  difficulty: 'beginner',
  group: 'Modifying data',
  description: 'Remove rows from a table, choosing them with WHERE, and see how foreign keys protect related rows.',
  keywords: ['delete from', 'remove row', 'where', 'foreign key', 'truncate', 'clean up'],
  prerequisites: ['where'],
  overview:
    'DELETE removes rows from a table. WHERE picks which ones; without WHERE, every row goes. A foreign key can stop a DELETE: a row that other rows still refer to cannot be removed until those rows are gone.',
  concept: [
    'DELETE FROM order_items WHERE order_id = 3 tests every row of order_items and removes the ones where the condition is true. The table itself stays, with its columns and rules; only rows disappear.',
    'Just like UPDATE, DELETE without WHERE affects the whole table: DELETE FROM order_items empties it. Running the matching SELECT first shows exactly which rows will go.',
    'WHERE can use subqueries, which lets you delete rows based on another table: DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = \'cancelled\') removes the items of cancelled orders.',
    'Foreign keys protect relationships. orders.customer_id refers to customers.id, so deleting a customer who still has orders would leave those orders pointing at nobody. The database refuses, and you must delete or change the orders first.',
  ],
  howItWorks: [
    'DELETE FROM names the table.',
    'WHERE is tested on every row; without it, every row is picked.',
    'The picked rows are removed.',
    'At the end of the statement, foreign keys are checked: no remaining row may refer to a removed one.',
    'If a check fails, the DELETE is undone and nothing is removed.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      {
        label: 'With a subquery',
        query: "DELETE FROM order_items\nWHERE product_id IN (SELECT id FROM products WHERE category = 'Kitchen');\nSELECT * FROM order_items;",
      },
      { label: 'Delete everything', query: 'DELETE FROM order_items;\nSELECT COUNT(*) FROM order_items;' },
      { label: 'Fails: customer with orders', query: 'DELETE FROM customers\nWHERE id = 1;' },
    ],
    exercises: [
      {
        id: 'cancelled-items',
        prompt: 'Delete the items of every cancelled order.',
        solution: "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');",
        orderMatters: false,
        probes: ['SELECT * FROM order_items', 'SELECT id, status FROM orders'],
        hint: 'Find the cancelled orders’ ids with a subquery, then use WHERE order_id IN (…).',
      },
      {
        id: 'unsold-products',
        prompt: 'Delete the products that have never been ordered.',
        solution: 'DELETE FROM products WHERE id NOT IN (SELECT product_id FROM order_items);',
        orderMatters: false,
        probes: ['SELECT id FROM products'],
        hint: 'A product has been ordered when its id appears in order_items.product_id.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Removes many rows with one statement', 'WHERE and subqueries pick rows precisely', 'Foreign keys stop you deleting rows that others depend on'],
    cons: ['A missing WHERE empties the table', 'Deleted rows are gone for good once saved (outside a transaction)'],
    useWhen: ['Removing records that are no longer needed', 'Cleaning up test or duplicate data'],
    avoidWhen: ['You might need the rows later; mark them inactive with UPDATE instead', 'You want to change values (use UPDATE)'],
  },
  applications: [
    'Removing items from a shopping cart',
    'Deleting old log entries or expired sessions',
    'Cleaning up rows that a mistake created',
  ],
  commonMistakes: [
    'Forgetting WHERE, which deletes every row.',
    'Deleting a parent row before the child rows that refer to it, which a foreign key refuses.',
    'Using NOT IN with a subquery that can return NULL, which then matches nothing.',
    'Expecting DELETE to remove the table itself; that is DROP TABLE.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This DELETE is about to run on the 18 order items shown. How many rows will it remove?',
      view: scriptViewAt(datasets.shop, query, 0),
      options: ['2', '3', '18'],
      answer: 0,
      explanation: 'Order 3 has two items, so WHERE order_id = 3 matches two rows.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does DELETE FROM customers WHERE id = 1 fail?',
      options: ['Customer 1 still has orders that refer to it', 'Customers can never be deleted', 'WHERE id = 1 matches no row'],
      answer: 0,
      explanation: 'orders.customer_id is a foreign key to customers.id, so removing customer 1 would leave orphan orders.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What is left in order_items afterwards?',
      code: 'DELETE FROM order_items;',
      options: ['An empty table with the same columns', 'Nothing: the table is gone', 'The first row only'],
      answer: 0,
      explanation: 'DELETE without WHERE removes every row but keeps the table. DROP TABLE removes the table itself.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How can you delete customer 1 when they have orders and order items?',
      options: ['Delete their order items, then their orders, then the customer', 'Delete the customer first, then the orders', 'It is impossible'],
      answer: 0,
      explanation: 'Remove child rows before the rows they refer to, working up the chain of foreign keys.',
    },
  ],
  summary: [
    'DELETE FROM table WHERE condition removes the matching rows.',
    'Without WHERE, every row is removed, but the table stays.',
    'WHERE can use subqueries to pick rows using other tables.',
    'Foreign keys stop a row being deleted while other rows still refer to it.',
  ],
};
