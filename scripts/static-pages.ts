import { CATEGORIES, CATEGORY_INTRO, CATEGORY_TITLE } from '../src/lessons/labels';
import { lessons } from '../src/lessons/lessonList';

export interface Page {
  /** Address below the site root, with no leading or trailing slash. */
  path: string;
  title: string;
  description: string;
}

const TITLE = /<title>.*?<\/title>/;
const DESCRIPTION = /<meta name="description" content="[^"]*" \/>/;
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ENTITIES[c]!);

/** Every public page. The dashboard is left out: it only shows this browser's own progress. */
export function sitePages(): Page[] {
  return [
    ...CATEGORIES.map((category) => ({ path: category, title: `${CATEGORY_TITLE[category]} — Stepwise`, description: CATEGORY_INTRO[category] })),
    ...lessons.map((lesson) => ({ path: `${lesson.category}/${lesson.id}`, title: `${lesson.title} — Stepwise`, description: lesson.description })),
    { path: 'big-o', title: 'Big O explorer — Stepwise', description: 'Compare how algorithm running times grow as the input gets bigger.' },
  ];
}

/**
 * The built index.html copied once per page, plus a sitemap. Without these GitHub Pages answers
 * every deep link with its 404 page, which search engines don't index. Keyed by output file.
 */
export function staticFiles(html: string, siteUrl: string, pages: Page[]): Record<string, string> {
  if (!TITLE.test(html) || !DESCRIPTION.test(html)) throw new Error('index.html needs a <title> and a meta description to replace');
  const files: Record<string, string> = {};
  for (const { path, title, description } of pages) {
    files[`${path}/index.html`] = html
      .replace(TITLE, () => `<title>${escape(title)}</title>`)
      .replace(DESCRIPTION, () => `<meta name="description" content="${escape(description)}" />\n    <link rel="canonical" href="${siteUrl}${path}/" />`);
  }
  const urls = [siteUrl, ...pages.map((page) => `${siteUrl}${page.path}/`)];
  files['sitemap.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((url) => `  <url><loc>${url}</loc></url>\n`).join('') +
    `</urlset>\n`;
  return files;
}
