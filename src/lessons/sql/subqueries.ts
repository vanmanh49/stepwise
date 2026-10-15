import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT title, credits\nFROM courses\nWHERE credits > (SELECT AVG(credits) FROM courses);';

export const subqueries: Lesson = {
  id: 'subqueries',
  title: 'Subqueries',
  category: 'sql',
  difficulty: 'intermediate',
  group: 'Subqueries',
  description: 'Use the result of one query inside another.',
  keywords: ['subquery', 'nested query', 'in', 'not in', 'scalar subquery', 'correlated subquery'],
  prerequisites: ['where', 'aggregates'],
  overview:
    'A subquery is a query in parentheses inside another query. It answers a smaller question first, such as "what is the average number of credits?", and the outer query uses that answer, such as "courses with more credits than that".',
  concept: [
    'A scalar subquery returns a single value and can stand anywhere a value can: credits > (SELECT AVG(credits) FROM courses).',
    'A subquery after IN returns a list: id IN (SELECT student_id FROM enrollments) keeps students whose id appears in that list.',
    'A correlated subquery refers to the outer row, such as a customer’s id, so it runs again for every outer row. It is powerful but can be slow on large tables.',
  ],
  howItWorks: [
    'The outer query runs as usual: FROM, then WHERE row by row.',
    'When WHERE meets a subquery, the database runs it to get its value or list.',
    'A scalar subquery that returns no rows gives NULL; one that returns several rows uses the first in SQLite and fails in most other databases.',
    'IN is true if the value is in the list; NOT IN is true only if it is in the list nowhere and the list has no NULLs.',
    'The outer row is kept or removed based on the result, as with any condition.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'school',
    initialQuery: query,
    examples: [
      { label: 'IN a list', query: 'SELECT name\nFROM students\nWHERE id IN (SELECT student_id FROM enrollments WHERE course_id = 1);' },
      { label: 'NOT IN', query: 'SELECT name\nFROM students\nWHERE id NOT IN (SELECT student_id FROM enrollments);' },
      { label: 'Correlated', query: 'SELECT name\nFROM students s\nWHERE (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = s.id) >= 2;' },
      { label: 'The NULL trap', query: 'SELECT name\nFROM students\nWHERE email NOT IN (SELECT email FROM students WHERE year = 1);' },
    ],
    exercises: [
      {
        id: 'in-course-1',
        prompt: 'List the names of students enrolled in course 1.',
        solution: 'SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments WHERE course_id = 1);',
        orderMatters: false,
        hint: 'The subquery returns the student ids of course 1.',
      },
      {
        id: 'above-avg',
        prompt: 'List the titles of courses with more credits than the average course.',
        solution: 'SELECT title FROM courses WHERE credits > (SELECT AVG(credits) FROM courses);',
        orderMatters: false,
      },
      {
        id: 'not-enrolled',
        prompt: 'List the names of students not enrolled in any course.',
        solution: 'SELECT name FROM students WHERE id NOT IN (SELECT student_id FROM enrollments);',
        orderMatters: false,
        hint: 'Use NOT IN with the list of enrolled student ids.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Breaks a hard question into smaller ones', 'Reads close to the English question', 'IN subqueries avoid duplicate rows that a JOIN might create'],
    cons: ['Correlated subqueries can run once per row, which is slow on big tables', 'NOT IN behaves surprisingly when the list contains NULL'],
    useWhen: ['A condition depends on a computed value, such as an average', 'You need rows whose key appears, or does not appear, in another table'],
    avoidWhen: ['You need columns from the other table in the result (use a JOIN)', 'The subquery would run for every row of a very large table'],
  },
  applications: [
    'Products priced above the average price',
    'Students enrolled in a given course',
    'Customers who have never placed an order',
    'Rows that match the latest date in a table',
  ],
  commonMistakes: [
    'Using NOT IN with a subquery that can return NULL: x NOT IN (1, NULL) is never true, so the query returns nothing.',
    'Writing = (subquery) when the subquery returns several rows; use IN.',
    'Returning two columns from a subquery used as a value.',
    'Forgetting that a scalar subquery with no rows gives NULL, which then makes comparisons unknown.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: "The subquery's average is 3.5 credits. Row 2 is Algorithms with 5 credits. What happens to it?",
      view: viewAt(datasets.school, query, 2),
      options: ['It is kept, because 5 > 3.5', 'It is removed, because the average changes on each row', 'It is removed, because 5 is the maximum'],
      answer: 0,
      explanation: 'The subquery does not depend on the outer row, so its value, 3.5, is the same for every course. 5 > 3.5 is true.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'Linh and Viet have no email (NULL). What does this return?',
      code: "SELECT name\nFROM students\nWHERE email NOT IN (SELECT email FROM students WHERE name = 'Linh');",
      options: ['No rows', 'Every student except Linh', 'Only Viet'],
      answer: 0,
      explanation: 'The list contains NULL. For any email, "not equal to NULL" is unknown, so NOT IN is never true and every row is removed.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What makes a subquery correlated?',
      options: ['It refers to a column of the outer query’s current row', 'It uses an aggregate such as AVG', 'It appears after IN'],
      answer: 0,
      explanation: 'A correlated subquery reads the outer row, so it must run again for every row of the outer query.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a scalar subquery give when it returns no rows?',
      options: ['NULL', '0', 'An error'],
      answer: 0,
      explanation: 'There is no value to use, so the subquery stands for NULL, and comparisons with it are unknown.',
    },
  ],
  summary: [
    'A subquery answers a smaller question inside a bigger one.',
    'A scalar subquery gives one value; a subquery after IN gives a list.',
    'Correlated subqueries refer to the outer row and run once per row.',
    'Beware NOT IN when the list can contain NULL.',
  ],
};
