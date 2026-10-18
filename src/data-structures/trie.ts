import type { StructureDef } from '../types/lesson';
import type { Role, Step, TrieView } from '../types/visualization';

export const MAX_WORDS = 10;

const code = `class TrieNode {
  children = new Map<string, TrieNode>();
  isWord = false;
}

function insert(root: TrieNode, word: string): void {
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
    node = node.children.get(ch)!;
  }
  node.isWord = true;
}

function walk(root: TrieNode, text: string): TrieNode | null {
  let node = root;
  for (const ch of text) {
    const next = node.children.get(ch);
    if (!next) return null;
    node = next;
  }
  return node;
}

const search = (root: TrieNode, word: string) => walk(root, word)?.isWord === true;
const startsWith = (root: TrieNode, prefix: string) => walk(root, prefix) !== null;

/** Returns true when the caller should delete this node. */
function remove(node: TrieNode, word: string, i = 0): boolean {
  if (i === word.length) {
    node.isWord = false;
  } else {
    const child = node.children.get(word[i]);
    if (!child) return false;
    if (remove(child, word, i + 1)) node.children.delete(word[i]);
  }
  return !node.isWord && node.children.size === 0;
}`;

const LINE = { create: 9, follow: 10, mark: 12, walkStep: 20, walkMiss: 19, search: 25, startsWith: 26, unmark: 31, removeMiss: 37, prune: 35 };

const idOf = (prefix: string) => `t:${prefix}`;
const prefixesOf = (word: string) => Array.from({ length: word.length }, (_, i) => word.slice(0, i + 1));

/**
 * Draws the trie for a set of words. `extra` adds prefixes that are not (yet) on a word's path,
 * used while an insert creates nodes. Sorting the prefixes lists nodes depth first, children in
 * alphabetical order.
 */
function draw(words: string[], roles: Record<string, Role> = {}, extra: string[] = []): TrieView {
  const prefixes = new Set(['', ...words.flatMap(prefixesOf), ...extra]);
  const stored = new Set(words);
  return {
    kind: 'trie',
    nodes: [...prefixes].sort().map((p) => ({
      id: idOf(p),
      ...(p !== '' && { parent: idOf(p.slice(0, -1)) }),
      letter: p.at(-1) ?? '',
      ...(stored.has(p) && { word: p }),
      role: roles[p] ?? 'default',
    })),
  };
}

export const trieView = (words: string[], roles: Record<string, Role> = {}) => draw(words, roles);

/** Roles for a walk that has reached `upto` letters: the path so far visited, the current node active. */
function pathRoles(text: string, upto: number, last: Role = 'active'): Record<string, Role> {
  const roles: Record<string, Role> = { '': 'visited' };
  for (let i = 1; i <= upto; i++) roles[text.slice(0, i)] = i === upto ? last : 'visited';
  return roles;
}

/** Walks letter by letter; returns how many letters matched. */
function walkSteps(words: string[], text: string, steps: Step[]): number {
  const prefixes = new Set(words.flatMap(prefixesOf));
  for (let i = 0; i < text.length; i++) {
    const next = text.slice(0, i + 1);
    const ch = text[i]!;
    if (!prefixes.has(next)) {
      steps.push({
        title: `No node for "${ch}": "${text}" is not stored`,
        why: `No stored word continues "${text.slice(0, i)}" with "${ch}", so no word can start with "${next}". The walk stops here.`,
        codeLine: LINE.walkMiss,
        variables: { text, ch, depth: i },
        view: draw(words, pathRoles(text, i)),
      });
      return i;
    }
    steps.push({
      title: `Follow "${ch}"`,
      why: i === 0 ? 'A walk starts at the root and follows one edge per letter. Words that share a beginning share these nodes.' : `The node for "${text.slice(0, i)}" has a child "${ch}". Step down to it.`,
      codeLine: LINE.walkStep,
      variables: { text, ch, depth: i + 1 },
      view: draw(words, pathRoles(text, i + 1)),
    });
  }
  return text.length;
}

