import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';

const query = 'SELECT teacher, teacher_room, COUNT(*) AS signups\nFROM course_signups\nGROUP BY teacher, teacher_room;';

const split = `CREATE TABLE students (name TEXT PRIMARY KEY, email TEXT);
INSERT INTO students SELECT DISTINCT student, student_email FROM course_signups;
CREATE TABLE teachers (name TEXT PRIMARY KEY, room TEXT);
INSERT INTO teachers VALUES ('Ha', 'B12'), ('Son', 'C03');
CREATE TABLE courses (code TEXT PRIMARY KEY, title TEXT, teacher TEXT REFERENCES teachers(name));
INSERT INTO courses SELECT DISTINCT course, course_title, teacher FROM course_signups;
CREATE TABLE enrollments (student TEXT REFERENCES students(name), course TEXT REFERENCES courses(code), grade INTEGER, PRIMARY KEY (student, course));
INSERT INTO enrollments SELECT student, course, grade FROM course_signups;
SELECT e.student, s.email, c.title, t.name, t.room, e.grade
FROM enrollments e
JOIN students s ON s.name = e.student
JOIN courses c ON c.code = e.course
JOIN teachers t ON t.name = c.teacher;`;

export const normalization: Lesson = {
  id: 'normalization',
  title: 'Normalization',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Database internals',
  description: 'Split a table that repeats itself into tables that store each fact once, and join them back when needed.',
  keywords: ['normalization', 'normal form', '1nf', '2nf', '3nf', 'redundancy', 'update anomaly', 'functional dependency', 'schema design', 'denormalized'],
  prerequisites: ['many-to-many', 'constraints'],
  overview:
    'course_signups keeps everything in one table, so the same facts are written again and again: a student’s email once per course, a teacher’s room once per sign-up. Repeated facts drift apart, and Ha already has two rooms. Normalization splits the table so that each fact is stored once, in a table about that one thing, linked by keys; a JOIN puts the rows back together.',
  concept: [
    'Think of a class register where every line also repeats the teacher’s office. When the teacher moves, someone must change every line, and if one is missed the register contradicts itself. Writing the office once, on a page about teachers, removes the problem.',
    'Three kinds of trouble come from repeats. An update anomaly: changing Ha’s room in some rows but not others, as has happened here. A deletion anomaly: deleting the last sign-up for a course also deletes its title. An insertion anomaly: a new course can’t be stored until someone signs up for it.',
    'The normal forms are a checklist. First normal form (1NF): one value per cell, no lists. Second (2NF): every column depends on the whole key, so a sign-up keyed by (student, course) shouldn’t hold the course title, which depends on the course alone. Third (3NF): columns depend only on the key, so the teacher’s room, which depends on the teacher, moves to a teachers table.',
    'The result here is four tables: students, teachers, courses and enrollments, the link table of a many-to-many relationship. INSERT … SELECT DISTINCT fills them from the old table, and a JOIN of all four rebuilds every original row, with Ha’s room now stored, and corrected, in one place.',
  ],
  howItWorks: [
    'Find columns that repeat the same value for the same thing: emails per student, titles per course, rooms per teacher.',
    'Give each thing its own table with a primary key: students, courses, teachers.',
    'Keep a link table for the relationship itself, with the facts that belong to it, such as the grade.',
    'Fill the new tables with INSERT … SELECT DISTINCT, fixing contradictions on the way.',
    'Join the tables to get the original rows back whenever they are needed.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'signups',
    initialQuery: query,
    examples: [
      { label: 'Repeated emails', query: 'SELECT student, student_email, COUNT(*) AS copies\nFROM course_signups\nGROUP BY student, student_email;' },
      {
        label: 'Update anomaly',
        query: "UPDATE course_signups SET teacher_room = 'B30'\nWHERE teacher = 'Ha' AND student = 'Mai';\nSELECT DISTINCT teacher_room FROM course_signups\nWHERE teacher = 'Ha';",
      },
      { label: 'Split and rebuild', query: split },
    ],
    exercises: [
      {
        id: 'students',
        prompt: 'Create a table students (name, email) with name as its primary key and one row per student, filled from course_signups with INSERT … SELECT.',
        solution: 'CREATE TABLE students (name TEXT PRIMARY KEY, email TEXT);\nINSERT INTO students SELECT DISTINCT student, student_email FROM course_signups;',
        orderMatters: false,
        probes: [
          'SELECT name, email FROM students',
          "INSERT INTO students VALUES ('Mai', 'mai2@uni.edu')",
          'SELECT COUNT(*) FROM course_signups c JOIN students s ON s.name = c.student AND s.email = c.student_email',
        ],
        hint: 'SELECT DISTINCT student, student_email gives each student once.',
      },
      {
        id: 'teachers',
        prompt: 'Create a table teachers (name, room) with name as its primary key, one row per teacher. Ha’s real room is B12.',
        solution: "CREATE TABLE teachers (name TEXT PRIMARY KEY, room TEXT);\nINSERT INTO teachers VALUES ('Ha', 'B12'), ('Son', 'C03');",
        orderMatters: false,
        probes: ['SELECT name, room FROM teachers', "INSERT INTO teachers VALUES ('Ha', 'B21')"],
        hint: 'SELECT DISTINCT teacher, teacher_room gives Ha twice, because the old table disagrees with itself. Write the rows yourself.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Each fact is stored once, so it can’t contradict itself', 'Changes touch one row instead of many', 'New things can be stored before anything refers to them'],
    cons: ['Reading the full picture needs JOINs', 'More tables to design and name', 'Some reports are faster on a deliberately repeated (denormalized) copy'],
    useWhen: ['Designing tables that will be updated over time', 'The same value keeps appearing in many rows'],
    avoidWhen: ['A read-only report table that is rebuilt from the real tables', 'Data that is written once and never changed, such as a log'],
  },
  applications: [
    'Turning a spreadsheet into database tables',
    'Designing customers, orders and products for a shop',
    'Cleaning up imported data that repeats itself',
    'Finding the cause of data that contradicts itself',
  ],
  commonMistakes: [
    'Keeping a column such as course_title in the sign-up table, where it repeats for every student.',
    'Splitting tables without keys, so the duplicates come back.',
    'Copying contradicting rows into the new tables instead of fixing them.',
    'Normalizing so far that simple questions need many joins; stop at what keeps facts consistent.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Ha appears in 4 of these rows. How many different rooms will GROUP BY show for Ha?',
      view: scriptViewAt(datasets.signups, query, 1),
      options: ['2', '1', '4'],
      answer: 0,
      explanation: 'Three rows say B12 and one says B21: the same fact, stored four times, no longer agrees with itself.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'How many different rooms does Ha have after this UPDATE?',
      code: "UPDATE course_signups SET teacher_room = 'B30'\nWHERE teacher = 'Ha' AND student = 'Mai';",
      options: ['3', '1', '2'],
      answer: 0,
      explanation: 'Only Mai’s row changes, so Ha now has B30, B12 and B21. Updating a repeated fact in one place makes things worse.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which design stores Ha’s room exactly once?',
      options: ['A teachers table with one row per teacher', 'A room column in every sign-up', 'A room column in students'],
      answer: 0,
      explanation: 'The room is a fact about the teacher, so it belongs in a table with one row per teacher.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is a deletion anomaly in course_signups?',
      options: ['Deleting the last sign-up for a course also loses the course’s title', 'Deleting a row leaves a NULL behind', 'DELETE needs a WHERE clause'],
      answer: 0,
      explanation: 'The title is only stored inside sign-ups, so with no sign-ups the database forgets the course exists.',
    },
  ],
  summary: [
    'Repeated facts drift apart: update, deletion and insertion anomalies.',
    'Normalization stores each fact once, in a table about that thing, linked by keys.',
    '2NF: columns depend on the whole key; 3NF: only on the key.',
    'JOINs put the normalized tables back together.',
  ],
};
