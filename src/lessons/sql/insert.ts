import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { LessonContent } from '../../types/lesson';

const query = "INSERT INTO customers (id, name, city, joined) VALUES (11, 'Tam', 'Hue', '2024-03-01');\nSELECT * FROM customers WHERE id = 11;";

const content: LessonContent = {
  overview:
    'INSERT adds rows to a table. You name the table, optionally list the columns you are filling, and give the values. The database checks every rule of the table as each row goes in, and refuses rows that break one.',
  concept: [
    'Think of a table as a sign-up sheet. INSERT writes a new line on it. INSERT INTO customers (name, city) VALUES (\'Tam\', \'Hue\') writes a line with Tam in the name column and Hue in the city column.',
    'The column list says which value goes where, in order. Columns you leave out get their DEFAULT value, or NULL when there is none. An INTEGER PRIMARY KEY you leave out gets the next free number automatically, so you rarely type ids yourself.',
    'One INSERT can add several rows: put several value lists after VALUES, separated by commas. It can also take its rows from a query: INSERT INTO books SELECT … copies whatever the SELECT returns.',
    'Values are stored as the column type says, so \'5\' put into an INTEGER column becomes the number 5. Every constraint, such as NOT NULL or a foreign key, is checked before the row is kept; if one fails, the whole INSERT is undone.',
  ],
  howItWorks: [
    'INSERT INTO names the table to add to.',
    'The column list (optional) says which columns the values fill; without it, every column must get a value in table order.',
    'VALUES gives one list of values per new row; INSERT … SELECT uses the rows a query returns instead.',
    'Missing columns get their DEFAULT, NULL, or the next id for an INTEGER PRIMARY KEY.',
    'Each row is checked against the table’s constraints; one failure stops the statement and undoes it.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'shop',
    initialQuery: query,
    examples: [
      {
        label: 'Several rows',
        query: "INSERT INTO customers (name, city) VALUES ('Tam', 'Hue'), ('Vy', NULL);\nSELECT * FROM customers WHERE id > 10;",
      },
      { label: 'Leave columns out', query: "INSERT INTO customers (name) VALUES ('Khoa');\nSELECT * FROM customers WHERE id = 11;" },
      {
        label: 'Copy with SELECT',
        query:
          "CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, price REAL);\nINSERT INTO books SELECT id, name, price FROM products WHERE category = 'Books';\nSELECT * FROM books;",
      },
      { label: 'Fails: missing name', query: "INSERT INTO customers (id, city) VALUES (11, 'Hue');" },
    ],
    exercises: [
      {
        id: 'add-product',
        prompt: 'Add product 10: a Mug in the Kitchen category that costs 7.5.',
        solution: "INSERT INTO products (id, name, category, price) VALUES (10, 'Mug', 'Kitchen', 7.5);",
        orderMatters: false,
        probes: ['SELECT * FROM products'],
        hint: 'List the four columns, then give four values in the same order.',
      },
      {
        id: 'two-customers',
        prompt: 'Add two customers with one INSERT: Tam from Hue and Vy from Can Tho. Let the database pick their ids.',
        solution: "INSERT INTO customers (name, city) VALUES ('Tam', 'Hue'), ('Vy', 'Can Tho');",
        orderMatters: false,
        probes: ['SELECT name, city FROM customers'],
        hint: 'Put two value lists after VALUES, separated by a comma.',
      },
      {
        id: 'copy-books',
        prompt:
          'Start with CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, price REAL); then copy the id, name and price of every Books product into it.',
        solution:
          "CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, price REAL);\nINSERT INTO books SELECT id, name, price FROM products WHERE category = 'Books';",
        orderMatters: false,
        probes: ['SELECT * FROM books'],
        hint: 'INSERT INTO books SELECT … takes its rows from a query.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Adds many rows in one statement', 'Fills ids and defaults for you', 'Constraints stop bad data at the door'],
    cons: ['Without a column list, values must match the table’s column order exactly', 'One bad row undoes the whole statement'],
    useWhen: ['Adding new records', 'Copying the result of a query into a table'],
    avoidWhen: ['Changing rows that already exist (use UPDATE)'],
  },
  applications: [
    'Saving a new sign-up, order or message',
    'Loading a batch of rows from a file or another table',
    'Building a summary table from a query with INSERT … SELECT',
  ],
  commonMistakes: [
    'Leaving out the column list, so a later change to the table puts values in the wrong columns.',
    'Giving a different number of values than columns.',
    'Typing ids by hand and clashing with an existing row; let INTEGER PRIMARY KEY pick them.',
    'Quoting numbers or forgetting quotes around text.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This INSERT is about to run on the 10 customers shown. How many rows will customers have afterwards?',
      view: scriptViewAt(datasets.shop, query, 0),
      options: ['11', '10', '12'],
      answer: 0,
      explanation: 'One VALUES list means one new row, so 10 becomes 11.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'customers.id is an INTEGER PRIMARY KEY and the largest id is 10. What id does Tam get?',
      code: "INSERT INTO customers (name) VALUES ('Tam');",
      options: ['11', 'NULL', '1'],
      answer: 0,
      explanation: 'An INTEGER PRIMARY KEY left out gets one more than the largest existing value.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'customers.name is NOT NULL. What happens to INSERT INTO customers (id, city) VALUES (11, \'Hue\')?',
      options: ['It fails and nothing is added', 'It adds the row with name NULL', 'It adds the row with an empty name'],
      answer: 0,
      explanation: 'Leaving name out makes it NULL, which NOT NULL refuses, so the whole statement is undone.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does INSERT INTO books SELECT id, name, price FROM products WHERE category = \'Books\' do?',
      options: ['Copies every Books product into books', 'Moves the products out of products', 'Creates the books table'],
      answer: 0,
      explanation: 'INSERT … SELECT adds the rows the query returns. products is unchanged, and books must already exist.',
    },
  ],
  summary: [
    'INSERT INTO table (columns) VALUES (…) adds rows.',
    'Columns left out get their DEFAULT, NULL, or the next id.',
    'Several value lists add several rows; INSERT … SELECT copies a query’s rows.',
    'Every constraint is checked, and one failure undoes the statement.',
  ],
};

export default content;
