import { allowsScript } from './csp';
import { findScripts, type FoundScript } from './html';
import { absoluteUrl, originOf, type WebResponse } from './http';
import { parsePageScript, runPageScript } from './pageScript';
import type { World } from './world';

export type ScriptRun = { source: string; status: 'ran' | 'blocked' | 'not understood' | 'waits for a click' | 'failed to load'; rule?: string; actions: string[] };

export type PageRun = { response: WebResponse; scripts: ScriptRun[] };

/** Stands in for the page's own script, which picks `innerHTML` or `textContent`. */
export const HASH_SINK = 'x-hash-sink';

function runScript(world: World, script: FoundScript, pageUrl: string, policy: string | undefined): ScriptRun {
  const origin = originOf(pageUrl);
  const { source } = script;
  if (script.kind === 'waits') return { source, status: 'waits for a click', actions: [] };

  const url = script.kind === 'external' ? absoluteUrl(origin, source) : undefined;
  const { allowed, rule } = allowsScript(policy, script, origin, url);
  if (!allowed) return { source, status: 'blocked', ...(rule && { rule }), actions: [] };

  // A browser only fires onerror if the image really fails.
  if (script.image !== undefined && world.browser.subresource(absoluteUrl(origin, script.image), origin).headers['content-type']?.startsWith('image/')) {
    return { source, status: 'waits for a click', actions: [] };
  }

  let text = source;
  if (url !== undefined) {
    const answer = world.browser.subresource(url, origin);
    if (answer.status !== 200) return { source, status: 'failed to load', actions: [`could not load ${url}`] };
    text = answer.body;
  }
  const parsed = parsePageScript(text);
  if (!parsed.ok) return { source, status: 'not understood', actions: [parsed.why] };
  return { source, status: 'ran', actions: runPageScript(parsed.statements, origin, world.browser, pageUrl) };
}

const runAll = (world: World, html: string, sink: 'page' | 'inner', pageUrl: string, response: WebResponse) =>
  findScripts(html, sink).map((script) => runScript(world, script, pageUrl, response.headers['content-security-policy']));

const withoutFragment = (url: string) => url.split('#')[0]!;

/** Visits a page, then runs each script its policy allows. A fragment stays in the browser. */
export function loadPage(world: World, url: string, initiator?: string): PageRun {
  const response = world.browser.visit(withoutFragment(url), initiator);
  return { response, scripts: runAll(world, response.body, 'page', url, response) };
}

/** Visits a page whose own script then writes `html` into itself, as `location.hash` code does. */
export function loadInner(world: World, pageUrl: string, html: string): PageRun {
  const response = world.browser.visit(withoutFragment(pageUrl));
  return { response, scripts: response.headers[HASH_SINK] === 'textContent' ? [] : runAll(world, html, 'inner', pageUrl, response) };
}
