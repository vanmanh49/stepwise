import { readInt, readText, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ArrayView, GridView, PanelsView, Step } from '../../types/visualization';
import { encode, learnMerges, SPACE, type Merge } from '../bpe';
import { CORPUS } from '../corpus';
import { EMPTY } from '../steps';

export const tokenizationCode = `// learned once, from the corpus
merges = learnMerges(corpus)          // most frequent pair first

function encode(text) {
  tokens = characters(text)           // a space becomes ▁
  for (const merge of merges) {       // in the order they were learned
    if (!hasPair(tokens, merge)) continue
    tokens = mergePairs(tokens, merge) // every "t" "h" becomes "th"
  }
  return tokens
}`;

export const MAX_MERGES = 30;
const ALL_MERGES = learnMerges(CORPUS, MAX_MERGES);

const line = (snippet: string) => lineOf(tokenizationCode, snippet);
const show = (token: string) => token.replaceAll(SPACE, '▁');

/** Tokens with ids from the character each one starts at, so a merged token keeps its left part's id. */
function tokenCells(tokens: string[], merged?: string): ArrayView {
  let at = 0;
  return {
    kind: 'array',
    cells: tokens.map((t) => {
      const cell = { id: `tok-${at}`, value: show(t), role: t === merged ? ('found' as const) : ('default' as const) };
      at += t.length;
      return cell;
    }),
  };
}

function mergeTable(used: { merge: Merge; index: number }[], active?: number): GridView {
  return {
    kind: 'grid',
    colLabels: ['token', 'seen'],
    rows: used.map(({ merge, index }) => ({
      label: `${show(merge.pair[0])} + ${show(merge.pair[1])}`,
      cells: [
        { id: `merge-${index}`, value: show(merge.pair.join('')), role: index === active ? 'active' : 'default' },
        { id: `count-${index}`, value: merge.count, role: 'default' },
      ],
    })),
  };
}

function panels(tokens: ArrayView, table: GridView): PanelsView {
  const shown: PanelsView['panels'] = [{ label: 'Tokens', view: tokens }];
  if (table.rows.length > 0) shown.push({ label: 'Merges used so far', view: table });
  return { kind: 'panels', panels: shown };
}

export function tokenizationSteps(values: Record<string, string>): Step[] {
  const text = readText(values, 'text', 'Text', { min: 1, max: 40 });
  if (!text.ok) return refusal("Can't tokenize this text", text.why, EMPTY);
  if (text.value.includes(SPACE)) return refusal("Can't tokenize this text", `${SPACE} stands for a space in this lesson, so the text can't contain it. Type a normal space instead.`, EMPTY);
  const count = readInt(values, 'merges', 'Merges', { min: 0, max: MAX_MERGES });
  if (!count.ok) return refusal("Can't tokenize this text", count.why, EMPTY);

  const merges = ALL_MERGES.slice(0, count.value);
  const { tokens, trace } = encode(text.value, merges);
  const characters = [...text.value];
  const used: { merge: Merge; index: number }[] = [];
  const steps: Step[] = [
    {
      title: `Split "${text.value}" into ${characters.length} characters`,
      why: `Tokenizing starts from single characters. Each space becomes ▁, so a token can show that it starts a word. Next, the ${count.value} merges learned from the corpus are tried in order.`,
      codeLine: line('tokens = characters(text)'),
      variables: { characters: characters.length, merges: count.value },
      view: panels(tokenCells(characters.map((c) => (c === ' ' ? SPACE : c))), mergeTable([])),
    },
  ];
  let previous = characters.length;
  for (const entry of trace) {
    const merge = merges[entry.merge]!;
    used.push({ merge, index: entry.merge });
    const made = merge.pair.join('');
    steps.push({
      title: `Merge ${show(merge.pair[0])} + ${show(merge.pair[1])} → ${show(made)}`,
      why: `This pair appeared ${merge.count} times in the corpus when it was learned (merge ${entry.merge + 1} of ${count.value}). Every place it appears in your text becomes one token: ${previous} tokens → ${entry.tokens.length}.`,
      codeLine: line('tokens = mergePairs'),
      variables: { merge: entry.merge + 1, tokens: entry.tokens.length },
      view: panels(tokenCells(entry.tokens, made), mergeTable(used, entry.merge)),
    });
    previous = entry.tokens.length;
  }
  steps.push({
    title: `${characters.length} characters became ${tokens.length} tokens`,
    why:
      trace.length === 0
        ? 'None of the merges matched, so every character stays its own token.'
        : `${count.value - trace.length} of the ${count.value} merges never matched this text and were skipped. Common words end up as one token; rare words and unseen letters stay in pieces.`,
    next: 'A model never sees letters: it looks each token up in its vocabulary and works with that number.',
    codeLine: line('return tokens'),
    variables: { characters: characters.length, tokens: tokens.length },
    view: panels(tokenCells(tokens), mergeTable(used)),
  });
  return steps;
}