export const trieStructure: StructureDef<string[]> = {
  initial: ['car', 'cart', 'cat', 'do', 'dog'],
  view: (words) => draw(words),
  code,
  ops: [
    {
      id: 'insert',
      label: 'Insert',
      args: [{ name: 'word', label: 'Word', sample: 'card', text: true }],
      run(words, _args, [word = '']) {
        if (!words.includes(word) && words.length >= MAX_WORDS) {
          return {
            steps: [{ title: 'The trie is full', why: `This visualization holds at most ${MAX_WORDS} words so the tree stays readable. Delete a word first.`, codeLine: LINE.mark, view: draw(words) }],
            state: words,
          };
        }
        const prefixes = new Set(words.flatMap(prefixesOf));
        const steps: Step[] = [];
        const created: string[] = [];
        for (let i = 0; i < word.length; i++) {
          const next = word.slice(0, i + 1);
          const ch = word[i]!;
          const exists = prefixes.has(next);
          if (!exists) created.push(next);
          steps.push({
            title: exists ? `Follow "${ch}"` : `Create a node for "${ch}"`,
            why: exists
              ? `A node for "${next}" already exists because another word starts the same way. Reuse it.`
              : `No word so far starts with "${next}", so a new child is added under "${next.slice(0, -1) || 'the root'}".`,
            codeLine: exists ? LINE.follow : LINE.create,
            variables: { word, ch, depth: i + 1 },
            view: draw(words, { ...pathRoles(word, i + 1), ...(exists ? {} : { [next]: 'found' }) }, created),
          });
        }
        if (words.includes(word)) {
          steps.push({ title: `"${word}" is already stored`, why: 'The last node is already marked as the end of a word, so nothing changes.', codeLine: LINE.mark, variables: { word }, view: draw(words, pathRoles(word, word.length, 'found')) });
          return { steps, state: words };
        }
        const next = [...words, word].sort();
        steps.push({
          title: `Mark "${word}" as a word`,
          why: 'The node at the end of the path is marked, so a search can tell a stored word from a prefix of a longer word.',
          codeLine: LINE.mark,
          variables: { word },
          view: draw(next, pathRoles(word, word.length, 'found')),
        });
        return { steps, state: next };
      },
    },
    {
      id: 'search',
      label: 'Search',
      args: [{ name: 'word', label: 'Word', sample: 'car', text: true }],
      run(words, _args, [word = '']) {
        const steps: Step[] = [];
        if (walkSteps(words, word, steps) < word.length) return { steps, state: words };
        const found = words.includes(word);
        steps.push({
          title: found ? `Found "${word}"` : `"${word}" is a prefix, not a stored word`,
          why: found
            ? `The walk took ${word.length} steps, one per letter, however many words are stored.`
            : 'The path exists because a longer word passes through it, but this node is not marked as the end of a word.',
          codeLine: LINE.search,
          variables: { word, found: String(found) },
          view: draw(words, pathRoles(word, word.length, found ? 'found' : 'discarded')),
        });
        return { steps, state: words };
      },
    },
    {
      id: 'prefix',
      label: 'Starts with',
      args: [{ name: 'prefix', label: 'Prefix', sample: 'ca', text: true }],
      run(words, _args, [prefix = '']) {
        const steps: Step[] = [];
        const matched = walkSteps(words, prefix, steps);
        const found = matched === prefix.length;
        const under = words.filter((w) => w.startsWith(prefix));
        steps.push({
          title: found ? `Some word starts with "${prefix}"` : `No word starts with "${prefix}"`,
          why: found
            ? `Every word below this node starts with "${prefix}": ${under.join(', ')}. Autocomplete lists them by exploring this subtree.`
            : 'The walk fell off the trie, so no stored word has this beginning.',
          codeLine: LINE.startsWith,
          variables: { prefix, found: String(found) },
          view: draw(words, found ? { ...pathRoles(prefix, matched, 'found'), ...Object.fromEntries(under.filter((w) => w !== prefix).map((w) => [w, 'frontier' as Role])) } : pathRoles(prefix, matched)),
        });
        return { steps, state: words };
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      args: [{ name: 'word', label: 'Word', sample: 'cat', text: true }],
      run(words, _args, [word = '']) {
        const steps: Step[] = [];
        if (walkSteps(words, word, steps) < word.length) return { steps, state: words };
        if (!words.includes(word)) {
          steps.push({ title: `"${word}" is not stored`, why: 'The path exists only as part of a longer word. That word must stay, so nothing is removed.', codeLine: LINE.removeMiss, variables: { word }, view: draw(words, pathRoles(word, word.length, 'discarded')) });
          return { steps, state: words };
        }
        const next = words.filter((w) => w !== word);
        // Nodes still needed by another word stay; the rest are pruned from the bottom up.
        const kept = new Set(next.flatMap(prefixesOf));
        const doomed = prefixesOf(word).filter((p) => !kept.has(p)).reverse();
        steps.push({
          title: `Unmark "${word}"`,
          why: doomed.length > 0 ? 'The end-of-word mark is removed. Then, going back up, any node with no children and no mark is useless and is deleted.' : 'The end-of-word mark is removed. Its nodes stay, because another word still uses them.',
          codeLine: LINE.unmark,
          variables: { word },
          view: draw(next, pathRoles(word, word.length, 'discarded'), doomed),
        });
        doomed.forEach((p, i) => {
          steps.push({
            title: `Prune the node for "${p}"`,
            why: `It has no children and does not end a word, so nothing needs it any more.`,
            codeLine: LINE.prune,
            variables: { word, node: p },
            view: draw(next, pathRoles(word, p.length - 1, 'active'), doomed.slice(i + 1)),
          });
        });
        return { steps, state: next };
      },
    },
  ],
};
