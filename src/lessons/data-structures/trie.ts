import { trieStructure } from '../../data-structures/trie';
import type { Lesson } from '../../types/lesson';

export const trie: Lesson = {
  id: 'trie',
  title: 'Trie',
  category: 'data-structures',
  difficulty: 'intermediate',
  description: 'A tree of letters where words that start the same way share a path.',
  keywords: ['prefix tree', 'digital tree', 'autocomplete', 'prefix', 'starts with', 'dictionary', 'word search', 'spell check'],
  prerequisites: ['binary-tree', 'string'],
  overview:
    'A trie (said "try") stores words as paths of letters from a root. Words that start the same way share the same first nodes, so "car", "cart" and "cat" share "c" and "a". Looking up a word takes one step per letter, however many words are stored, and finding every word with a given beginning is just exploring one subtree.',
  concept: [
    'Each node stands for a prefix: the letters on the path from the root to it. The root is the empty prefix. A child is one letter longer. A node can have as many children as there are letters.',
    'A path alone does not mean a word is stored. "car" is on the path to "cart" even if only "cart" was inserted. So each node has a flag that marks the end of a stored word.',
    'Because the cost depends on the length of the word, not the number of words, a trie stays fast with a huge dictionary. Its real strength is prefixes: "which words start with ca?" is answered by walking to the "ca" node and listing everything below it.',
  ],
  howItWorks: [
    'Insert: walk from the root one letter at a time. Follow an existing child when there is one; otherwise create it. Mark the last node as the end of a word.',
    'Search: walk letter by letter. If a letter has no child, the word is not stored. If the walk finishes, the word is stored only if the last node is marked.',
    'Starts with: walk the prefix the same way. If the walk finishes, at least one word starts with it, and those words are all in the subtree below.',
    'Delete: walk to the word and remove its mark. Then, going back up, delete each node that has no children and no mark, stopping at the first node another word still needs.',
  ],
  visualization: { kind: 'structure', structure: trieStructure },
  code: trieStructure.code,
  complexity: {
    rows: [
      { label: 'Insert', best: 'O(L)', average: 'O(L)', worst: 'O(L)' },
      { label: 'Search', best: 'O(1)', average: 'O(L)', worst: 'O(L)' },
      { label: 'Starts with', best: 'O(1)', average: 'O(L)', worst: 'O(L)' },
      { label: 'Delete', best: 'O(L)', average: 'O(L)', worst: 'O(L)' },
    ],
    space: 'O(total letters)',
    note: 'L is the length of the word, not the number of words: one step per letter. A search can stop at the first letter with no child, which is the O(1) best case. Space is at most one node per letter of every word, less when words share prefixes.',
    curves: ['1', 'n'],
  },
  compareWith: ['hash-table', 'binary-search-tree'],
  prosCons: {
    pros: ['Lookups cost one step per letter, independent of how many words are stored', 'Prefix queries and autocomplete come for free', 'Words come out in alphabetical order when the trie is walked'],
    cons: ['Uses more memory than a hash table: one node per letter, each with a map of children', 'Only works for keys made of a sequence of symbols, such as strings', 'Slower than a hash table for plain exact-match lookups in practice'],
    useWhen: ['You need autocomplete or "starts with" queries', 'You check many words against a dictionary, such as a spell checker or word game', 'You match the longest prefix, as routers do with IP addresses'],
    avoidWhen: ['You only need exact lookups (a hash table is simpler and smaller)', 'Keys are numbers or have no useful shared prefixes'],
  },
  applications: [
    'Autocomplete in search boxes and phone keyboards',
    'Spell checkers and word games such as Boggle or Scrabble helpers',
    'IP routing tables, which find the longest matching address prefix',
    'Counting or grouping strings by their beginnings',
  ],
  commonMistakes: [
    'Treating any reachable node as a stored word. Without the end-of-word mark, "car" looks stored as soon as "cart" is inserted.',
    'Deleting all nodes of a word, including ones another word still uses.',
    'Forgetting that the cost is per letter: searching for a very long string is not O(1).',
    'Using a 26-slot array per node for large alphabets, which wastes memory. A map of children only stores the letters that exist.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You insert "card" into this trie. How many new nodes are created?',
      view: trieStructure.view(['car', 'cart', 'cat', 'do', 'dog']),
      options: ['1', '2', '4', '0'],
      answer: 0,
      explanation: 'The path c → a → r already exists, so only a "d" node below "car" is new. Then it is marked as the end of a word.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'A trie holds one million words. What does searching for a word of length L cost?',
      options: ['O(L)', 'O(log n)', 'O(n)', 'O(n × L)'],
      answer: 0,
      explanation: 'The walk follows one child per letter, so it takes L steps whatever the number of words.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Only "cart" is stored. Why does search("car") answer false even though the path c → a → r exists?',
      options: ['The "r" node is not marked as the end of a word', 'The search stops at the first letter', 'The trie stores words backwards'],
      answer: 0,
      explanation: '"car" is only a prefix of "cart". The end-of-word mark is what tells a stored word from a prefix.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'The trie stores "do" and "dog". After this call, which nodes are deleted?',
      code: `remove(root, 'dog');`,
      options: ['Only the "g" node', 'The "o" and "g" nodes', 'The "d", "o" and "g" nodes', 'No nodes'],
      answer: 0,
      explanation: 'The "g" node has no children and is no longer a word end, so it goes. The "o" node still ends "do", so it stays, and so does everything above it.',
    },
  ],
  summary: [
    'A trie stores words as paths of letters; words with the same beginning share nodes.',
    'Insert, search and delete cost one step per letter: O(L), independent of the number of words.',
    'An end-of-word mark tells stored words from prefixes of longer words.',
    'Prefix queries such as autocomplete are a trie\'s main strength.',
  ],
};
