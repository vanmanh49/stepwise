import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query =
  "SELECT name, price,\n  CASE\n    WHEN price >= 40 THEN 'premium'\n    WHEN price >= 15 THEN 'standard'\n    ELSE 'budget'\n  END AS tier\nFROM products;";

export const caseExpressions: Lesson = {
  id: 'case-expressions',
  title: 'CASE Expressions',
  category: 'sql',
  difficulty: 'intermediate',
  group: 'Advanced querying',
  description: 'Choose a value row by row with CASE WHEN … THEN … ELSE … END, SQL’s if-then-else.',
  keywords: ['case when', 'if then else', 'conditional', 'when then', 'else', 'bucket', 'label', 'pivot', 'conditional count'],
  prerequisites: ['where'],
  overview:
    'CASE is SQL’s if-then-else. For each row it tests its WHEN conditions in order and returns the THEN value of the first one that is true, or the ELSE value when none is. It is an expression, so it can go anywhere a value can: in SELECT, ORDER BY, or inside SUM.',
  concept: [
    'Think of a sorting machine with labelled chutes. Each product rolls past the first test, price >= 40; if it passes, it drops into "premium" and stops. If not, it rolls on to price >= 15 and "standard". Anything left over falls into ELSE, "budget".',
    'Order matters, because the first true WHEN wins. A 42.00 product passes both price >= 40 and price >= 15, but it is labelled premium because that test comes first. Put the strictest test first.',
    'Without ELSE, a row that matches no WHEN gets NULL. The simple form, CASE category WHEN \'Books\' THEN … END, compares one value with each WHEN, like a lookup table; it uses =, so it never matches NULL.',
    'Because CASE returns a value, SUM(CASE WHEN status = \'shipped\' THEN 1 ELSE 0 END) counts the shipped orders. Several such sums in one SELECT put several counts side by side in a single row.',
  ],
  howItWorks: [
    'For each row, the first WHEN condition is tested.',
    'If it is true, CASE returns that THEN value and stops.',
    'Otherwise the next WHEN is tested, in order.',
    'If no WHEN is true, CASE returns the ELSE value, or NULL when there is no ELSE.',
    'The returned value is used like any other: shown, sorted on, or added up.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      {
        label: 'Simple CASE',
        query: "SELECT name,\n  CASE category\n    WHEN 'Books' THEN 'Read'\n    WHEN 'Kitchen' THEN 'Cook'\n    ELSE 'Use'\n  END AS action\nFROM products;",
      },
      {
        label: 'CASE in ORDER BY',
        query: "SELECT id, status\nFROM orders\nORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'shipped' THEN 2 ELSE 3 END, id;",
      },
      {
        label: 'Counts with SUM',
        query: "SELECT\n  SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped,\n  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled\nFROM orders;",
      },
      { label: 'No ELSE gives NULL', query: "SELECT name, CASE WHEN price >= 40 THEN 'premium' END AS tier\nFROM products;" },
    ],
    exercises: [
      {
        id: 'shipped-label',
        prompt: "List each order’s id with a column that says 'shipped' for shipped orders and 'not shipped' for every other order.",
        solution: "SELECT id, CASE WHEN status = 'shipped' THEN 'shipped' ELSE 'not shipped' END FROM orders;",
        orderMatters: false,
        hint: "One WHEN for status = 'shipped', and ELSE for everything else.",
      },
      {
        id: 'status-counts',
        prompt: 'In one row, show the number of pending orders and the number of shipped orders.',
        solution:
          "SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) FROM orders;",
        orderMatters: false,
        hint: 'SUM a CASE that gives 1 for the status you want and 0 otherwise, once per status.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Puts if-then-else logic inside a query', 'Works anywhere a value can go', 'Turns rows into side-by-side counts with SUM'],
    cons: ['Long CASE expressions get hard to read', 'The order of WHENs is easy to get wrong', 'Forgetting ELSE silently gives NULL'],
    useWhen: ['Labelling rows by a rule', 'Custom sort orders', 'Counting several conditions in one pass'],
    avoidWhen: ['The labels are data that should live in a table and be joined', 'A plain WHERE filter is all you need'],
  },
  applications: [
    'Grouping prices or ages into bands',
    'Translating codes into readable labels',
    'Sorting statuses in a business order rather than alphabetically',
    'Building a report with one count per status in a single row',
  ],
  commonMistakes: [
    'Putting a loose test first, so a stricter WHEN after it is never reached.',
    'Forgetting ELSE and getting NULL for rows that match nothing.',
    "Writing CASE x WHEN NULL THEN …, which never matches; use CASE WHEN x IS NULL THEN ….",
    'Forgetting END, or putting the alias before END.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The next row is Poetry Pocket, priced 8.75. Which tier will CASE give it?',
      view: viewAt(datasets.shop, query, 3),
      options: ["'budget'", "'standard'", 'NULL'],
      answer: 0,
      explanation: '8.75 fails price >= 40 and price >= 15, so no WHEN is true and ELSE gives budget.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What tier does a product priced 42.00 get?',
      code: "CASE\n  WHEN price >= 15 THEN 'standard'\n  WHEN price >= 40 THEN 'premium'\nEND",
      options: ["'standard'", "'premium'", 'NULL'],
      answer: 0,
      explanation: 'The first true WHEN wins. 42 >= 15 is tested first and is true, so premium is never reached.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: "What does CASE WHEN price >= 40 THEN 'premium' END give for a product priced 6.50?",
      options: ['NULL', "'premium'", 'An error'],
      answer: 0,
      explanation: 'No WHEN is true and there is no ELSE, so CASE returns NULL.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: "What does SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) compute?",
      options: ['The number of shipped orders', 'The total value of shipped orders', 'The number of orders'],
      answer: 0,
      explanation: 'Each shipped order adds 1 and every other order adds 0, so the sum is the count of shipped orders.',
    },
  ],
  summary: [
    'CASE WHEN condition THEN value … ELSE value END picks a value per row.',
    'WHENs are tested in order and the first true one wins.',
    'Without ELSE, a row that matches nothing gets NULL.',
    'CASE works in SELECT, ORDER BY and inside aggregates such as SUM.',
  ],
};
