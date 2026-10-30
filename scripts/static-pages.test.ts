import { describe, expect, it } from 'vitest';
import { sitePages, staticFiles } from './static-pages';

const HTML =
  '<head><meta name="description" content="Default." /><title>Default</title></head><body><script src="/stepwise/assets/a.js"></script></body>';
const SITE = 'https://example.github.io/stepwise/';
const page = { path: 'algorithms/x', title: 'X — Stepwise', description: 'About x.' };

describe('staticFiles', () => {
  it('writes each page with its own title, description and canonical address', () => {
    const html = staticFiles(HTML, SITE, [page])['algorithms/x/index.html']!;
    expect(html).toContain('<title>X — Stepwise</title>');
    expect(html).toContain('<meta name="description" content="About x." />');
    expect(html).toContain('<link rel="canonical" href="https://example.github.io/stepwise/algorithms/x/" />');
    expect(html).toContain('src="/stepwise/assets/a.js"');
  });

  it('escapes text and keeps dollar signs literal', () => {
    const html = staticFiles(HTML, SITE, [{ ...page, title: 'A & B', description: 'Say "$&" <now>' }])['algorithms/x/index.html']!;
    expect(html).toContain('<title>A &amp; B</title>');
    expect(html).toContain('content="Say &quot;$&amp;&quot; &lt;now&gt;"');
  });

  it('lists the home page and every page in the sitemap', () => {
    const sitemap = staticFiles(HTML, SITE, [page])['sitemap.xml']!;
    expect(sitemap).toContain('<loc>https://example.github.io/stepwise/</loc>');
    expect(sitemap).toContain('<loc>https://example.github.io/stepwise/algorithms/x/</loc>');
  });

  it('fails the build if the page template changes shape', () => {
    expect(() => staticFiles('<head></head>', SITE, [page])).toThrow(/title/);
  });
});

describe('sitePages', () => {
  it('covers every lesson, track and the Big O page, with no address twice', () => {
    const paths = sitePages().map((p) => p.path);
    expect(paths).toContain('algorithms/bubble-sort');
    expect(paths).toContain('kubernetes');
    expect(paths).toContain('big-o');
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toHaveLength(169 + 7 + 1);
  });

  it('names every track in the home page and site descriptions', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['index.html', 'src/pages/Home.tsx']) {
      expect(readFileSync(file, 'utf8').toLowerCase(), file).toContain('security');
    }
  });
});
