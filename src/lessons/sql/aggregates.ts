import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = 'SELECT COUNT(*), AVG(price), MAX(price)\nFROM products;';

const content: LessonContent = {
  overview:
    'Aggregate functions turn many rows into one value: how many products there are, their average price, the most expensive one. A query with aggregates and no GROUP BY returns exactly one row that summarises all the rows WHERE kept.',
  concept: [
    'COUNT counts, SUM adds, AVG averages, and MIN and MAX find the smallest and largest value. Each one reads a whole column of rows and produces a single value.',
    'COUNT(*) counts rows. COUNT(city) counts only rows where city is not NULL, and COUNT(DISTINCT city) counts different cities.',
    'Every aggregate except COUNT ignores NULLs. With no rows at all, COUNT gives 0 and the others give NULL.',
  ],
  howItWorks: [
    'FROM and WHERE decide which rows take part.',
    'All of those rows form a single group.',
    'Each aggregate in SELECT reads its column across the whole group, skipping NULLs.',
    'SELECT produces one output row holding the results.',
    'Plain columns next to an aggregate are not allowed, because one row cannot show every product name.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Count with a filter', query: "SELECT COUNT(*)\nFROM orders\nWHERE status = 'shipped';" },
      { label: 'COUNT and NULL', query: 'SELECT COUNT(*), COUNT(city), COUNT(DISTINCT city)\nFROM customers;' },
      { label: 'Total quantity', query: 'SELECT SUM(quantity), MIN(quantity), MAX(quantity)\nFROM order_items;' },
    ],
    exercises: [
      {
        id: 'count-customers',
        prompt: 'How many customers are there?',
        solution: 'SELECT COUNT(*) FROM customers;',
        orderMatters: false,
      },
      {
        id: 'avg-price',
        prompt: 'What is the average product price?',
        solution: 'SELECT AVG(price) FROM products;',
        orderMatters: false,
      },
      {
        id: 'with-city',
        prompt: 'How many customers have a city recorded?',
        solution: 'SELECT COUNT(city) FROM customers;',
        orderMatters: false,
        hint: 'COUNT(column) skips NULLs; COUNT(*) does not.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['The database does the arithmetic next to the data, so only one row travels back', 'Handles NULLs consistently', 'Combines with WHERE to summarise any subset'],
    cons: ['One row for everything; per-category totals need GROUP BY', 'AVG of integers is a decimal, which can surprise code that expects whole numbers'],
    useWhen: ['You need a total, count, average or extreme value', 'You want a quick sanity check on a table'],
    avoidWhen: ['You need one result per category or customer (use GROUP BY)', 'You need the row that holds the maximum, not just the value (use ORDER BY … LIMIT 1 or a subquery)'],
  },
  applications: [
    'Dashboard numbers: total orders, revenue, average basket size',
    'Checking how many rows a filter would affect before changing data',
    'Finding the earliest and latest dates in a log',
  ],
  commonMistakes: [
    'Mixing a plain column with an aggregate, such as SELECT name, MAX(price); use ORDER BY price DESC LIMIT 1 to get the name.',
    'Using COUNT(column) when you meant to count rows; it skips NULLs.',
    'Putting an aggregate in WHERE, which runs before anything is counted; use HAVING.',
    'Expecting SUM of no rows to be 0; it is NULL.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'FROM has loaded all 9 products. What will SELECT COUNT(*), AVG(price), MAX(price) produce?',
      view: viewAt(datasets.shop, query, 1),
      options: ['One row: 9, the average price, and 59.9', 'Nine rows, one per product', 'An error, because there is no GROUP BY'],
      answer: 0,
      explanation: 'Without GROUP BY, all rows form one group, and each aggregate turns that group into a single value.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'Ten customers exist and two have no city. What does this return?',
      code: 'SELECT COUNT(*), COUNT(city)\nFROM customers;',
      options: ['10 and 8', '10 and 10', '8 and 8'],
      answer: 0,
      explanation: 'COUNT(*) counts rows; COUNT(city) skips the two rows where city is NULL.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What does SUM(price) return when WHERE kept no rows?',
      options: ['NULL', '0', 'An error'],
      answer: 0,
      explanation: 'With nothing to add, SUM has no value to report, so it returns NULL. COUNT is the exception and returns 0.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why is SELECT name, MAX(price) FROM products rejected here?',
      options: [
        'MAX makes one row, but name has 9 different values to choose from',
        'MAX only works on text columns',
        'Aggregates must come before plain columns',
      ],
      answer: 0,
      explanation: 'One output row cannot hold nine names. SQLite would quietly pick one; most databases, and this course, reject it.',
    },
  ],
  summary: [
    'COUNT, SUM, AVG, MIN and MAX turn many rows into one value.',
    'Without GROUP BY, all rows WHERE kept form a single group and the result is one row.',
    'Aggregates skip NULLs; COUNT(*) counts rows, COUNT(column) counts non-NULL values.',
    'With no rows, COUNT is 0 and the other aggregates are NULL.',
  ],
};

export default content;
