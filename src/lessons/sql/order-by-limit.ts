import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 3;';

export const orderByLimit: Lesson = {
  id: 'order-by-limit',
  title: 'Sorting and LIMIT',
  category: 'sql',
  difficulty: 'beginner',
  group: 'Querying',
  description: 'Put rows in order and keep only the first few.',
  keywords: ['order by', 'sort', 'asc', 'desc', 'limit', 'offset', 'top n', 'pagination'],
  prerequisites: ['where'],
  overview:
    'ORDER BY sorts the result, and LIMIT keeps only the first rows of it. Together they answer questions like "the three most expensive products" or "page 2 of the order history".',
  concept: [
    'A table has no built-in order. If you need rows in an order, you must ask for it with ORDER BY; otherwise the database may return them in any order it likes.',
    'ORDER BY takes one or more keys. Rows are compared by the first key, and only when two rows tie does the second key decide. ASC (the default) sorts low to high and DESC high to low.',
    'LIMIT n keeps the first n rows of the sorted result, and OFFSET m skips m rows first. LIMIT runs last, so it always cuts the sorted rows.',
  ],
  howItWorks: [
    'FROM, WHERE and SELECT produce the rows as usual.',
    'ORDER BY compares rows by the first key, using later keys only to break ties.',
    'DESC reverses the order for that key; each key has its own direction.',
    'OFFSET skips the given number of rows from the top.',
    'LIMIT keeps the next n rows and discards the rest.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'Cheapest first', query: 'SELECT name, price\nFROM products\nORDER BY price;' },
      { label: 'Break ties', query: 'SELECT name, price\nFROM products\nORDER BY price DESC, name;' },
      { label: 'Skip with OFFSET', query: 'SELECT id, ordered_on\nFROM orders\nORDER BY ordered_on DESC\nLIMIT 2 OFFSET 3;' },
      { label: 'NULLs in a sort', query: 'SELECT name, city\nFROM customers\nORDER BY city;' },
    ],
    exercises: [
      {
        id: 'by-price',
        prompt: 'List product names and prices from most to least expensive; break ties by name.',
        solution: 'SELECT name, price FROM products ORDER BY price DESC, name;',
        orderMatters: true,
        hint: 'Use two sort keys: price DESC first, then name.',
      },
      {
        id: 'cheapest-3',
        prompt: 'Show the name and price of the 3 cheapest products, cheapest first.',
        solution: 'SELECT name, price FROM products ORDER BY price LIMIT 3;',
        orderMatters: true,
        hint: 'Sort ascending, then LIMIT.',
      },
      {
        id: 'older-orders',
        prompt: 'Skip the 3 most recent orders and show the id and date of the next 2.',
        solution: 'SELECT id, ordered_on FROM orders ORDER BY ordered_on DESC LIMIT 2 OFFSET 3;',
        orderMatters: true,
        hint: 'OFFSET 3 skips three rows before LIMIT counts.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Makes results predictable and repeatable', 'LIMIT keeps responses small and fast', 'Several keys express "sort by this, then by that" exactly'],
    cons: ['Sorting a large result costs time unless an index already has the order', 'Large OFFSETs still read and throw away every skipped row'],
    useWhen: ['You show results to people', 'You need the top or bottom few rows', 'You paginate a list'],
    avoidWhen: ['Order does not matter, such as when counting rows', 'Paginating deep into a huge table (filter on the last seen value instead of OFFSET)'],
  },
  applications: [
    'A "best sellers" list: ORDER BY sales DESC LIMIT 10',
    'Showing the newest orders first',
    'Pagination: LIMIT 20 OFFSET 40 for page 3',
    'Finding the cheapest or most recent item',
  ],
  commonMistakes: [
    'Relying on the order rows happened to come back in without ORDER BY.',
    'Using LIMIT without ORDER BY and expecting the "top" rows.',
    'Forgetting a tie-breaker, so tied rows swap places between runs.',
    'Assuming NULLs sort the same everywhere: SQLite and MySQL put them first in ascending order, PostgreSQL last.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The rows are now sorted by price, highest first. What does LIMIT 3 do next?',
      view: viewAt(datasets.shop, query, -3),
      options: [
        'Keeps Headphones and the two products at 42, and cuts the rest',
        'Keeps the three cheapest products',
        'Sorts the rows again by name',
      ],
      answer: 0,
      explanation: 'LIMIT keeps the first three rows of the sorted result: Headphones (59.9), then Data Atlas and Keyboard (both 42).',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'In SQLite, which customer comes first?',
      code: 'SELECT name, city\nFROM customers\nORDER BY city;',
      options: ['A customer with no city (NULL)', 'Quang, from Can Tho', 'Minh, from Da Nang'],
      answer: 0,
      explanation: 'SQLite treats NULL as smaller than any value, so NULL cities come first in ascending order.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Without ORDER BY, in what order do rows come back?',
      options: ['No guaranteed order', 'Always alphabetical', 'Always by id'],
      answer: 0,
      explanation: 'The database may return rows in whatever order is cheapest for it. Only ORDER BY guarantees an order.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which rows of the sorted result does LIMIT 2 OFFSET 3 return?',
      options: ['The 4th and 5th', 'The 3rd and 4th', 'The 2nd and 3rd'],
      answer: 0,
      explanation: 'OFFSET 3 skips the first three rows, then LIMIT 2 keeps the next two.',
    },
  ],
  summary: [
    'ORDER BY sorts by one or more keys; later keys only break ties.',
    'ASC sorts low to high (the default) and DESC high to low.',
    'LIMIT keeps the first n rows and OFFSET skips rows before that.',
    'Standard SQL writes LIMIT as FETCH FIRST n ROWS ONLY, which PostgreSQL also accepts.',
  ],
};
