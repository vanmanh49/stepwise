import type { Browser } from './browser';
import { absoluteUrl, cookieHeader } from './http';

export type Value = ({ text: string } | { read: 'cookie' | 'href' })[];

export type Statement = { kind: 'alert' | 'log' | 'fetch' | 'navigate' | 'image'; value: Value };

const UNDERSTOOD = 'This simulation understands alert(...), console.log(...), fetch(...), location = ... and new Image().src = ..., with quoted text, numbers, document.cookie and location.href joined by +.';

const refused = { ok: false as const, why: UNDERSTOOD };

/** A value's parts, or null when the text is not a value. */
function parseValue(text: string): Value | null {
  const parts: Value = [];
  let rest = text.trim();
  for (;;) {
    const quote = rest[0];
    if (quote === "'" || quote === '"') {
      const end = rest.indexOf(quote, 1);
      if (end < 0) return null;
      parts.push({ text: rest.slice(1, end) });
      rest = rest.slice(end + 1).trim();
    } else {
      const word = /^(document\.cookie|location\.href|\d+)/.exec(rest)?.[0];
      if (!word) return null;
      parts.push(word === 'document.cookie' ? { read: 'cookie' } : word === 'location.href' ? { read: 'href' } : { text: word });
      rest = rest.slice(word.length).trim();
    }
    if (!rest) return parts;
    if (rest[0] !== '+') return null;
    rest = rest.slice(1).trim();
  }
}

const CALLS: [string, Statement['kind']][] = [
  ['alert(', 'alert'],
  ['console.log(', 'log'],
  ['fetch(', 'fetch'],
];

const ASSIGNMENTS: [RegExp, Statement['kind']][] = [
  [/^(?:document\.location|location\.href|location)\s*=(?!=)/, 'navigate'],
  [/^new\s+Image\(\)\.src\s*=(?!=)/, 'image'],
];

function parseStatement(text: string): Statement | null {
  for (const [start, kind] of CALLS) {
    if (!text.startsWith(start) || !text.endsWith(')')) continue;
    const value = parseValue(text.slice(start.length, -1));
    return value && { kind, value };
  }
  for (const [start, kind] of ASSIGNMENTS) {
    const match = start.exec(text);
    if (!match) continue;
    const value = parseValue(text.slice(match[0].length));
    return value && { kind, value };
  }
  return null;
}

/** Splits on `;`, leaving any inside quotes where they are. */
function splitStatements(text: string): string[] {
  const parts: string[] = [];
  let quote = '';
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    if (quote) quote = char === quote ? '' : quote;
    else if (char === "'" || char === '"') quote = char;
    else if (char === ';') {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** A fixed set of forms. Anything else is refused, so nothing typed is ever evaluated. */
export function parsePageScript(text: string): { ok: true; statements: Statement[] } | { ok: false; why: string } {
  const parts = splitStatements(text);
  const statements = parts.map(parseStatement);
  if (parts.length === 0 || statements.includes(null)) return refused;
  return { ok: true, statements: statements as Statement[] };
}

/** Runs parsed statements as a page on `origin`, and returns one plain line per action. */
export function runPageScript(statements: Statement[], origin: string, browser: Browser, href: string): string[] {
  const read = (value: Value) =>
    value.map((part) => ('text' in part ? part.text : part.read === 'href' ? href : cookieHeader(browser.runScript(origin)))).join('');
  const reported = (status: number, url: string, done: string) => (status === 0 ? `could not reach ${url}: no such host` : done);

  return statements.map(({ kind, value }) => {
    if (kind === 'alert') return `alert(${JSON.stringify(read(value))})`;
    if (kind === 'log') return `console.log(${JSON.stringify(read(value))})`;
    const url = absoluteUrl(origin, read(value));
    if (kind === 'navigate') return reported(browser.visit(url, origin).status, url, `moved the page to ${url}`);
    const { status } = kind === 'fetch' ? browser.fetchFrom(origin, url) : browser.subresource(url, origin);
    return reported(status, url, `sent a request to ${url}`);
  });
}
