import { databasePerServiceCode, databasePerServiceSteps, RENAME_AT } from '../../microservices/scenarios/database-per-service';
import type { LessonContent } from '../../types/lesson';

const shared = { model: 'shared', rename: 'yes' };

const afterRename = databasePerServiceSteps(shared).find((s) => s.title === 'users renames users.name to users.full_name')!;

const content: LessonContent = {
  overview:
    `When several services read and write the same database, a change made by one team can break another team's service without either of them touching the other's code. Database per service means each service owns its data and others get it only through its API. In this lesson the users team renames a column at ${RENAME_AT} ms, once with a shared database and once with a database per service.`,
  concept: [
    'A shared database is the quickest way to split a monolith: every service connects to the same tables. But the table layout becomes a contract between all of them, even though nobody wrote it down.',
    'If the users team renames users.name to users.full_name and updates its own queries, its service keeps working. The orders service, which also reads users.name, starts failing, and the users team may not even know orders reads that table.',
    'With a database per service, users-db belongs to the users service alone. Orders asks the users service for a name through its API. The users team can change its table freely, as long as its API stays the same.',
    'The price is an extra network hop, and data that no longer sits in one place: there are no joins across services, and keeping data consistent needs patterns such as sagas, covered later in this track.',
  ],
  howItWorks: [
    'The client sends 4 GET /orders/1 through the gateway, one every 30 ms.',
    'Shared: orders queries shared-db for orders.id and users.name.',
    'Per service: orders queries its own orders-db, then asks the users service, which queries users-db.',
    `With the rename on, at ${RENAME_AT} ms the users team renames users.name to users.full_name and updates its own queries.`,
    'Watch which requests fail after the rename, and compare the times in the request table.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'model', label: 'Data model', type: 'choice', sample: shared.model, options: ['shared', 'per-service'] },
      { name: 'rename', label: 'Rename users.name', type: 'choice', sample: shared.rename, options: ['no', 'yes'], help: `At ${RENAME_AT} ms the users team renames it to users.full_name.` },
    ],
    presets: [
      { label: 'Shared database', values: shared },
      { label: 'Database per service', values: { model: 'per-service', rename: 'yes' } },
    ],
    generate: databasePerServiceSteps,
    codeLabel: 'Pseudocode',
  },
  code: databasePerServiceCode,
  prosCons: {
    pros: ['Each team can change its own tables without breaking others', 'Each service can pick the database that suits it', 'A database problem stays inside one service'],
    cons: ['Reading data owned by another service costs a network call', 'No joins or transactions across services', 'The same fact may be copied into several services'],
    useWhen: ['Teams own their services and deploy them on their own', 'Services have different data needs'],
    avoidWhen: ['A small system where one team owns everything', 'Most queries join data from every part of the system'],
  },
  applications: [
    'Shops where orders, users and inventory each keep their own database',
    'Moving a monolith to services one table group at a time',
    'Services that need different storage, such as a search index next to a relational database',
  ],
  commonMistakes: [
    'Splitting the code into services but keeping one shared database, so every schema change is risky.',
    'Reading another service\'s tables directly "just this once".',
    'Expecting joins and transactions to work across services as they did in one database.',
    'Changing a service\'s API as freely as its tables: the API is the contract other teams rely on.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With a shared database, the users team has just renamed users.name to users.full_name and updated its own queries. What happens to the next GET /orders/1?',
      view: afterRename.view,
      options: ['It fails: the orders query still asks for users.name', 'It succeeds: the database renames the column in every query', 'It succeeds: orders asks the users service', 'It waits until the users team rolls back'],
      answer: 0,
      explanation: 'Orders reads the users table directly, and nobody updated its query. The column it needs is gone.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the same rename break nothing with a database per service?',
      options: ['Only the users service reads users-db, and its API does not change', 'The rename is not allowed', 'Orders caches the old column', 'The gateway hides the change'],
      answer: 0,
      explanation: 'The table is private to the users service. Other services only see its API.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'In the per-service version, which line keeps orders independent of the users table?',
      code: 'function getOrderOwned(id) {\n  const order = ordersDb.query("SELECT id FROM orders ...")\n  const user = users.get(order.userId)\n  return { ...order, user }\n}',
      options: ['users.get(order.userId): it asks the users service instead of its table', 'ordersDb.query(...)', 'return { ...order, user }', 'function getOrderOwned(id)'],
      answer: 0,
      explanation: 'Orders never names a users column; it calls the users API, which the users team keeps stable.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a database per service cost?',
      options: ['Extra network calls and no joins or transactions across services', 'A slower database engine', 'One database per request', 'Nothing'],
      answer: 0,
      explanation: 'Data from another service comes through its API, and keeping copies consistent becomes your job.',
    },
  ],
  summary: [
    'A shared database turns every table into an unwritten contract between services.',
    'One team\'s schema change can break another team\'s service.',
    'With a database per service, others reach the data only through the owner\'s API.',
    'You trade extra hops and harder consistency for teams that can change their data freely.',
  ],
};

export default content;
