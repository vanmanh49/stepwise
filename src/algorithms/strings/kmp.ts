import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import { readText, refusal } from '../form';
import { alignGrid, paint, range } from './align';

export const kmpCode = `function kmpSearch(text: string, pattern: string): number[] {
  const fail = failureTable(pattern); // longest proper prefix that is also a suffix
  const matches: number[] = [];
  let j = 0; // characters of the pattern matched so far
  for (let i = 0; i < text.length; i++) {
    while (j > 0 && text[i] !== pattern[j]) j = fail[j - 1]; // fall back, keep i
    if (text[i] === pattern[j]) j++;
    if (j === pattern.length) {
      matches.push(i - j + 1); // full match
      j = fail[j - 1]; // keep looking for overlapping matches
    }
  }
  return matches;
}

function failureTable(pattern: string): number[] {
  const fail = [0];
  let k = 0;
  for (let q = 1; q < pattern.length; q++) {
    while (k > 0 && pattern[q] !== pattern[k]) k = fail[k - 1];
    if (pattern[q] === pattern[k]) k++;
    fail[q] = k;
  }
  return fail;
}`;

const LINE = { table: 2, fallback: 6, compare: 7, match: 9, done: 13, fill: 22 };

export function failureTable(pattern: string): number[] {
  const fail = [0];
  let k = 0;
  for (let q = 1; q < pattern.length; q++) {
    while (k > 0 && pattern[q] !== pattern[k]) k = fail[k - 1]!;
    if (pattern[q] === pattern[k]) k++;
    fail[q] = k;
  }
  return fail;
}

export function kmpSearch(text: string, pattern: string): number[] {
  const fail = failureTable(pattern);
  const matches: number[] = [];
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    while (j > 0 && text[i] !== pattern[j]) j = fail[j - 1]!;
    if (text[i] === pattern[j]) j++;
    if (j === pattern.length) {
      matches.push(i - j + 1);
      j = fail[j - 1]!;
    }
  }
  return matches;
}

function failureGrid(pattern: string, fail: (number | undefined)[], roles: Record<number, Role> = {}): GridView {
  return {
    kind: 'grid',
    colLabels: [...pattern],
    rows: [{ label: 'fail', cells: [...pattern].map((_, q) => ({ id: `f${q}`, value: fail[q] ?? '—', role: roles[q] ?? 'default' })) }],
  };
}

export function kmpSteps(values: Record<string, string>): Step[] {
  const textRead = readText(values, 'text', 'Text', { min: 1, max: 20 });
  if (!textRead.ok) return refusal('Check the text', textRead.why, alignGrid('', '', 0));
  const patternRead = readText(values, 'pattern', 'Pattern', { min: 1, max: 10 });
  if (!patternRead.ok) return refusal('Check the pattern', patternRead.why, alignGrid(textRead.value, '', 0));
  const text = textRead.value;
  const pattern = patternRead.value;
  const m = pattern.length;
  const fail = failureTable(pattern);

  const shownFail: (number | undefined)[] = [0];
  const steps: Step[] = [
    {
      title: 'Build the failure table first',
      why: `fail[q] is the length of the longest proper prefix of "${pattern.slice(0, 1)}…" that is also a suffix of the first q + 1 pattern characters. When a mismatch happens after matching some characters, it says how much of the match can be kept, so the text never has to be re-read.`,
      next: 'fail[0] is always 0.',
      codeLine: LINE.table,
      view: failureGrid(pattern, shownFail, { 0: 'sorted' }),
    },
  ];
  for (let q = 1; q < m; q++) {
    shownFail[q] = fail[q];
    const k = fail[q]!;
    steps.push({
      title: `fail[${q}] = ${k}`,
      why:
        k === 0
          ? `No prefix of the pattern ends at "${pattern.slice(0, q + 1)}", so after a mismatch here the search starts the pattern over.`
          : `"${pattern.slice(0, k)}" is both a prefix of the pattern and the end of "${pattern.slice(0, q + 1)}", so ${k} character${k === 1 ? '' : 's'} can be kept.`,
      codeLine: LINE.fill,
      variables: { q, 'fail[q]': k },
      view: failureGrid(pattern, shownFail, { [q]: 'active', ...(k > 0 ? paint(range(0, k), 'compare') : {}) }),
    });
  }

  if (m > text.length) {
    steps.push({
      title: 'The pattern is longer than the text',
      why: `"${pattern}" has ${m} characters and the text only ${text.length}, so it cannot occur.`,
      codeLine: LINE.done,
      view: failureGrid(pattern, fail),
    });
    return steps;
  }

  const view = (shift: number, textRoles: Record<number, Role>, patternRoles: Record<number, Role>, failRoles: Record<number, Role> = {}): PanelsView => ({
    kind: 'panels',
    panels: [
      { label: 'Match', view: alignGrid(text, pattern, shift, textRoles, patternRoles) },
      { label: 'Failure table', view: failureGrid(pattern, fail, failRoles) },
    ],
  });
  const matches: number[] = [];
  const found = () => paint(matches.flatMap((s) => range(s, s + m)), 'sorted');
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    while (j > 0 && text[i] !== pattern[j]) {
      const before = j;
      j = fail[j - 1]!;
      steps.push({
        title: `Mismatch: fall back from ${before} to ${j} matched`,
        why: `text[${i}] = "${text[i]}" does not match pattern[${before}] = "${pattern[before]}". fail[${before - 1}] = ${j}: the last ${j} matched characters are already a prefix of the pattern, so slide the pattern right and keep them. i stays at ${i}.`,
        codeLine: LINE.fallback,
        variables: { i, j },
        view: view(i - j, { ...found(), ...paint(range(i - j, i), 'compare'), [i]: 'active' }, paint(range(0, j), 'compare'), { [before - 1]: 'active' }),
      });
    }
    const shift = i - j;
    if (text[i] === pattern[j]) {
      j++;
      steps.push({
        title: `"${text[i]}" matches: ${j} of ${m}`,
        why: `text[${i}] equals pattern[${j - 1}], so one more character of the pattern is matched.`,
        codeLine: LINE.compare,
        variables: { i, j },
        view: view(shift, { ...found(), ...paint(range(shift, i), 'found'), [i]: 'found' }, paint(range(0, j), 'found')),
      });
    } else {
      steps.push({
        title: `"${text[i]}" does not match "${pattern[0]}"`,
        why: 'Nothing is matched yet, so there is nothing to keep. Move on to the next text character.',
        codeLine: LINE.compare,
        variables: { i, j },
        view: view(shift, { ...found(), [i]: 'discarded' }, { 0: 'discarded' }),
      });
    }
    if (j === m) {
      const start = i - m + 1;
      matches.push(start);
      steps.push({
        title: `Match at index ${start}`,
        why: `All ${m} characters match. ${fail[m - 1]! > 0 ? `fail[${m - 1}] = ${fail[m - 1]}, so the last ${fail[m - 1]} characters can start an overlapping match.` : 'Start matching the pattern again from its first character.'}`,
        codeLine: LINE.match,
        variables: { i, match: start },
        view: view(start, found(), paint(range(0, m), 'found'), { [m - 1]: 'active' }),
      });
      j = fail[m - 1]!;
    }
  }

  steps.push({
    title: matches.length > 0 ? `Found at ${matches.length === 1 ? 'index' : 'indexes'} ${matches.join(', ')}` : 'No match',
    why: `The text was read once from left to right, never stepping back: ${text.length} characters, plus a ${m}-entry table built up front.`,
    codeLine: LINE.done,
    variables: { matches: matches.length },
    view: view(Math.max(0, text.length - m), found(), {}),
  });
  return steps;
}
