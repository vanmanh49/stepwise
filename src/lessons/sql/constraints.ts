import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { LessonContent } from '../../types/lesson';

const query =
  "CREATE TABLE members (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), email TEXT UNIQUE, age INTEGER CHECK (age >= 16));\nINSERT INTO members (student_id, email, age) VALUES (1, 'mai@club.vn', 18);\nINSERT INTO members (student_id, email, age) VALUES (2, 'mai@club.vn', 19);";

const content: LessonContent = {
  overview:
    'Constraints are rules written into a table’s design. The database checks them on every INSERT and UPDATE and refuses any change that would break one. They stop bad data at the door instead of leaving every program to remember the rules.',
  concept: [
    'Imagine a club register. Every member needs a student number, no two members may share an email, members must be at least 16, and the student number must belong to a real student. Constraints write exactly these rules into the table.',
    'NOT NULL means a column must always have a value. UNIQUE means no two rows may have the same value in it (NULLs do not count as equal, so several NULLs are allowed). PRIMARY KEY marks the column, or group of columns, that identifies each row: it is unique, and in SQLite an INTEGER PRIMARY KEY also numbers itself. One SQLite quirk: any other PRIMARY KEY still allows NULL, unlike most databases, so add NOT NULL to it when every row needs a key.',
    'CHECK (condition) refuses a row when the condition is false, such as CHECK (age >= 16). A NULL age makes the condition unknown, and unknown passes, so pair CHECK with NOT NULL when the value is required.',
    'REFERENCES other(column), a foreign key, says a value must exist in another table: student_id REFERENCES students(id) refuses a member whose student does not exist, and refuses deleting a student who still has members. When any rule fails, the whole statement is undone.',
  ],
  howItWorks: [
    'Constraints are declared in CREATE TABLE, on a column or for the whole table.',
    'Every INSERT and UPDATE checks NOT NULL, CHECK, then PRIMARY KEY and UNIQUE for each row it writes.',
    'Foreign keys are checked at the end of each statement, in both directions.',
    'A broken rule stops the statement, undoes its changes, and names the rule.',
    'A PRIMARY KEY or UNIQUE over several columns, such as PRIMARY KEY (room, seat), compares the columns together.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'school',
    initialQuery: query,
    examples: [
      {
        label: 'Fails: NOT NULL',
        query: 'CREATE TABLE members (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL);\nINSERT INTO members (student_id) VALUES (NULL);',
      },
      {
        label: 'Fails: CHECK',
        query: 'CREATE TABLE members (id INTEGER PRIMARY KEY, age INTEGER CHECK (age >= 16));\nINSERT INTO members (age) VALUES (18), (15);',
      },
      {
        label: 'Fails: unknown student',
        query: 'CREATE TABLE members (id INTEGER PRIMARY KEY, student_id INTEGER REFERENCES students(id));\nINSERT INTO members (student_id) VALUES (1), (42);',
      },
      {
        label: 'Composite primary key',
        query:
          "CREATE TABLE seats (room TEXT, seat INTEGER, student_id INTEGER, PRIMARY KEY (room, seat));\nINSERT INTO seats VALUES ('A1', 1, 1), ('A1', 2, 2), ('B2', 1, 3);\nSELECT * FROM seats;",
      },
    ],
    exercises: [
      {
        id: 'members-email',
        prompt: 'Create a table members with an id that numbers itself and an email that every member must have and no two members may share.',
        solution: 'CREATE TABLE members (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE);',
        orderMatters: false,
        probes: [
          'INSERT INTO members (email) VALUES (NULL)',
          "INSERT INTO members (email) VALUES ('a@club.vn'), ('a@club.vn')",
          "INSERT INTO members (email) VALUES ('a@club.vn'), ('b@club.vn'); SELECT id, email FROM members",
        ],
        hint: 'Put NOT NULL and UNIQUE after the email column’s type.',
      },
      {
        id: 'memberships',
        prompt:
          'Create a table memberships (student_id, course_id) where both columns must refer to a real student and course, and each pair may appear only once.',
        solution:
          'CREATE TABLE memberships (student_id INTEGER REFERENCES students(id), course_id INTEGER REFERENCES courses(id), PRIMARY KEY (student_id, course_id));',
        orderMatters: false,
        probes: [
          'INSERT INTO memberships VALUES (99, 1)',
          'INSERT INTO memberships VALUES (1, 99)',
          'INSERT INTO memberships VALUES (1, 1), (1, 1)',
          'INSERT INTO memberships VALUES (1, 1), (2, 1); SELECT * FROM memberships',
        ],
        hint: 'REFERENCES on each column, and a table-level PRIMARY KEY (student_id, course_id).',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Bad data is refused before it is stored', 'The rules live in one place, not in every program', 'Error messages name the rule that failed'],
    cons: ['A rule that is too strict blocks valid data', 'Changing rules later needs care with the rows already stored'],
    useWhen: ['A value is required, unique, or limited to a range', 'Rows in one table must point at real rows in another'],
    avoidWhen: ['The rule depends on other rows or tables in complex ways (enforce it in the application)'],
  },
  applications: [
    'Making sure every user has a unique email address',
    'Keeping order items pointing at real orders and products',
    'Refusing negative quantities or impossible dates',
    'Stopping a student from enrolling in the same course twice',
  ],
  commonMistakes: [
    'Expecting CHECK to refuse NULL; add NOT NULL as well.',
    'Expecting UNIQUE to refuse several NULLs; NULLs are never equal.',
    'Deleting a parent row before the rows that refer to it.',
    'Putting PRIMARY KEY on two separate columns when you mean one key over both: write PRIMARY KEY (a, b).',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'members already has mai@club.vn, and email is UNIQUE. The next INSERT adds another member with that email. What happens?',
      view: scriptViewAt(datasets.school, query, 4),
      options: ['It fails with UNIQUE, and nothing is added', 'Both members are kept', 'The first member is replaced'],
      answer: 0,
      explanation: 'UNIQUE refuses a second row with the same email, so the statement is undone.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What happens to this row?',
      code: 'CREATE TABLE m (age INTEGER CHECK (age >= 16));\nINSERT INTO m VALUES (NULL);',
      options: ['It is stored', 'It fails the CHECK', 'It fails NOT NULL'],
      answer: 0,
      explanation: 'NULL >= 16 is unknown, and CHECK only refuses a false condition. Add NOT NULL to require an age.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'email is UNIQUE. Can two members both have NULL as their email?',
      options: ['Yes: NULLs never count as equal', 'No: UNIQUE allows only one NULL', 'Only if email is also NOT NULL'],
      answer: 0,
      explanation: 'UNIQUE compares values, and NULL is not equal to anything, not even another NULL.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'members.student_id REFERENCES students(id). Which statement fails?',
      options: ['Deleting a student who still has a membership', 'Adding a membership for student 1', 'Deleting a student with no memberships'],
      answer: 0,
      explanation: 'A foreign key works both ways: no membership may point at a missing student.',
    },
  ],
  summary: [
    'Constraints are rules every row must follow, declared in CREATE TABLE.',
    'NOT NULL requires a value, UNIQUE forbids repeats, PRIMARY KEY identifies rows.',
    'CHECK refuses rows where a condition is false; NULL passes.',
    'REFERENCES keeps rows pointing at real rows in another table.',
  ],
};

export default content;
