// Fails the build when the JavaScript every page loads first grows past its budget, or when
// lesson content leaks back into it (lessons should load only when opened). Run after a build.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 600;
const dist = process.argv[2] ?? 'dist';

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = [
  ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
].map((m) => join(dist, m[1].slice(m[1].indexOf('assets/'))));

// A sentence from a lesson's quiz: lesson text must never be part of the first load.
const lessonSource = readFileSync('src/lessons/algorithms/bubble-sort.ts', 'utf8');
const marker = /prompt: '([^'\\]{20,})/.exec(lessonSource)?.[1];
if (!marker) throw new Error('No quiz prompt found in bubble-sort.ts to check for');

let total = 0;
const problems = [];
for (const file of scripts) {
  const size = statSync(file).size;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(8)} kB  ${file}`);
  if (readFileSync(file, 'utf8').includes(marker)) problems.push(`${file} contains lesson content ("${marker}")`);
}
console.log(`${(total / 1024).toFixed(1).padStart(8)} kB  first load (budget ${BUDGET_KB} kB)`);
if (total > BUDGET_KB * 1024) problems.push(`first-load JavaScript is ${(total / 1024).toFixed(1)} kB, over the ${BUDGET_KB} kB budget`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-bundle: ${problem}`);
  process.exit(1);
}
