import { datasets } from '../../sql/datasets';
import { scriptStepView } from '../../sql/scriptSteps';
import type { Lesson } from '../../types/lesson';
import type { SessionsView } from '../../types/visualization';

const readTwice = (level: string) =>
  `A: SET TRANSACTION ISOLATION LEVEL ${level};\nA: BEGIN;\nA: SELECT balance FROM accounts WHERE id = 1;\nB: UPDATE accounts SET balance = 400 WHERE id = 1;\nA: SELECT balance FROM accounts WHERE id = 1;\nA: COMMIT;`;

const phantom = (level: string) =>
  `A: SET TRANSACTION ISOLATION LEVEL ${level};\nA: BEGIN;\nA: SELECT owner FROM accounts WHERE balance > 100;\nB: INSERT INTO accounts (owner, balance) VALUES ('Em', 700);\nA: SELECT owner FROM accounts WHERE balance > 100;\nA: COMMIT;`;

const lostUpdate = (level: string) =>
  `A: SET TRANSACTION ISOLATION LEVEL ${level};\nB: SET TRANSACTION ISOLATION LEVEL ${level};\nA: BEGIN;\nB: BEGIN;\nA: SELECT balance FROM accounts WHERE id = 1;\nB: SELECT balance FROM accounts WHERE id = 1;\nA: UPDATE accounts SET balance = 600 WHERE id = 1;\nA: COMMIT;\nB: UPDATE accounts SET balance = 450 WHERE id = 1;\nB: COMMIT;`;

const dirtyRead =
  'B: BEGIN;\nB: UPDATE accounts SET balance = 0 WHERE id = 1;\nA: SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nA: BEGIN;\nA: SELECT balance FROM accounts WHERE id = 1;\nB: ROLLBACK;\nA: COMMIT;';

const query = readTwice('READ COMMITTED');

const dirtyTables = scriptStepView(datasets.bank, dirtyRead, 4) as SessionsView;

