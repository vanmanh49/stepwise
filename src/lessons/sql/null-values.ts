import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { LessonContent } from '../../types/lesson';

const query = "SELECT name, city\nFROM customers\nWHERE city = 'Hanoi' OR city IS NULL;";

const content: LessonContent = {
  overview:
    'NULL means "no value": a customer whose city was never recorded. It is not zero and not an empty string. Any comparison with NULL gives a third answer, unknown, and WHERE only keeps rows where the answer is true.',
  concept: [
    "SQL logic has three answers: true, false and unknown. city = 'Hanoi' is unknown when city is NULL, because nobody knows what the missing city is.",
    "That is why city <> 'Hanoi' does not return customers with no city: for them the comparison is unknown, not true. Even NULL = NULL is unknown.",
    'To test for a missing value, use IS NULL or IS NOT NULL. They are the only comparisons that answer true or false for NULL.',
  ],
  howItWorks: [
    'A comparison where either side is NULL gives unknown.',
    'NOT unknown is still unknown.',
    'FALSE AND unknown is false; TRUE AND unknown is unknown.',
    'TRUE OR unknown is true; FALSE OR unknown is unknown.',
    'WHERE keeps a row only when the final answer is true, so unknown rows are removed.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      { label: 'The = NULL trap', query: 'SELECT name\nFROM customers\nWHERE city = NULL;' },
      { label: 'IS NOT NULL', query: 'SELECT name, city\nFROM customers\nWHERE city IS NOT NULL;' },
      { label: 'NOT with NULL', query: "SELECT name, city\nFROM customers\nWHERE NOT (city = 'Hanoi');" },
    ],
    exercises: [
      {
        id: 'no-city',
        prompt: 'List the names of customers with no city recorded.',
        solution: 'SELECT name FROM customers WHERE city IS NULL;',
        orderMatters: false,
        hint: 'city = NULL is never true. There is a special operator for this.',
      },
      {
        id: 'not-hanoi',
        prompt: 'List the names of customers who do not live in Hanoi, including those with no city.',
        solution: "SELECT name FROM customers WHERE city <> 'Hanoi' OR city IS NULL;",
        orderMatters: false,
        hint: "city <> 'Hanoi' is unknown for a NULL city, so add those rows back with OR.",
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Records "we do not know" honestly instead of inventing a value', 'Aggregates such as AVG skip NULLs instead of counting them as zero'],
    cons: ['Conditions silently drop NULL rows', 'NOT IN with a NULL in the list returns nothing', 'Easy to forget when writing filters'],
    useWhen: ['A value is genuinely missing or not applicable', 'You want averages that ignore unknown values'],
    avoidWhen: ['A real default exists, such as 0 items in a cart', 'A missing value would break every query that reads the column'],
  },
  applications: [
    'Optional form fields such as a second phone number',
    'Grades for a course that is still in progress',
    'A delivery date for an order that has not shipped',
    'Finding incomplete records that need cleaning',
  ],
  commonMistakes: [
    'Writing WHERE city = NULL, which never matches; use IS NULL.',
    "Expecting city <> 'Hanoi' to include customers with no city.",
    'Using NOT IN with a list or subquery that contains a NULL, which returns no rows at all.',
    'Treating NULL as 0 or an empty string in calculations; 5 + NULL is NULL.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: "Row 4 is Dung, whose city is NULL. What does WHERE city <> 'Hanoi' do with this row?",
      view: viewAt(datasets.shop, "SELECT name, city\nFROM customers\nWHERE city <> 'Hanoi';", 4),
      options: [
        "Removes it, because NULL <> 'Hanoi' is unknown",
        'Keeps it, because a missing city is not Hanoi',
        'Stops the query with an error',
      ],
      answer: 0,
      explanation: 'Any comparison with NULL is unknown, and WHERE only keeps rows where the condition is true.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many rows does this return? (Two customers have no city.)',
      code: 'SELECT name\nFROM customers\nWHERE city = NULL;',
      options: ['0', '2', '10'],
      answer: 0,
      explanation: 'city = NULL is unknown for every row, even the rows where city is NULL. Use IS NULL instead.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the result of NULL = NULL in SQL?',
      options: ['Unknown', 'True', 'False'],
      answer: 0,
      explanation: 'Two unknown values cannot be shown to be equal, so the comparison itself is unknown.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is FALSE AND unknown?',
      options: ['False', 'Unknown', 'True'],
      answer: 0,
      explanation: 'AND needs both sides to be true. One side is already false, so the answer is false whatever the unknown side is.',
    },
  ],
  summary: [
    'NULL means a value is missing; it is not zero or empty text.',
    'Comparisons with NULL are unknown, and WHERE drops unknown rows.',
    'Test for missing values with IS NULL and IS NOT NULL.',
    'SQLite sorts NULL first in ascending order; PostgreSQL puts it last, so check your database.',
  ],
};

export default content;
