import { DEFENSE_OPTIONS, QUERY_OPTIONS, sqlInjectionCode, sqlInjectionSteps } from '../../security/scenarios/sql-injection';
import type { LessonContent } from '../../types/lesson';
import type { PanelsView } from '../../types/visualization';

const [SIGN_IN, SEARCH] = QUERY_OPTIONS;
const [STRING, BLOCKLIST, PARAMETERS] = DEFENSE_OPTIONS;
const defaults = { query: SIGN_IN!, input: "alice' --", defense: STRING! };
// Only the query: the wire panel of this step already shows how the sign-in ended.
const finalQuery = (sqlInjectionSteps(defaults).at(-2)!.view as PanelsView).panels.find((panel) => panel.label === 'Query')!;

const content: LessonContent = {
  overview:
    'SQL injection happens when text from a user becomes part of a query. The database can\'t tell where the data ends and the code begins, so the user can rewrite the query. Here you type real payloads into a shop\'s sign-in and search, and a real SQL interpreter runs whatever the shop builds.',
  concept: [
    'A query built by joining strings has no border between code and data. If a name holds a quote mark, that quote ends the string early, and everything after it is read as SQL.',
    "alice' -- closes the name, then -- turns the rest of the line into a comment. The check on the password is gone, so the query only asks for alice.",
    'A UNION joins a second query to the first, as long as the columns line up. The search page then shows password hashes where order items should be. Nothing here broke into the database: the shop asked for those rows itself.',
    'A blocklist looks for dangerous text. Attackers have a lot of ways to write the same thing, such as lower case, so a blocklist only stops the examples its author thought of.',
    'Parameters fix the cause. The query is sent first, with a placeholder, and the value travels apart from it. The database has already read the query, so the value can never become code. This simulation quotes the value instead, because its interpreter has no bound parameters.',
    'An ORM uses parameters for you, until someone joins strings into a raw query. In production, use parameters everywhere, give the app\'s database account only the rights it needs, and log SQL errors rather than show them. Names of tables and columns can\'t be parameters, so choose those from a fixed list.',
  ],
  howItWorks: [
    'The shop takes text from a request.',
    'With string building, it pastes that text into the query.',
    'A quote mark in the text ends the string, and the rest becomes SQL.',
    'The database runs the new query, and the shop trusts what comes back.',
    'With parameters, the query\'s text never changes, and the input stays one value.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'query', label: 'Query', type: 'choice', sample: defaults.query, options: QUERY_OPTIONS, help: 'Sign-in uses a wrong password. Search looks through orders.' },
      { name: 'input', label: 'Input', type: 'text', sample: defaults.input, help: '1 to 120 bytes. It goes straight into the shop, so try your own.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'How the shop handles the input.' },
    ],
    presets: [
      { label: 'Skip the password', values: defaults },
      { label: 'Steal hashes', values: { query: SEARCH!, input: "' UNION SELECT name, hash, role FROM users --", defense: STRING! } },
      { label: 'Drop a table', values: { query: SEARCH!, input: "'; DROP TABLE orders --", defense: STRING! } },
      { label: 'Beat the blocklist', values: { query: SEARCH!, input: "' union select name, hash, role from users where name like '", defense: BLOCKLIST! } },
      { label: 'A stray quote', values: { query: SEARCH!, input: "'", defense: STRING! } },
      { label: 'Parameters', values: { ...defaults, defense: PARAMETERS! } },
    ],
    generate: sqlInjectionSteps,
    codeLabel: 'Pseudocode',
  },
  code: sqlInjectionCode,
  prosCons: {
    pros: ['Parameters remove the whole class of bug', 'They are in every database driver', 'They need no list of bad words'],
    cons: ['One string-built query is enough to lose the database', 'Table and column names can\'t be parameters', 'Blocklists look like protection and are not'],
    useWhen: ['Every query that holds a value from outside the code'],
    avoidWhen: ['Joining input into a query, escaped by hand or not', 'Relying on a blocklist or a web firewall as the only control'],
  },
  applications: [
    'Sign-in forms that build their check from strings',
    'Search and filter pages',
    'Reports where a sort column comes from the address',
  ],
  commonMistakes: [
    'Filtering words instead of separating data from code.',
    'Trusting a value because it came from a dropdown. A request can carry anything.',
    'Showing SQL errors to users, which explains the query to an attacker.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the query the shop built for the name alice\' -- with a wrong password. What does the sign-in do?',
      view: finalQuery.view,
      options: ['alice is signed in, because the password check became a comment', 'It fails, because the password is wrong', 'The database refuses two dashes', 'The shop locks the account'],
      answer: 0,
      explanation: 'Everything after -- is a comment, so the query only asks for the name alice.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why do parameters stop injection when a blocklist does not?',
      options: ['The value travels apart from the query, so it is never read as code', 'They remove quote marks', 'They block the word UNION in any case', 'They encrypt the query'],
      answer: 0,
      explanation: 'A blocklist guesses at bad input. Parameters leave nothing for the input to change.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'This blocklist checks the input. Which input gets past it and still reads the users table?',
      code: "if (input has 'OR' or 'UNION' or '--') return 400",
      options: ["' union select name, hash, role from users where name like '", "' UNION SELECT name, hash, role FROM users --", "alice' --", 'None of them'],
      answer: 0,
      explanation: 'The check matches exact text. Lower case slips past, and the trailing quote replaces the comment.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A typed quote gives a 500 page showing the SQL error. Why does that matter?',
      options: ['It tells an attacker how the query is built, and that input reaches it', 'It deletes the table', 'It signs the user in', 'It has no effect'],
      answer: 0,
      explanation: 'An error like this is often the first sign an attacker looks for. Log it, and show a plain page.',
    },
  ],
  summary: [
    'Injection happens when data becomes part of the code.',
    'A quote mark ends the string, and the rest is SQL.',
    'UNION reads other tables through an ordinary page.',
    'Blocklists stop examples, not the attack.',
    'Parameters keep the value apart from the query.',
  ],
};

export default content;
