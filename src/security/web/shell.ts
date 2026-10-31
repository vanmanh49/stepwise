/** Two levels deep, so the classic `../../etc/passwd` really lands on `/etc/passwd`. */
export const FILES_ROOT = '/srv/files';

export const FILES: Record<string, string> = {
  [`${FILES_ROOT}/invoice.txt`]: 'Invoice 101: Lamp, 40.',
  [`${FILES_ROOT}/manual.txt`]: 'Lamp manual: press the button.',
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
  '/app/.env': 'DB_PASSWORD=fake-password',
};

type ShellRun = { commands: string[]; output: string };

const MAX_NESTING = 3;
const USER = 'www-data';

export function resolvePath(base: string, path: string): string {
  const parts: string[] = [];
  for (const part of `${path.startsWith('/') ? '' : base}/${path}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

type Connector = ';' | '&&' | '||' | '|';

/** The end of the `$(` whose `(` is at `open`, or -1 if it never closes. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === '(') depth++;
    if (text[at] === ')' && --depth === 0) return at;
  }
  return -1;
}

/** Calls `each` for every character outside quotes, backticks and `$(...)`. */
function walk(line: string, each: (at: number) => number | void) {
  let quote = '';
  for (let at = 0; at < line.length; at++) {
    const char = line[at]!;
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"' || (char === '`' && line.includes('`', at + 1))) {
      quote = char;
    } else if (line.startsWith('$(', at)) {
      const end = closingParen(line, at + 1);
      if (end >= 0) at = end;
    } else {
      at = each(at) ?? at;
    }
  }
}

function splitLine(line: string): { text: string; before: Connector }[] {
  const parts: { text: string; before: Connector }[] = [];
  let start = 0;
  let before: Connector = ';';
  const cut = (at: number, connector: Connector, width: number) => {
    parts.push({ text: line.slice(start, at), before });
    before = connector;
    start = at + width;
    return at + width - 1;
  };
  walk(line, (at) => {
    if (line.startsWith('&&', at)) return cut(at, '&&', 2);
    if (line.startsWith('||', at)) return cut(at, '||', 2);
    if (line[at] === '|') return cut(at, '|', 1);
    if (line[at] === ';' || line[at] === '&') return cut(at, ';', 1);
  });
  parts.push({ text: line.slice(start), before });
  return parts;
}

function words(text: string): string[] {
  const found: string[] = [];
  let word: string | null = null;
  let quote = '';
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = '';
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= '';
    } else if (/\s/.test(char)) {
      if (word !== null) found.push(word);
      word = null;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (word !== null) found.push(word);
  return found;
}

type Result = { output: string; ok: boolean };

const failed = (output: string): Result => ({ output, ok: false });

function runCommand([name = '', ...args]: string[], input: string): Result {
  switch (name) {
    case 'ping': {
      const host = args.at(-1);
      if (!host || host.startsWith('-')) return failed('ping: usage error: destination address required');
      return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? { output: `PING ${host}: 1 packet sent, 1 received`, ok: true } : failed(`ping: ${host}: Name or service not known`);
    }
    case 'cat': {
      if (args.length === 0) return { output: input, ok: true };
      const missing = args.find((path) => FILES[resolvePath(FILES_ROOT, path)] === undefined);
      if (missing !== undefined) return failed(`cat: ${missing}: No such file or directory`);
      return { output: args.map((path) => FILES[resolvePath(FILES_ROOT, path)]).join('\n'), ok: true };
    }
    case 'ls': {
      const folder = `${resolvePath(FILES_ROOT, args[0] ?? '.')}/`.replace('//', '/');
      const inside = Object.keys(FILES).filter((path) => path.startsWith(folder)).map((path) => path.slice(folder.length).split('/')[0]!);
      return { output: [...new Set(inside)].join('\n'), ok: true };
    }
    case 'whoami':
      return { output: USER, ok: true };
    case 'id':
      return { output: `uid=33(${USER}) gid=33(${USER}) groups=33(${USER})`, ok: true };
    case 'echo':
      return { output: args.join(' '), ok: true };
    default:
      return failed(`${name}: command not found`);
  }
}

/** Where a substitution at `at` ends, and what it holds. Null if there is none. */
function substitutionAt(text: string, at: number): { end: number; body: string } | null {
  const end = text[at] === '`' ? text.indexOf('`', at + 1) : text.startsWith('$(', at) ? closingParen(text, at + 1) : -1;
  return end < 0 ? null : { end, body: text.slice(at + (text[at] === '`' ? 1 : 2), end) };
}

/** Replaces each `$(...)` or backtick pair with what it printed, unless it is in single quotes. */
function expand(text: string, depth: number, commands: string[]): string {
  let result = '';
  let at = 0;
  let quote = '';
  while (at < text.length) {
    const char = text[at]!;
    if (quote) quote = char === quote ? '' : quote;
    else if (char === "'" || char === '"') quote = char;
    const found = quote === "'" ? null : substitutionAt(text, at);
    if (!found) {
      result += char;
      at++;
      continue;
    }
    // Past the limit the text stays as it is, but the scan moves on, so inner `$(` stay too.
    result += depth < MAX_NESTING ? runLine(found.body, depth + 1, commands) : text.slice(at, found.end + 1);
    at = found.end + 1;
  }
  return result;
}

function runLine(line: string, depth: number, commands: string[]): string {
  const printed: string[] = [];
  let last: Result = { output: '', ok: true };
  for (const { text, before } of splitLine(line)) {
    if ((before === '&&' && !last.ok) || (before === '||' && last.ok)) continue;
    const expanded = expand(text, depth, commands).trim();
    if (!expanded) continue;
    commands.push(expanded);
    if (before !== '|' && last.output) printed.push(last.output);
    last = runCommand(words(expanded), before === '|' ? last.output : '');
  }
  if (last.output) printed.push(last.output);
  return printed.join('\n');
}

/** One command with its arguments already apart, so nothing is parsed, as `execFile` does. */
export const runArgs = (args: string[]): ShellRun => ({ commands: [args.join(' ')], output: runCommand(args, '').output });

/** A fake shell over `FILES`. Commands are looked up in a switch, so nothing typed ever runs. */
export function runShell(line: string): ShellRun {
  const commands: string[] = [];
  return { output: runLine(line, 0, commands), commands };
}
