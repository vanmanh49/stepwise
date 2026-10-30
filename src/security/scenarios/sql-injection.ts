import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { sql, type ShopDb } from '../web/db';
import { createShop, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const sqlInjectionCode = `function signIn(name, password) {
  query = "SELECT * FROM users WHERE name = '" + name + "' AND hash = '" + hash(password) + "'"
  return db.run(query)[0] ? startSession() : 401
}

function search(q) {
  query = "SELECT item, total, owner FROM orders WHERE item LIKE '%" + q + "%'"
  return db.run(query)
}

// Blocklist: refuse the words an attack uses
if (input has 'OR' or 'UNION' or '--') return 400

// Parameters: the text of the query never changes
db.run('SELECT * FROM users WHERE name = ?', [name])`;

export const QUERY_OPTIONS = ['Sign-in', 'Search'];

export const DEFENSE_OPTIONS = ['String building', 'Blocklist', 'Parameters'];

const QUERIES: Record<string, ShopOptions['queries']> = { 'String building': 'string', Blocklist: 'blocklist', Parameters: 'parameters' };

const WRONG_PASSWORD = 'not-the-password';
const MAX_ROWS_SHOWN = 8;
const TABLES = ['users', 'orders', 'comments'];

const LINES: Record<string, string> = { 'Sign-in': "query = \"SELECT * FROM users WHERE name", Search: "query = \"SELECT item, total, owner" };

const PARAMETERS_NOTE = 'This simulation quotes the value, because its interpreter has no bound parameters. Real drivers send the value apart from the query, so it can never be read as SQL.';

const tablesNow = (db: ShopDb) => JSON.stringify(TABLES.map((table) => db.execute(`SELECT * FROM ${table}`)));

type Run = { world: World; db: ShopDb; story: Story; input: string; parameters: boolean };

function showBlocked(story: Story) {
  story.step({
    title: 'The blocklist refuses the input → 400',
    why: 'The input holds OR, UNION or --, so it never reached a query. This check only knows that exact text, so anything it does not list gets through.',
    line: "if (input has 'OR'",
    variables: { status: 400, result: 'stopped' },
  });
}

function showQuery({ world, story, parameters }: Run, line: string) {
  story.step({
    title: 'The shop runs this query',
    why: parameters ? `The input stayed one quoted value. ${PARAMETERS_NOTE}` : 'The input was pasted into the text of the query, so the database can\'t tell what was code and what was data.',
    next: 'What does the database do with this text?',
    line: parameters ? 'db.run(\'SELECT * FROM users WHERE name = ?\'' : line,
    text: { label: 'Query', lines: { Final: world.site('shop').trace!.at(-1)! } },
  });
}

function signIn(run: Run) {
  const { world, db, story, input } = run;
  const before = tablesNow(db);
  const answer = world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: input, password: WRONG_PASSWORD });
  if (answer.status === 400) return showBlocked(story);
  showQuery(run, LINES['Sign-in']!);
  const changed = tablesNow(db) !== before;
  const signedIn = answer.status === 200;
  let why = `The password was wrong, so no row matched: ${answer.body}`;
  if (signedIn) why = `${answer.body} The password was wrong, but the input rewrote the query, so the password check never ran.`;
  if (answer.status === 500) why = `The shop shows: ${answer.body} A real site logs this and shows a plain page, because an error like this tells an attacker how the query is built.`;
  if (changed) why = `The sign-in query ran a second statement, and a table changed. Many real drivers refuse two statements in one call, but that is a side effect, not a defense.`;
  story.step({ title: `Sign-in → ${answer.status}`, why, line: 'return db.run(query)[0]', variables: { status: answer.status, result: resultOf(signedIn || changed) } });
}

function search(run: Run) {
  const { world, db, story, input } = run;
  const before = tablesNow(db);
  const honest = JSON.stringify(db.query(sql`SELECT item, total, owner FROM orders WHERE item LIKE ${`%${input}%`}`));
  const answer = world.browser.visit(`${SHOP_ORIGIN}/search?q=${encodeURIComponent(input)}`);
  if (answer.status === 400) return showBlocked(story);
  showQuery(run, LINES.Search!);
  const changed = tablesNow(db) !== before;
  const leaked = answer.status === 200 && JSON.stringify(answer.rows) !== honest;
  let why = `Rows returned: ${answer.rows?.length ?? 0}. The input was only a search term.`;
  if (answer.status === 500) why = `The shop shows: ${answer.body} A real site logs this and shows a plain page, because an error like this tells an attacker how the query is built.`;
  if (leaked) why = 'The input changed what the query returns, so these rows are not what a search should give. Each one came from the database, through a page meant for orders.';
  if (changed) why = 'The second statement ran and changed a table, so nothing here needed to be read. Many real drivers refuse two statements in one call, but that is a side effect, not a defense.';
  story.step({
    title: `Search → ${answer.status}`,
    why,
    line: 'return db.run(query)',
    variables: { status: answer.status, rows: answer.rows?.length ?? 0, result: resultOf(leaked || changed) },
    rows: rowsGrid((answer.rows ?? []).slice(0, MAX_ROWS_SHOWN), 'found'),
  });
}

const PLAY: Record<string, (run: Run) => void> = { 'Sign-in': signIn, Search: search };

export function sqlInjectionSteps(values: Record<string, string>): Step[] {
  const query = readChoice(values, 'query', 'Query', QUERY_OPTIONS);
  if (!query.ok) return refusal('Cannot run this query', query.why, EMPTY);
  const input = readBytes(values, 'input', 'Input', { min: 1, max: 120 });
  if (!input.ok) return refusal('Cannot run this query', input.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSE_OPTIONS);
  if (!defense.ok) return refusal('Cannot run this query', defense.why, EMPTY);

  // Unsalted, so the hash can sit in the query. No lockout, so a run is only about the query.
  const site = createShop({ storage: 'sha256', limit: 'none', queries: QUERIES[defense.value]! });
  const world = createWorld([site]);
  const story = createStory({ world, code: sqlInjectionCode, nodes: ['browser', 'shop', 'db'] });
  story.step({
    title: `${query.value}, ${defense.value}`,
    why: `The input is "${input.value}". ${query.value === 'Sign-in' ? 'It goes in as the name, with a wrong password.' : 'It goes in as the search term.'}`,
    next: 'Watch how the shop puts it into a query.',
    line: query.value === 'Sign-in' ? 'function signIn' : 'function search',
  });
  PLAY[query.value]!({ world, db: site.db!, story, input: input.value, parameters: defense.value === 'Parameters' });
  return story.steps;
}
