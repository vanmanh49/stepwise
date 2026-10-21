// Fails the build when the JavaScript every page loads first grows past its budget, or when
// lesson content leaks back into it (lessons should load only when opened). Run after a build.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Checks a built `dist` folder. `marker` is text from a lesson's quiz: it must appear in the build
 * (proving it is spelled as the build writes it) but in none of the first-load files.
 * @returns {{ files: { file: string; size: number }[]; total: number; problems: string[] }}
 */
export function checkBundle(dist, marker, budgetKb = 600) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const tags = (pattern) => [...html.matchAll(pattern)].map((m) => m[0]);
  // A whole attribute name only, so data-type= doesn't count as type=.
  const attr = (tag, name) => new RegExp(`\\s${name}="([^"]+)"`).exec(tag)?.[1];
  const asset = (url) => join(dist, url.slice(url.indexOf('assets/')));

  const problems = [];
  const entries = tags(/<script\b[^>]*>/g).filter((tag) => attr(tag, 'type') === 'module' && attr(tag, 'src'));
  if (entries.length !== 1) problems.push(`expected exactly one entry script, found ${entries.length}`);
  const preloads = tags(/<link\b[^>]*>/g).filter((tag) => attr(tag, 'rel') === 'modulepreload' && attr(tag, 'href'));
  const urls = [...entries.map((tag) => attr(tag, 'src')), ...preloads.map((tag) => attr(tag, 'href'))];

  const files = urls.map((url) => ({ file: asset(url), size: statSync(asset(url)).size }));
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > budgetKb * 1024) problems.push(`first-load JavaScript is ${(total / 1024).toFixed(1)} kB, over the ${budgetKb} kB budget`);
  for (const { file } of files) {
    if (readFileSync(file, 'utf8').includes(marker)) problems.push(`${file} contains lesson content ("${marker}")`);
  }
  const built = readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js'));
  if (!built.some((name) => readFileSync(join(dist, 'assets', name), 'utf8').includes(marker))) {
    problems.push(`the lesson text "${marker}" was not found in any built file, so the leak check can't work`);
  }
  return { files, total, problems };
}

// Command line: `node scripts/check-bundle.mjs [dist]`, run from the repository root. The real path
// is compared because import.meta.url resolves symlinks and process.argv[1] doesn't.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const budgetKb = 600;
  const lessonSource = readFileSync('src/lessons/algorithms/bubble-sort.ts', 'utf8');
  const marker = /prompt: '([^'\\]{20,})/.exec(lessonSource)?.[1];
  if (!marker) throw new Error('No quiz prompt found in bubble-sort.ts to check for');
  const { files, total, problems } = checkBundle(process.argv[2] ?? 'dist', marker, budgetKb);
  for (const { file, size } of files) console.log(`${(size / 1024).toFixed(1).padStart(8)} kB  ${file}`);
  console.log(`${(total / 1024).toFixed(1).padStart(8)} kB  first load (budget ${budgetKb} kB)`);
  for (const problem of problems) console.error(`check-bundle: ${problem}`);
  if (problems.length > 0) process.exit(1);
}
