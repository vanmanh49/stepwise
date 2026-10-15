import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT DISTINCT city\nFROM customers;';

export const distinct: Lesson = {
  id: 'distinct',
  title: 'DISTINCT',
  category: 'sql',
  difficulty: 'beginner',
  group: 'Querying',
  description: 'Remove duplicate rows from a result.',
  keywords: ['distinct', 'unique', 'duplicates', 'dedupe'],
  prerequisites: ['select-from'],
  overview:
    'DISTINCT removes duplicate rows from a result. Three customers live in Hanoi, but "Which cities do our customers live in?" should list Hanoi once. SELECT DISTINCT does exactly that.',
  concept: [
    'DISTINCT works on whole output rows. Two rows are duplicates only if every selected column matches.',
    'It runs after SELECT has built the output rows, so it compares the columns you selected, not the whole table row.',
    'For DISTINCT, two NULLs count as the same value, so a column with several missing values contributes a single NULL row.',
  ],
  howItWorks: [
    'FROM and WHERE produce the rows as usual.',
    'SELECT builds the output rows with the chosen columns.',
    'DISTINCT walks through them and remembers each row it has seen.',
    'A row identical to one already seen is removed; the first copy is kept.',
    'ORDER BY and LIMIT, if present, run on the de-duplicated rows.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Without DISTINCT', query: 'SELECT city\nFROM customers;' },
      { label: 'Several columns', query: 'SELECT DISTINCT category, price\nFROM products;' },
      { label: 'Sorted', query: 'SELECT DISTINCT status\nFROM orders\nORDER BY status;' },
    ],
    exercises: [
      {
        id: 'cities',
        prompt: 'List every city customers live in, each once.',
        solution: 'SELECT DISTINCT city FROM customers;',
        orderMatters: false,
        hint: 'Put DISTINCT right after SELECT.',
      },
      {
        id: 'statuses',
        prompt: 'List each order status, once.',
        solution: 'SELECT DISTINCT status FROM orders;',
        orderMatters: false,
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['One word turns a list of values into a list of unique values', 'Works on any number of columns'],
    cons: ['The database must compare every row, which costs time on large results', 'Hides the cause when a join accidentally duplicates rows'],
    useWhen: ['You want the set of values a column takes', 'You want unique combinations of a few columns'],
    avoidWhen: ['You also need counts per value (use GROUP BY with COUNT)', 'Duplicates come from a wrong JOIN; fix the join instead'],
  },
  applications: [
    'Filling a filter dropdown with the categories that exist',
    'Listing the countries a company ships to',
    'Checking which status values a column actually contains',
  ],
  commonMistakes: [
    'Expecting DISTINCT to apply to one column only: SELECT DISTINCT a, b de-duplicates (a, b) pairs.',
    'Using DISTINCT to hide duplicates caused by a JOIN without understanding why they appear.',
    'Expecting DISTINCT to also sort the result; add ORDER BY.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'SELECT has produced 10 cities, with repeats and two NULLs. How many rows will DISTINCT keep?',
      view: viewAt(datasets.shop, query, 2),
      options: ['5', '4', '10'],
      answer: 0,
      explanation: 'Hanoi, Hue, Da Nang and Can Tho each appear once, and the two NULLs count as one more row: 5.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many rows does this return? (Data Atlas, a book, and Keyboard, an electronics item, both cost 42.)',
      code: 'SELECT DISTINCT category, price\nFROM products;',
      options: ['9', '3', '8'],
      answer: 0,
      explanation: 'Rows are duplicates only if every column matches. No two products share both category and price, so all 9 remain.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'How does DISTINCT treat two NULL values in the same column?',
      options: ['As duplicates: only one is kept', 'As different values: both are kept', 'It removes every NULL'],
      answer: 0,
      explanation: 'Although NULL = NULL is unknown in a WHERE condition, DISTINCT and GROUP BY treat NULLs as the same value.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which clause runs just before DISTINCT?',
      options: ['SELECT', 'WHERE', 'ORDER BY'],
      answer: 0,
      explanation: 'DISTINCT compares output rows, so SELECT must build them first. ORDER BY comes after DISTINCT.',
    },
  ],
  summary: [
    'DISTINCT removes duplicate output rows, keeping the first copy.',
    'Rows are duplicates only when every selected column matches.',
    'NULLs count as equal to each other for DISTINCT.',
    'It runs after SELECT and before ORDER BY.',
  ],
};
