export type Tag = { name: string; attributes: Record<string, string>; text: string };

export type FoundScript = { source: string; kind: 'inline' | 'external' | 'handler' | 'waits'; nonce?: string };

/** Tags whose content the parser reads as plain text, so markup inside them stays inert. */
const RAW_TEXT = ['script', 'style', 'textarea', 'title'];

const SPACE = /\s/;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ENTITIES[char]!);

/**
 * One pass over the text. A tag with no closing `>`, or a raw-text tag with no closing tag, is
 * dropped, which is what browsers do at the end of the input.
 * shortcut: entities in attribute values aren't decoded, so such a payload reads as not understood; decode them if a lesson needs it.
 */
export function parseHtml(text: string): Tag[] {
  const tags: Tag[] = [];
  const lower = text.toLowerCase();
  let at = 0;

  const readValue = () => {
    const quote = text[at];
    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, at + 1);
      if (end < 0) return null;
      const value = text.slice(at + 1, end);
      at = end + 1;
      return value;
    }
    const start = at;
    while (at < text.length && !SPACE.test(text[at]!) && text[at] !== '>') at++;
    return text.slice(start, at);
  };

  /** Leaves `at` just past the `>`, or returns null at the end of the input. */
  const readAttributes = () => {
    const attributes: Record<string, string> = {};
    while (at < text.length) {
      if (text[at] === '>') {
        at++;
        return attributes;
      }
      if (SPACE.test(text[at]!) || text[at] === '/') {
        at++;
        continue;
      }
      const start = at;
      while (at < text.length && !SPACE.test(text[at]!) && !'=>/'.includes(text[at]!)) at++;
      const name = lower.slice(start, at);
      while (at < text.length && SPACE.test(text[at]!)) at++;
      let value = '';
      if (text[at] === '=') {
        at++;
        while (at < text.length && SPACE.test(text[at]!)) at++;
        const read = readValue();
        if (read === null) return null;
        value = read;
      }
      if (!(name in attributes)) attributes[name] = value;
    }
    return null;
  };

  while (at < text.length) {
    const open = text.indexOf('<', at);
    if (open < 0) break;
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4);
      if (end < 0) break;
      at = end + 3;
      continue;
    }
    at = open + 1;
    if (!/[a-z]/i.test(text[at] ?? '')) continue;
    const start = at;
    while (at < text.length && !SPACE.test(text[at]!) && !'/>'.includes(text[at]!)) at++;
    const name = lower.slice(start, at);
    const attributes = readAttributes();
    if (!attributes) break;
    let body = '';
    if (RAW_TEXT.includes(name)) {
      const close = lower.indexOf(`</${name}`, at);
      if (close < 0) break;
      body = text.slice(at, close);
      const end = text.indexOf('>', close);
      if (end < 0) break;
      at = end + 1;
    }
    tags.push({ name, attributes, text: body });
  }
  return tags;
}

/** What fires with no click: an image that fails to load, or an `svg` or `body` that loads. */
const firesAlone = ({ name, attributes }: Tag, attribute: string, sink: 'page' | 'inner') => {
  if (name === 'img') return attribute === 'onerror' && 'src' in attributes;
  return attribute === 'onload' && (name === 'svg' || (name === 'body' && sink === 'page'));
};

/** The scripts a page would run. `inner` is HTML set through `innerHTML`, where `<script>` stays inert. */
export function findScripts(html: string, sink: 'page' | 'inner'): FoundScript[] {
  const scripts: FoundScript[] = [];
  for (const tag of parseHtml(html)) {
    if (tag.name === 'script') {
      // Browsers refuse a nonce on a tag that swallowed another, so an open tag can't borrow the next one's.
      const stolen = Object.entries(tag.attributes).some(([name, value]) => /<(script|style)/i.test(name + value));
      const nonce = stolen ? undefined : tag.attributes.nonce;
      if (sink === 'inner') continue;
      const { src } = tag.attributes;
      if (src !== undefined) scripts.push({ source: src, kind: 'external', ...(nonce && { nonce }) });
      else if (tag.text) scripts.push({ source: tag.text, kind: 'inline', ...(nonce && { nonce }) });
      continue;
    }
    // `innerHTML` drops a `<body>` tag, along with its handlers.
    if (tag.name === 'body' && sink === 'inner') continue;
    for (const [attribute, value] of Object.entries(tag.attributes)) {
      if (attribute.startsWith('on') && attribute.length > 2) scripts.push({ source: value, kind: firesAlone(tag, attribute, sink) ? 'handler' : 'waits' });
      if (attribute === 'href' && /^\s*javascript:/i.test(value)) scripts.push({ source: value.slice(value.indexOf(':') + 1), kind: 'waits' });
    }
  }
  return scripts;
}
