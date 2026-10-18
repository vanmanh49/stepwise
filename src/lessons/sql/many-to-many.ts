import { datasets } from '../../sql/datasets';
import { viewAt } from '../../sql/steps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT s.name, c.title\nFROM students s\nJOIN enrollments e ON e.student_id = s.id\nJOIN courses c ON c.id = e.course_id;';

export const manyToMany: Lesson = {
  id: 'many-to-many',
  title: 'Many-to-Many Joins',
  category: 'sql',
  difficulty: 'intermediate',
  group: 'Joins',
  description: 'Connect two tables through a link table, such as students and courses through enrollments.',
  keywords: ['many to many', 'junction table', 'link table', 'bridge table', 'join table', 'two joins', 'enrollments'],
  prerequisites: ['inner-join', 'group-by-having'],
  overview:
    'A student takes many courses, and a course has many students. No single column can hold that, so a third table, the link table, stores one row per pair. A many-to-many query joins all three: from the first table, through the link table, to the second.',
  concept: [
    'enrollments is the link table. Each row says "this student takes this course": a student_id and a course_id. Mai takes two courses, so she has two rows; Databases has four students, so it appears in four rows.',
    'To get names and titles, join twice. students to enrollments on the student id gives each student’s enrollment rows; enrollments to courses on the course id adds each course’s title. The result has one row per enrollment.',
    'Because the link table holds pairs, everything you know about grouping works on it. GROUP BY the student counts their courses; GROUP BY the course counts its students. LEFT JOIN from courses keeps courses with no students.',
  ],
  howItWorks: [
    'FROM starts with the first table, such as students.',
    'The first JOIN pairs each row with its rows in the link table.',
    'The second JOIN adds the matching row of the other table for each link row.',
    'The result has one row per link row, with columns from both ends.',
    'GROUP BY on either end counts or sums the connections.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'school',
    initialQuery: query,
    examples: [
      {
        label: 'Courses per student',
        query: 'SELECT s.name, COUNT(*) AS courses\nFROM students s\nJOIN enrollments e ON e.student_id = s.id\nGROUP BY s.id, s.name;',
      },
      {
        label: 'Who takes Databases',
        query: "SELECT s.name\nFROM students s\nJOIN enrollments e ON e.student_id = s.id\nJOIN courses c ON c.id = e.course_id\nWHERE c.title = 'Databases';",
      },
      {
        label: 'Courses with no students',
        query: 'SELECT c.title\nFROM courses c\nLEFT JOIN enrollments e ON e.course_id = c.id\nWHERE e.student_id IS NULL;',
      },
    ],
    exercises: [
      {
        id: 'mai-courses',
        prompt: 'List the titles of the courses Mai takes.',
        solution:
          "SELECT c.title FROM students s JOIN enrollments e ON e.student_id = s.id JOIN courses c ON c.id = e.course_id WHERE s.name = 'Mai';",
        orderMatters: false,
        hint: 'Go from students through enrollments to courses, then keep only Mai.',
      },
      {
        id: 'students-per-course',
        prompt: 'List every course title with its number of students, including courses with none.',
        solution: 'SELECT c.title, COUNT(e.student_id) FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id GROUP BY c.id, c.title;',
        orderMatters: false,
        hint: 'LEFT JOIN from courses keeps empty courses; count a link-table column so they count 0.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Stores any number of connections on both sides', 'The link table can hold facts about the pair, such as a grade', 'Each connection is one row, easy to add or remove'],
    cons: ['Every question needs two joins', 'Results repeat each row once per connection', 'Forgetting the link table gives a meaningless pairing'],
    useWhen: ['Both sides can have many of the other', 'The connection itself has data, such as a grade or a date'],
    avoidWhen: ['Each row of one table belongs to only one row of the other (a plain foreign key is enough)'],
  },
  applications: [
    'Students and the courses they take',
    'Products and the orders that contain them',
    'Posts and their tags',
    'Actors and the films they appear in',
  ],
  commonMistakes: [
    'Joining students straight to courses, which has no shared column and pairs everyone with everything.',
    'Using the wrong id in ON, such as e.course_id = s.id.',
    'Counting with COUNT(*) after a LEFT JOIN, which counts 1 for an empty course; count a link-table column instead.',
    'Being surprised that a student appears several times: there is one row per course they take.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'FROM has loaded the 10 students. enrollments has 16 rows, and every one names a real student and course. How many rows will the two joins produce?',
      view: viewAt(datasets.school, query, 1),
      options: ['16', '10', '6'],
      answer: 0,
      explanation: 'Each enrollment row matches one student and one course, so the result has one row per enrollment: 16.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this return?',
      code: 'SELECT c.title, COUNT(*)\nFROM courses c\nJOIN enrollments e ON e.course_id = c.id\nGROUP BY c.id, c.title;',
      options: ['Each course that has students, with how many', 'Every course, including empty ones, with how many', 'Each student with their number of courses'],
      answer: 0,
      explanation: 'The INNER JOIN drops courses with no enrollments, so only courses with students appear.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why is a link table needed between students and courses?',
      options: [
        'Both sides can have many of the other, and one column can hold only one id',
        'Tables cannot be joined directly',
        'It makes queries faster',
      ],
      answer: 0,
      explanation: 'A course_id column in students could hold only one course. The link table holds one row per pair.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Nga takes no courses. Which query still lists her?',
      options: [
        'FROM students s LEFT JOIN enrollments e ON e.student_id = s.id',
        'FROM students s JOIN enrollments e ON e.student_id = s.id',
        'FROM enrollments e JOIN students s ON s.id = e.student_id',
      ],
      answer: 0,
      explanation: 'Only a LEFT JOIN from students keeps a student with no enrollment rows.',
    },
  ],
  summary: [
    'A many-to-many relationship is stored in a link table with one row per pair.',
    'Querying it takes two joins: first table → link table → second table.',
    'The result has one row per link row.',
    'GROUP BY either end counts connections; LEFT JOIN keeps rows with none.',
  ],
};
