import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = "SELECT customer_id FROM orders WHERE status = 'shipped'\nUNION\nSELECT customer_id FROM orders WHERE status = 'pending';";

export const setOperations: Lesson = {
  id: 'set-operations',
  title: 'UNION, INTERSECT, EXCEPT',
  category: 'sql',
  difficulty: 'intermediate',
  group: 'Advanced querying',
  description: 'Combine the results of two SELECTs: everything from both, only what both share, or what one has and the other lacks.',
  keywords: ['union', 'union all', 'intersect', 'except', 'minus', 'set operations', 'combine queries', 'difference'],
  prerequisites: ['distinct', 'where'],
  overview:
    'Set operations stack the results of two SELECTs into one. UNION keeps rows that appear in either, INTERSECT keeps rows that appear in both, and EXCEPT keeps rows of the first that are not in the second. Both SELECTs must return the same number of columns.',
  concept: [
    'Picture two guest lists. UNION merges them into one list without writing anyone twice. INTERSECT keeps only the people on both lists. EXCEPT crosses off everyone on the second list from the first.',
    'UNION, INTERSECT and EXCEPT remove duplicate rows, like DISTINCT. UNION ALL keeps every row from both sides, repeats included; it is also less work, because nothing has to be compared.',
    'Rows are compared column by column, by position, not by name. The result takes its column names from the first SELECT. Two rows count as the same even when both hold NULL in a column.',
    'ORDER BY and LIMIT go at the very end and sort the combined result. They can name the first SELECT’s columns or use positions such as ORDER BY 1.',
  ],
  howItWorks: [
    'The left SELECT runs and produces its rows.',
    'The right SELECT runs and produces its rows, with the same number of columns.',
    'UNION ALL stacks both; UNION also drops repeated rows.',
    'INTERSECT keeps rows found on both sides; EXCEPT keeps left rows not found on the right.',
    'A final ORDER BY or LIMIT applies to the combined result.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      {
        label: 'UNION ALL keeps repeats',
        query: "SELECT customer_id FROM orders WHERE status = 'shipped'\nUNION ALL\nSELECT customer_id FROM orders WHERE status = 'pending';",
      },
      {
        label: 'INTERSECT',
        query: "SELECT customer_id FROM orders WHERE status = 'shipped'\nINTERSECT\nSELECT customer_id FROM orders WHERE status = 'pending';",
      },
      {
        label: 'EXCEPT',
        query: "SELECT id FROM customers\nEXCEPT\nSELECT customer_id FROM orders;",
      },
      {
        label: 'ORDER BY the whole result',
        query: "SELECT name, 'customer' AS kind FROM customers WHERE city = 'Hanoi'\nUNION\nSELECT name, 'product' FROM products WHERE price > 40\nORDER BY name;",
      },
    ],
    exercises: [
      {
        id: 'never-cancelled',
        prompt: 'List the ids of customers who have placed an order but never had an order cancelled.',
        solution: "SELECT customer_id FROM orders EXCEPT SELECT customer_id FROM orders WHERE status = 'cancelled';",
        orderMatters: false,
        hint: 'Start with every customer_id in orders, then take away the ones with a cancelled order.',
      },
      {
        id: 'all-names',
        prompt: 'Make one list of all customer names and product names, with no repeats.',
        solution: 'SELECT name FROM customers UNION SELECT name FROM products;',
        orderMatters: false,
        hint: 'Two SELECTs of one column each, joined by UNION.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Combines results from different queries or tables', 'INTERSECT and EXCEPT express "both" and "but not" directly', 'UNION removes duplicates for you'],
    cons: ['Both sides must have the same number of columns', 'Columns are matched by position, so a wrong order mixes data silently', 'Removing duplicates costs extra work on big results'],
    useWhen: ['Rows come from two different sources or conditions', 'You want rows in both, or in one but not the other'],
    avoidWhen: ['One SELECT with OR in WHERE says the same thing', 'You need columns from both sides in one row (use a JOIN)'],
  },
  applications: [
    'Merging current and archived records into one list',
    'Finding customers who bought in both of two years',
    'Finding products never ordered',
    'Building one search result from several tables',
  ],
  commonMistakes: [
    'Using UNION when repeats matter, such as when adding amounts; use UNION ALL.',
    'Listing columns in a different order on each side, so values land in the wrong column.',
    'Putting ORDER BY on the first SELECT; it belongs at the end and sorts everything.',
    'Expecting JOIN-like rows: set operations stack rows, they do not put columns side by side.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The left SELECT returned 7 rows and the right SELECT 3. Together they hold 6 different customer ids. How many rows will UNION return?',
      view: viewAt(datasets.shop, query, 2),
      options: ['6', '10', '3'],
      answer: 0,
      explanation: 'UNION keeps each different row once, so the 10 rows shrink to the 6 different ids.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this return?',
      code: 'SELECT id FROM customers\nEXCEPT\nSELECT customer_id FROM orders;',
      options: ['Customers who have never ordered', 'Customers who have ordered', 'Orders with no customer'],
      answer: 0,
      explanation: 'EXCEPT takes every customer id and removes the ones that appear in orders.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the difference between UNION and UNION ALL?',
      options: ['UNION removes repeated rows; UNION ALL keeps them', 'UNION ALL removes repeated rows; UNION keeps them', 'UNION ALL can combine more than two SELECTs'],
      answer: 0,
      explanation: 'UNION ALL simply stacks both results. UNION also drops rows that appear more than once.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What happens to SELECT id, name FROM customers UNION SELECT id FROM products?',
      options: ['It fails because the two sides have different numbers of columns', 'name is NULL for the products', 'Only the id column is kept'],
      answer: 0,
      explanation: 'Every SELECT in a set operation must return the same number of columns.',
    },
  ],
  summary: [
    'UNION combines two results and removes repeats; UNION ALL keeps them.',
    'INTERSECT keeps rows in both results; EXCEPT keeps rows of the first not in the second.',
    'Both SELECTs need the same number of columns, matched by position.',
    'ORDER BY and LIMIT at the end apply to the combined result.',
  ],
};
