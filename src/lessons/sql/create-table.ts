import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { LessonContent } from '../../types/lesson';

const query =
  "CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT, founded INTEGER);\nINSERT INTO clubs (name, founded) VALUES ('Chess', 2019), ('Drama', 2021);\nSELECT * FROM clubs;";

const content: LessonContent = {
  overview:
    'CREATE TABLE makes a new, empty table. You give it a name and list its columns, each with a type such as INTEGER, REAL or TEXT, and optionally a default value or a rule. DROP TABLE removes a table and all its rows.',
  concept: [
    'A table is like a form with fixed fields. CREATE TABLE designs the form: CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT, founded INTEGER) says every club has an id, a name and a founding year.',
    'The type says what a column holds. INTEGER is for whole numbers, REAL for numbers with decimals, and TEXT for words. SQLite is relaxed about types: it converts \'2020\' to the number 2020 for an INTEGER column, but keeps text that is not a number as text.',
    'A column marked INTEGER PRIMARY KEY becomes the table’s id: each row’s id is unique, and when you insert a row without one, SQLite gives it the next number. DEFAULT gives a column a value to use whenever an INSERT leaves it out.',
    'The new table starts empty; INSERT adds the rows. If you need to start over, DROP TABLE clubs removes the table completely, and DROP TABLE IF EXISTS clubs does so only when it exists, so it never fails.',
  ],
  howItWorks: [
    'CREATE TABLE gives the table a name that no other table uses.',
    'Each column gets a name and a type: INTEGER, REAL or TEXT.',
    'INTEGER PRIMARY KEY makes a column the self-numbering id; DEFAULT sets a value for when a column is left out.',
    'The table starts with no rows; INSERT adds them.',
    'DROP TABLE removes a table and every row in it.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'school',
    initialQuery: query,
    examples: [
      {
        label: 'Types convert',
        query: "CREATE TABLE scores (name TEXT, points INTEGER, ratio REAL);\nINSERT INTO scores VALUES ('Mai', '42', '0.5'), ('Tuan', 7, 1);\nSELECT * FROM scores;",
      },
      {
        label: 'DEFAULT values',
        query:
          "CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', priority INTEGER DEFAULT 3);\nINSERT INTO tasks (title) VALUES ('Read chapter 2');\nSELECT * FROM tasks;",
      },
      {
        label: 'Automatic ids',
        query: "CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO rooms (name) VALUES ('A1'), ('B2'), ('C3');\nSELECT * FROM rooms;",
      },
      {
        label: 'Drop and recreate',
        query:
          "DROP TABLE IF EXISTS clubs;\nCREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT);\nDROP TABLE clubs;\nCREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT, members INTEGER DEFAULT 0);\nINSERT INTO clubs (name) VALUES ('Chess');\nSELECT * FROM clubs;",
      },
    ],
    exercises: [
      {
        id: 'rooms',
        prompt: 'Create a table rooms with an id that numbers itself, a name (text) and seats (a whole number).',
        solution: 'CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT, seats INTEGER);',
        orderMatters: false,
        probes: ['SELECT * FROM rooms', "INSERT INTO rooms (name, seats) VALUES ('Lab', '30'); SELECT id, name, seats FROM rooms"],
        hint: 'id INTEGER PRIMARY KEY numbers itself; seats should be INTEGER so 30 is stored as a number.',
      },
      {
        id: 'clubs',
        prompt: 'Create a table clubs with an id that numbers itself and a name, then add the clubs Chess, Drama and Music.',
        solution: "CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO clubs (name) VALUES ('Chess'), ('Drama'), ('Music');",
        orderMatters: false,
        probes: ['SELECT id, name FROM clubs'],
        hint: 'Separate the two statements with a semicolon.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Describes exactly what every row looks like', 'Types and defaults keep data consistent', 'INTEGER PRIMARY KEY gives every row a unique id for free'],
    cons: ['Changing a table’s design later takes extra work', 'SQLite converts values loosely, so a wrong type can go unnoticed'],
    useWhen: ['Starting to store a new kind of record', 'Making a scratch table for intermediate results'],
    avoidWhen: ['The data fits an existing table; add rows to it instead'],
  },
  applications: [
    'Designing the tables of a new app: users, posts, comments',
    'Creating a table to collect the results of a report',
    'Setting up test data for an exercise or experiment',
  ],
  commonMistakes: [
    'Using a name that another table already has.',
    'Storing numbers in a TEXT column, so they sort as text ("10" before "9").',
    'Forgetting a primary key, which makes rows hard to tell apart.',
    'Writing INT PRIMARY KEY and expecting automatic ids; in SQLite only INTEGER PRIMARY KEY numbers itself.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'clubs has just been created. How many rows does it have before the INSERT runs?',
      view: scriptViewAt(datasets.school, query, 1),
      options: ['0', '2', '1'],
      answer: 0,
      explanation: 'A new table is always empty. The INSERT in the next statement adds the two clubs.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What is stored in points?',
      code: "CREATE TABLE s (points INTEGER);\nINSERT INTO s VALUES ('42');",
      options: ['The number 42', "The text '42'", 'NULL'],
      answer: 0,
      explanation: "An INTEGER column converts text that is a whole number, so '42' becomes 42.",
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'tasks has status TEXT DEFAULT \'open\'. What does INSERT INTO tasks (title) VALUES (\'Read\') store in status?',
      options: ["'open'", 'NULL', "'Read'"],
      answer: 0,
      explanation: 'A column left out of an INSERT gets its DEFAULT.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is the difference between DELETE FROM clubs and DROP TABLE clubs?',
      options: ['DELETE removes the rows and keeps the table; DROP removes the table too', 'They are the same, and DROP is only the shorter way to write it', 'DROP only removes the first row, and DELETE removes the table'],
      answer: 0,
      explanation: 'After DELETE you can still insert into clubs. After DROP TABLE, clubs no longer exists.',
    },
  ],
  summary: [
    'CREATE TABLE name (column TYPE, …) makes a new, empty table.',
    'INTEGER, REAL and TEXT are the column types; SQLite converts values that fit.',
    'INTEGER PRIMARY KEY numbers rows itself; DEFAULT fills columns an INSERT leaves out.',
    'DROP TABLE removes a table and its rows.',
  ],
};

export default content;
