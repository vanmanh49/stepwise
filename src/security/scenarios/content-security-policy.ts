import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { USERS } from '../web/data';
import { createEvil, EVIL_ORIGIN, evilStolen } from '../web/evil';
import { loadPage, type ScriptRun } from '../web/page';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { injectedScripts, ownScript } from '../web/shop-pages';
import { createStory, resultOf, type Story } from '../web/story';
import { createWorld } from '../web/world';

export const contentSecurityPolicyCode = `// the shop forgot to encode, so input lands in the page
page = 'Results for ' + request.q

// the policy is a header, and the browser enforces it
headers['content-security-policy'] = policy
page += '<script nonce="' + nonce + '">...</script>'

function mayRun(script, policy) {
  if (!policy) return true
  if (script.nonce == policy.nonce) return true
  if (script.src) return policy.allowsHost(script.src)
  return policy.unsafeInline && !policy.nonce       // inline code and handlers
}`;

export const POLICY_OPTIONS = ['None', 'unsafe-inline', 'Nonce'];

const POLICIES: Record<string, ShopOptions['csp']> = { None: 'none', 'unsafe-inline': 'unsafeInline', Nonce: 'nonce' };

const STATUS_LINES: Record<ScriptRun['status'], string> = {
  ran: 'if (!policy) return true',
  blocked: 'function mayRun',
  'not understood': 'function mayRun',
  'waits for a click': 'function mayRun',
  'failed to load': 'if (script.src)',
};

function reportInjected(story: Story, script: ScriptRun) {
  const why: Record<ScriptRun['status'], string> = {
    ran: `It did this: ${script.actions.join(' ')}. The policy allowed it.`,
    blocked: `The browser refused it under ${script.rule}.`,
    'not understood': 'This simulation does not understand this script. It runs no real code, so it can\'t say what it would do. A browser would try to run it, if the policy allowed it.',
    'waits for a click': 'This handler only runs if someone clicks, so no one has run it yet.',
    'failed to load': `${script.actions.join(' ')}.`,
  };
  story.step({ title: script.status === 'blocked' ? 'The browser blocks a script' : `A script: ${script.status}`, why: why[script.status], line: STATUS_LINES[script.status], ...(script.rule && { variables: { rule: script.rule } }), text: { label: 'Script', lines: { Source: script.source } } });
}

export function contentSecurityPolicySteps(values: Record<string, string>): Step[] {
  const policy = readChoice(values, 'policy', 'Policy', POLICY_OPTIONS);
  if (!policy.ok) return refusal('Cannot run this', policy.why, EMPTY);
  const input = readBytes(values, 'input', 'Input', { min: 1, max: 120 });
  if (!input.ok) return refusal('Cannot run this', input.why, EMPTY);

  const world = createWorld([createShop({ encode: false, csp: POLICIES[policy.value]!, cookie: { ...SAFE_SHOP.cookie, httpOnly: false } }), createEvil()]);
  const story = createStory({ world, code: contentSecurityPolicyCode, nodes: ['browser', 'shop', 'evil'] });
  const alice = USERS[0];
  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: alice.name, password: alice.password });
  story.step({ title: `Policy: ${policy.value}`, why: `alice is signed in. This shop writes the search term into the page with no encoding. The term is "${input.value}".`, next: 'alice opens the search page.', line: "page = 'Results for '" });

  const run = loadPage(world, `${SHOP_ORIGIN}/search?q=${encodeURIComponent(input.value)}`, EVIL_ORIGIN);
  const header = run.response.headers['content-security-policy'] ?? 'none';
  story.step({
    title: 'The page arrives with its policy',
    why: header === 'none' ? 'The shop sent no policy, so the browser runs every script it finds.' : 'The header tells the browser which scripts may run on this page.',
    next: 'The browser checks each script against the policy.',
    line: "headers['content-security-policy']",
    text: { label: 'Page', lines: { Policy: header, Source: run.response.body } },
  });

  const injected = injectedScripts(run.scripts);
  for (const script of injected) reportInjected(story, script);
  const own = ownScript(run.scripts);
  if (own) story.step({ title: "The page's own script", why: "The page's own script ran, because the policy names it. A strict policy must not break the site.", line: 'function mayRun', text: { label: 'Script', lines: { Source: own.source } } });
  else story.step({ title: "The page's own script is gone", why: "The browser never reached the page's own script. The text left a tag open, so everything up to the next > was read as part of that tag.", line: "page = 'Results for '" });

  const ran = injected.some((script) => script.status === 'ran');
  const blocked = injected.find((script) => script.status === 'blocked');
  const stolen = evilStolen(world).find((text) => text.includes('sid=')) ?? 'nothing';
  let why = 'This text has nothing for the browser to run, so the page simply shows it.';
  if (injected.length > 0) why = 'Nothing else in this page ran.';
  if (blocked) why = `The policy stopped it, under ${blocked.rule}. The markup is still in the page, though, so the bug is still there. CSP is a second line, and encoding is the first.`;
  if (ran) why = `The input ran as code${stolen === 'nothing' ? '.' : `, and ${stolen} reached evil.example.`} ${policy.value === 'None' ? 'With no policy, nothing stood in the way.' : "'unsafe-inline' allows every inline script, so it can't tell the attacker's from the shop's."}`;
  story.step({ title: ran ? 'The input ran as code' : blocked ? 'The policy held' : 'Nothing else ran', why, line: 'function mayRun', variables: { stolen, result: resultOf(ran) } });
  return story.steps;
}
