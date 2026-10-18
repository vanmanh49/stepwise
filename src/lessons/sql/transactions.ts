import { datasets } from '../../sql/datasets';
import { scriptViewAt } from '../../sql/scriptSteps';
import type { LessonContent } from '../../types/lesson';

const query =
  'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nCOMMIT;\nSELECT * FROM accounts;';

const content: LessonContent = {
  overview:
    'A transfer takes money from one account and adds it to another: two UPDATEs that must both happen, or neither. A transaction groups them. After BEGIN, changes are pending; COMMIT keeps them all, ROLLBACK undoes them all. Savepoints mark points inside a transaction you can roll back to.',
  concept: [
    'Think of a shopping basket. You put things in (the statements), and nothing is bought until you pay (COMMIT). Empty the basket instead (ROLLBACK) and it is as if you had never started. Either everything in it is bought, or nothing is.',
    'Without BEGIN, every statement is its own transaction and is saved at once. If the program crashed between the two UPDATEs of a transfer, 100 would vanish. Inside BEGIN … COMMIT, a crash before COMMIT undoes both.',
    'If a statement inside a transaction fails, for example because a CHECK rule refuses a negative balance, SQLite undoes that statement only. The transaction stays open, and it is up to you to ROLLBACK, or to fix things and COMMIT.',
    'SAVEPOINT fee marks a point inside the transaction. ROLLBACK TO fee undoes only what happened after it, and the transaction carries on. A transaction still open when the connection closes is rolled back.',
  ],
  howItWorks: [
    'BEGIN starts the transaction; the changes that follow are pending.',
    'Each statement still checks its rules; a failing one is undone on its own.',
    'SAVEPOINT name marks a point; ROLLBACK TO name undoes the changes since it.',
    'COMMIT makes every pending change permanent.',
    'ROLLBACK, or ending without COMMIT, undoes every change since BEGIN.',
  ],
  visualization: {
    kind: 'sql',
    dataset: 'bank',
    initialQuery: query,
    examples: [
      {
        label: 'ROLLBACK',
        query: 'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nROLLBACK;\nSELECT * FROM accounts;',
      },
      {
        label: 'A failed step',
        query: 'BEGIN;\nUPDATE accounts SET balance = balance + 400 WHERE id = 3;\nUPDATE accounts SET balance = balance - 400 WHERE id = 2;\nCOMMIT;\nSELECT * FROM accounts;',
      },
      {
        label: 'SAVEPOINT',
        query:
          'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nSAVEPOINT fee;\nUPDATE accounts SET balance = balance - 5 WHERE id = 1;\nROLLBACK TO fee;\nCOMMIT;\nSELECT * FROM accounts;',
      },
      { label: 'Forgetting COMMIT', query: 'BEGIN;\nDELETE FROM transfers;\nSELECT COUNT(*) FROM transfers;' },
    ],
    exercises: [
      {
        id: 'transfer',
        prompt: 'In one transaction, move 200 from Dung (id 4) to Chi (id 3), and record it in transfers.',
        solution:
          'BEGIN;\nUPDATE accounts SET balance = balance - 200 WHERE id = 4;\nUPDATE accounts SET balance = balance + 200 WHERE id = 3;\nINSERT INTO transfers (from_id, to_id, amount) VALUES (4, 3, 200);\nCOMMIT;',
        orderMatters: false,
        probes: ['SELECT id, balance FROM accounts', 'SELECT from_id, to_id, amount FROM transfers'],
        hint: 'BEGIN, two UPDATEs and an INSERT, then COMMIT.',
      },
      {
        id: 'savepoint',
        prompt: 'In one transaction, move 100 from An (id 1) to Binh (id 2). Then set a savepoint, take a fee of 5 from An, change your mind: undo only the fee, and commit the transfer.',
        solution:
          'BEGIN;\nUPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2;\nSAVEPOINT fee;\nUPDATE accounts SET balance = balance - 5 WHERE id = 1;\nROLLBACK TO fee;\nCOMMIT;',
        orderMatters: false,
        probes: ['SELECT id, balance FROM accounts'],
        hint: 'SAVEPOINT fee before the fee, ROLLBACK TO fee after it, then COMMIT.',
      },
    ],
  },
  code: query,
  prosCons: {
    pros: ['Several changes succeed or fail together', 'A crash or error never leaves half a change', 'Savepoints let you undo part of the work'],
    cons: ['A long transaction holds on to its changes, which can make others wait', 'Forgetting COMMIT loses the work', 'A failed statement does not end the transaction by itself'],
    useWhen: ['Several changes only make sense together, such as a transfer', 'You may need to undo a batch of changes'],
    avoidWhen: ['A single statement, which is already atomic', 'Keeping a transaction open while waiting for a person'],
  },
  applications: [
    'Moving money between accounts',
    'Placing an order: the order row, its items and the stock change together',
    'Importing a file: all rows or none',
    'Trying a risky change and rolling it back if a check fails',
  ],
  commonMistakes: [
    'Running the two halves of a transfer without BEGIN, so a failure between them loses money.',
    'Assuming a failed statement rolls back the whole transaction; it only undoes itself.',
    'Forgetting COMMIT, so the changes disappear when the connection closes.',
    'Writing BEGIN twice; a transaction is already open.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Both UPDATEs are pending. If the next statement were ROLLBACK instead of COMMIT, what would happen to them?',
      view: scriptViewAt(datasets.bank, query, 17),
      options: ['Both are undone', 'Only the second one is undone', 'Both are kept'],
      answer: 0,
      explanation: 'ROLLBACK undoes every change since BEGIN, so An and Binh are back to 500 and 300.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'The script ends here. What is An’s balance afterwards?',
      code: 'BEGIN;\nUPDATE accounts SET balance = 0 WHERE id = 1;',
      options: ['500', '0', 'NULL'],
      answer: 0,
      explanation: 'Nothing committed the transaction, so it is rolled back when the script ends.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Inside BEGIN … COMMIT, an UPDATE breaks a CHECK rule. What is undone?',
      options: ['Only that UPDATE; the transaction stays open', 'Everything since BEGIN', 'Nothing; the change is kept'],
      answer: 0,
      explanation: 'SQLite undoes the failing statement only. You then decide: ROLLBACK, or fix things and COMMIT.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does ROLLBACK TO fee do?',
      options: ['Undoes the changes made since SAVEPOINT fee; the transaction stays open', 'Ends the transaction and undoes everything', 'Commits the changes made before SAVEPOINT fee'],
      answer: 0,
      explanation: 'A savepoint is a marker inside the transaction. Rolling back to it keeps the earlier changes pending.',
    },
  ],
  summary: [
    'BEGIN … COMMIT makes several statements succeed or fail together.',
    'ROLLBACK, or ending without COMMIT, undoes every change since BEGIN.',
    'A failing statement inside a transaction undoes only itself.',
    'SAVEPOINT and ROLLBACK TO undo part of a transaction.',
  ],
};

export default content;