export const isolationLevels: Lesson = {
  id: 'isolation-levels',
  title: 'Isolation Levels',
  category: 'sql',
  difficulty: 'advanced',
  group: 'Database internals',
  description: 'See what two transactions running at once can do to each other, and how each isolation level prevents it.',
  keywords: ['isolation level', 'read uncommitted', 'read committed', 'repeatable read', 'serializable', 'dirty read', 'non-repeatable read', 'phantom', 'lost update', 'locks', 'deadlock', 'concurrency'],
  prerequisites: ['transactions'],
  overview:
    'When two transactions run at the same time, one can see the other’s half-finished work, or change rows the other is still using. Isolation levels say how much of that is allowed. READ UNCOMMITTED allows the most; SERIALIZABLE makes the transactions behave as if they ran one after the other. Here, two sessions A and B take turns, and you can watch each anomaly happen or be prevented.',
  concept: [
    'Picture two bank clerks working on the same accounts at the same time. Each one is a session. A script here lists both clerks’ statements in the order they happen, A: … and B: …, and SET TRANSACTION ISOLATION LEVEL picks how carefully each one works.',
    'Four things can go wrong. A dirty read sees a change the other session has not committed and may still undo. A non-repeatable read reads the same row twice and gets two different values. A phantom repeats a query and finds new rows. A lost update overwrites a change the other session made after you read the row.',
    'The levels prevent more and more of them. READ UNCOMMITTED prevents none. READ COMMITTED prevents dirty reads. REPEATABLE READ also prevents non-repeatable reads and lost updates. SERIALIZABLE prevents phantoms too.',
    'This simulation follows the SQL standard with locks, as many databases do: a session that writes a row locks it until its transaction ends, and stricter levels also lock the rows, or whole tables, they read. A session that needs a locked row waits; if both wait for each other, that is a deadlock, and one of them is rolled back. Real databases differ in the details: SQLite itself lets only one session write at a time, and PostgreSQL uses snapshots instead of read locks.',
  ],
  howItWorks: [
    'Each statement runs in script order, in its session: A: or B:.',
    'A session sees committed rows plus its own changes; under READ UNCOMMITTED, also the other session’s uncommitted changes.',
    'Writes lock rows until the transaction ends; REPEATABLE READ also keeps read rows locked, and SERIALIZABLE locks the tables it reads.',
    'A statement that needs a lock the other session holds waits until that transaction ends.',
    'If both sessions wait for each other, B is rolled back so A can continue.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'bank',
    initialQuery: query,
    examples: [
      { label: 'Dirty read', query: dirtyRead },
      { label: 'Phantom', query: phantom('REPEATABLE READ') },
      { label: 'Lost update', query: lostUpdate('READ COMMITTED') },
      { label: 'Deadlock', query: lostUpdate('REPEATABLE READ') },
    ],
    exercises: [
      {
        id: 'repeatable',
        prompt: 'Change the level A uses so that A’s two reads of An’s balance give the same value.',
        solution: readTwice('REPEATABLE READ'),
        orderMatters: false,
        hint: 'Which level keeps the rows A has read locked until A commits?',
      },
      {
        id: 'no-phantom',
        prompt: 'Start from this script and change A’s level so that A’s second query finds the same accounts as the first:\n' + phantom('REPEATABLE READ'),
        solution: phantom('SERIALIZABLE'),
        orderMatters: false,
        hint: 'REPEATABLE READ locks the rows A read, but not the new row B adds. Which level locks the whole table?',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Stricter levels make concurrent transactions behave as if they ran one by one', 'Lower levels let more work happen at the same time', 'You can choose per transaction'],
    cons: ['Stricter levels make sessions wait, or end in deadlocks', 'Lower levels allow subtle bugs such as lost updates', 'Each database implements the levels a little differently'],
    useWhen: ['Several users change the same data at the same time', 'A report must see one consistent picture of the data'],
    avoidWhen: ['Reaching for SERIALIZABLE everywhere without measuring the waiting it causes'],
  },
  applications: [
    'Two cashiers selling the last ticket at the same moment',
    'A report that must add up while orders keep arriving',
    'Bank transfers that must never lose money',
    'Booking systems that must not double-book a seat',
  ],
  commonMistakes: [
    'Reading a value, computing a new one in the program, and writing it back under READ COMMITTED: a lost update.',
    'Assuming REPEATABLE READ also stops new rows from appearing (phantoms).',
    'Forgetting that a waiting session only goes on when the other transaction ends.',
    'Treating a deadlock as a bug in the database; the rolled-back transaction should simply be retried.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'B has just changed An’s balance to 400 and committed. A is under READ COMMITTED. What will A’s second read return?',
      view: scriptStepView(datasets.bank, query, 4),
      options: ['400', '500', 'Nothing: A waits'],
      answer: 0,
      explanation: 'READ COMMITTED sees every committed change, so the second read differs from the first: a non-repeatable read.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'B has set An’s balance to 0 but not committed. A now runs under READ UNCOMMITTED. What will A read for An?',
      view: { kind: 'table', clauses: [], tables: dirtyTables.tables },
      options: ['0', '500', 'Nothing: A waits'],
      answer: 0,
      explanation: 'READ UNCOMMITTED sees uncommitted changes. B then rolls back, so A has read a value that never really existed: a dirty read.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which anomaly can still happen under REPEATABLE READ?',
      options: ['A phantom', 'A dirty read', 'A non-repeatable read'],
      answer: 0,
      explanation: 'REPEATABLE READ locks the rows it has read, but a new row inserted by the other session is not one of them.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Both sessions read 500. A sets 600 and commits; then B sets 450 and commits. What is An’s balance at the end?',
      code: lostUpdate('READ COMMITTED'),
      options: ['450', '600', '500'],
      answer: 0,
      explanation: 'B never saw A’s 600, so its write replaces it: A’s update is lost. Under REPEATABLE READ this ends in a deadlock instead.',
    },
  ],
  summary: [
    'Isolation levels decide how much concurrent transactions see of each other.',
    'READ COMMITTED stops dirty reads; REPEATABLE READ also stops non-repeatable reads and lost updates; SERIALIZABLE also stops phantoms.',
    'Stricter levels make sessions wait, and two waiting sessions can deadlock.',
    'SET TRANSACTION ISOLATION LEVEL chooses the level before BEGIN.',
  ],
};
