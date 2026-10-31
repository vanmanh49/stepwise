import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT category, COUNT(*), AVG(price)\nFROM products\nGROUP BY category\nHAVING COUNT(*) > 2;';

const content: LessonContent = {
  overview:
    'GROUP BY splits rows into groups that share a value, and aggregates then summarise each group separately: products per category, orders per customer. HAVING filters those groups, the way WHERE filters rows.',
  concept: [
    'GROUP BY category puts every product with the same category into one group. The result has one row per group instead of one row per product.',
    'After grouping, each group is a single row. You can show the grouped column directly, but any other column must go through an aggregate such as COUNT or AVG, because a group holds many values of it.',
    'WHERE runs before grouping and filters rows. HAVING runs after grouping and filters groups, so it can use aggregates: HAVING COUNT(*) > 2 keeps groups with more than two rows.',
  ],
  howItWorks: [
    'FROM and WHERE produce the rows.',
    'GROUP BY sorts the rows into groups with equal values in the grouped columns; NULLs form one group together.',
    'Each group becomes one row.',
    'HAVING checks its condition on each group and removes the groups where it is not true.',
    'SELECT computes the grouped columns and aggregates for each remaining group.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Orders per customer', query: 'SELECT customer_id, COUNT(*)\nFROM orders\nGROUP BY customer_id;' },
      { label: 'A NULL group', query: 'SELECT city, COUNT(*)\nFROM customers\nGROUP BY city;' },
      { label: 'WHERE and HAVING', query: "SELECT status, COUNT(*)\nFROM orders\nWHERE ordered_on >= '2024-03-01'\nGROUP BY status\nHAVING COUNT(*) > 1;" },
      { label: 'Sort the groups', query: 'SELECT category, MAX(price) AS top\nFROM products\nGROUP BY category\nORDER BY top DESC;' },
    ],
    exercises: [
      {
        id: 'per-category',
        prompt: 'Show each category and the number of products in it.',
        solution: 'SELECT category, COUNT(*) FROM products GROUP BY category;',
        orderMatters: false,
      },
      {
        id: 'pricey-categories',
        prompt: 'List the categories whose average price is above 30.',
        solution: 'SELECT category FROM products GROUP BY category HAVING AVG(price) > 30;',
        orderMatters: false,
        hint: 'The condition is about a group average, so it belongs in HAVING.',
      },
      {
        id: 'repeat-customers',
        prompt: 'Show the customer ids with more than one order, and how many orders each has.',
        solution: 'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 1;',
        orderMatters: false,
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Per-group summaries in one query', 'HAVING filters on totals without a second query', 'Combines with ORDER BY to rank groups'],
    cons: ['Every selected column must be grouped or aggregated', 'Easy to confuse WHERE and HAVING'],
    useWhen: ['You need a total or count per category, customer or day', 'You want only groups whose total meets a condition'],
    avoidWhen: ['You need the individual rows, not summaries', 'One overall total is enough (no GROUP BY needed)'],
  },
  applications: [
    'Sales per product category',
    'Number of orders per customer, to find loyal customers',
    'Average grade per course',
    'Daily sign-ups for a growth chart',
  ],
  commonMistakes: [
    'Selecting a column that is neither grouped nor aggregated. SQLite and older MySQL quietly pick a value from some row; PostgreSQL and this course reject it.',
    'Filtering on an aggregate in WHERE instead of HAVING.',
    'Filtering rows in HAVING that WHERE could have removed earlier, which makes the database group more rows than needed.',
    'Forgetting that NULL values form their own group.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'There are three groups: Books (3 products), Electronics (4) and Kitchen (2). Which groups will HAVING COUNT(*) > 2 keep?',
      view: viewAt(datasets.shop, query, 3),
      options: ['Books and Electronics', 'Only Electronics', 'All three'],
      answer: 0,
      explanation: 'HAVING checks each group: 3 > 2 and 4 > 2 are true, 2 > 2 is false, so Kitchen is removed.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many rows does this return? (Cities: Hanoi ×3, Hue ×2, Da Nang ×2, Can Tho ×1, and two NULLs.)',
      code: 'SELECT city, COUNT(*)\nFROM customers\nGROUP BY city;',
      options: ['5', '4', '10'],
      answer: 0,
      explanation: 'Four cities plus one group for the NULL cities: GROUP BY treats NULLs as one group.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which clause can filter on COUNT(*)?',
      options: ['HAVING', 'WHERE', 'FROM'],
      answer: 0,
      explanation: 'WHERE runs before rows are grouped, so nothing has been counted yet. HAVING runs after grouping.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why is SELECT category, name, COUNT(*) FROM products GROUP BY category rejected?',
      options: [
        'Each category group holds several names, so name must be grouped or aggregated',
        'COUNT(*) cannot be used with GROUP BY, only with a plain SELECT',
        'name is a reserved word, so it has to be written in quotes',
      ],
      answer: 0,
      explanation: 'A group becomes one row, and one row cannot show several names. Group by name too, or use an aggregate such as MIN(name).',
    },
  ],
  summary: [
    'GROUP BY makes one row per group of equal values.',
    'Other columns must be read through aggregates such as COUNT, SUM or AVG.',
    'HAVING filters groups after grouping; WHERE filters rows before it.',
    'NULLs in the grouped column form one group.',
  ],
};

export default content;
