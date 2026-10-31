import { describe, expect, it } from 'vitest';
import { escapeHtml, findScripts, parseHtml, type FoundScript } from './html';

const inline = (source: string, nonce?: string): FoundScript => ({ source, kind: 'inline', ...(nonce && { nonce }) });
const handler = (source: string): FoundScript => ({ source, kind: 'handler' });
const image = (source: string, src = 'x'): FoundScript => ({ source, kind: 'handler', image: src });
const waits = (source: string): FoundScript => ({ source, kind: 'waits' });

describe('findScripts', () => {
  it.each<[string, 'page' | 'inner', FoundScript[]]>([
    ['<script>alert(1)</script>', 'page', [inline('alert(1)')]],
    ['<script>alert(1)</script>', 'inner', []],
    ['<ScRiPt>alert(1)</sCrIpT>', 'page', [inline('alert(1)')]],
    ['<script nonce="abc">alert(1)</script>', 'page', [inline('alert(1)', 'abc')]],
    ['<script src=https://evil.example/x.js></script>', 'page', [{ source: 'https://evil.example/x.js', kind: 'external' }]],
    ['<script src=https://evil.example/x.js></script>', 'inner', []],
    ['<img src=x onerror=alert(1)>', 'page', [image('alert(1)')]],
    ['<img src=x onerror=alert(1)>', 'inner', [image('alert(1)')]],
    ['<IMG SRC=x ONERROR=alert(1)>', 'page', [image('alert(1)')]],
    ['<svg onload="alert(1)">', 'page', [handler('alert(1)')]],
    ['<svg onload="alert(1)">', 'inner', [handler('alert(1)')]],
    ['<svg/onload=alert(1)>', 'page', [handler('alert(1)')]],
    ["<body onload='alert(1)'>", 'page', [handler('alert(1)')]],
    ['<a onclick=alert(1)>go</a>', 'page', [waits('alert(1)')]],
    ['<a href="javascript:alert(1)">go</a>', 'page', [waits('alert(1)')]],
    ['<a href="https://shop.example/">go</a>', 'page', []],
    ['<img src=x>', 'page', []],
  ])('%s under %s', (html, sink, scripts) => {
    expect(findScripts(html, sink)).toEqual(scripts);
  });

  it('drops a body tag set through innerHTML, as the parser does', () => {
    expect(findScripts("<body onload='alert(1)'>", 'inner')).toEqual([]);
  });

  it('fires no onerror on an image with no source', () => {
    expect(findScripts('<img onerror=alert(1)>', 'page')).toEqual([waits('alert(1)')]);
  });

  it('finds nothing in a script with no closing tag', () => {
    expect(findScripts('<script>alert(1)', 'page')).toEqual([]);
  });

  it('makes no tag when the > is missing', () => {
    expect(parseHtml('<img src=x onerror=alert(1)')).toEqual([]);
    expect(findScripts('<img src=x onerror=alert(1)', 'page')).toEqual([]);
  });

  it('runs nothing inside a comment, a style or a textarea', () => {
    expect(findScripts('<!-- <script>alert(1)</script> -->', 'page')).toEqual([]);
    expect(findScripts('<!-- <script>alert(1)</script>', 'page')).toEqual([]);
    expect(findScripts('<textarea><script>alert(1)</script></textarea>', 'page')).toEqual([]);
    expect(findScripts('<style><img src=x onerror=alert(1)></style>', 'page')).toEqual([]);
  });

  it('runs what follows a closed comment', () => {
    expect(findScripts('<!-- a --><script>alert(1)</script>', 'page')).toEqual([inline('alert(1)')]);
  });

  it('drops the nonce of a tag that swallowed another script tag', () => {
    const scripts = findScripts('<script src=https://evil.example/x.js <script nonce="abc"></script>', 'page');
    expect(scripts).toEqual([{ source: 'https://evil.example/x.js', kind: 'external' }]);
  });

  it('finds several, in page order', () => {
    expect(findScripts('hi <script>alert(1)</script> <img src=x onerror=alert(2)>', 'page')).toEqual([inline('alert(1)'), image('alert(2)')]);
  });

  it('finds nothing in an escaped payload', () => {
    for (const payload of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">']) {
      expect(findScripts(escapeHtml(payload), 'page')).toEqual([]);
    }
  });

  it.each(['plain text', '', '<<<', '<', '< script>alert(1)</script>', '<1>', '</', '<a b', '<a b=', '<a b="'])('stays calm on %s', (html) => {
    expect(findScripts(html, 'page')).toEqual([]);
  });
});

describe('parseHtml', () => {
  it('lowers names and keeps every quote style', () => {
    expect(parseHtml(`<A HREF="x y" title='a>b' id=c disabled>`)).toEqual([{ name: 'a', attributes: { href: 'x y', title: 'a>b', id: 'c', disabled: '' }, text: '' }]);
  });

  it('keeps the first of two equal attributes', () => {
    expect(parseHtml('<a id=1 id=2>')[0]!.attributes.id).toBe('1');
  });

  it('gives a script its text', () => {
    expect(parseHtml('<script>a<b</script>')[0]!.text).toBe('a<b');
  });

  it('treats a closing tag as no tag', () => {
    expect(parseHtml('</b>')).toEqual([]);
  });
});

describe('escapeHtml', () => {
  it('replaces the five characters', () => {
    expect(escapeHtml('<a href="x">\'&')).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
});
