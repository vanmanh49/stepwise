import type { Role, Step } from '../../types/visualization';
import { readText, refusal } from '../form';
import { alignGrid, paint, range } from './align';

export const rabinKarpCode = `function rabinKarp(text: string, pattern: string): number[] {
  const m = pattern.length, matches: number[] = [];
  const target = hash(pattern); // (Σ code × 256^k) mod 101
  let window = hash(text.slice(0, m));
  for (let i = 0; i + m <= text.length; i++) {
    if (window === target && text.slice(i, i + m) === pattern) {
      matches.push(i); // hashes match and so do the characters
    }
    if (i + m < text.length) window = roll(window, text[i], text[i + m]); // drop one, add one
  }
  return matches;
}`;

const LINE = { target: 3, window: 4, compare: 6, match: 7, roll: 9, done: 11 };

const BASE = 256;
const MOD = 101;

function hash(s: string): number {
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * BASE + s.charCodeAt(k)) % MOD;
  return h;
}

/** BASE^(m − 1) mod MOD: the weight of the character leaving the window. */
function highWeight(m: number): number {
  let w = 1;
  for (let k = 1; k < m; k++) w = (w * BASE) % MOD;
  return w;
}

function roll(h: number, out: string, into: string, high: number): number {
  const dropped = (h - ((out.charCodeAt(0) * high) % MOD) + MOD) % MOD;
  return (dropped * BASE + into.charCodeAt(0)) % MOD;
}

export function rabinKarpSearch(text: string, pattern: string): { matches: number[]; spuriousHits: number[] } {
  const m = pattern.length;
  const matches: number[] = [];
  const spuriousHits: number[] = [];
  if (m > text.length) return { matches, spuriousHits };
  const target = hash(pattern);
  const high = highWeight(m);
  let window = hash(text.slice(0, m));
  for (let i = 0; i + m <= text.length; i++) {
    if (window === target) (text.slice(i, i + m) === pattern ? matches : spuriousHits).push(i);
    if (i + m < text.length) window = roll(window, text[i]!, text[i + m]!, high);
  }
  return { matches, spuriousHits };
}

export function rabinKarpSteps(values: Record<string, string>): Step[] {
  const textRead = readText(values, 'text', 'Text', { min: 1, max: 20 });
  if (!textRead.ok) return refusal('Check the text', textRead.why, alignGrid('', '', 0));
  const patternRead = readText(values, 'pattern', 'Pattern', { min: 1, max: 10 });
  if (!patternRead.ok) return refusal('Check the pattern', patternRead.why, alignGrid(textRead.value, '', 0));
  const text = textRead.value;
  const pattern = patternRead.value;
  const m = pattern.length;
  const target = hash(pattern);

  const steps: Step[] = [
    {
      title: `Hash the pattern: ${target}`,
      why: `A hash squeezes "${pattern}" into one small number: each character code is weighted by a power of ${BASE} and the total is taken modulo ${MOD}. Comparing two numbers is much cheaper than comparing ${m} characters.`,
      codeLine: LINE.target,
      variables: { 'pattern hash': target },
      view: alignGrid(text, pattern, 0, {}, paint(range(0, m), 'pivot')),
    },
  ];
  if (m > text.length) {
    steps.push({
      title: 'The pattern is longer than the text',
      why: `"${pattern}" has ${m} characters and the text only ${text.length}, so it cannot occur.`,
      codeLine: LINE.done,
      view: alignGrid(text, pattern, 0),
    });
    return steps;
  }

  const high = highWeight(m);
  const matches: number[] = [];
  const done = () => paint(matches.flatMap((s) => range(s, s + m)), 'sorted');
  let window = hash(text.slice(0, m));
  for (let i = 0; i + m <= text.length; i++) {
    const vars = { i, 'window hash': window, 'pattern hash': target };
    const windowText = text.slice(i, i + m);
    const textRoles: Record<number, Role> = { ...done(), ...paint(range(i, i + m), 'compare') };
    if (window !== target) {
      steps.push({
        title: `Window "${windowText}": hash ${window} ≠ ${target}`,
        why: `${i === 0 ? `The first window’s hash is computed in full. ` : `The hash was updated from the previous window by removing "${text[i - 1]}" and adding "${text[i + m - 1]}", in constant time. `}Different hashes mean different strings, so no characters need comparing.`,
        codeLine: i === 0 ? LINE.window : LINE.roll,
        variables: vars,
        view: alignGrid(text, pattern, i, textRoles),
      });
    } else if (windowText === pattern) {
      matches.push(i);
      steps.push({
        title: `Match at index ${i}`,
        why: `The hashes are equal (${window}), so the characters are compared one by one to make sure. They all match.`,
        codeLine: LINE.match,
        variables: vars,
        view: alignGrid(text, pattern, i, { ...done(), ...paint(range(i, i + m), 'found') }, paint(range(0, m), 'found')),
      });
    } else {
      steps.push({
        title: 'Hashes match, characters differ',
        why: `"${windowText}" and "${pattern}" both hash to ${window}: a collision. Many strings share each of the ${MOD} possible hashes, which is why every hash match is checked character by character.`,
        codeLine: LINE.compare,
        variables: vars,
        view: alignGrid(text, pattern, i, { ...done(), ...paint(range(i, i + m), 'discarded') }, paint(range(0, m), 'discarded')),
      });
    }
    if (i + m < text.length) window = roll(window, text[i]!, text[i + m]!, high);
  }

  steps.push({
    title: matches.length > 0 ? `Found at ${matches.length === 1 ? 'index' : 'indexes'} ${matches.join(', ')}` : 'No match',
    why: 'Each window’s hash was rolled from the previous one in constant time, and characters were compared only when the hashes agreed. On average that makes the search O(n + m).',
    codeLine: LINE.done,
    variables: { matches: matches.length },
    view: alignGrid(text, pattern, text.length - m, done()),
  });
  return steps;
}
