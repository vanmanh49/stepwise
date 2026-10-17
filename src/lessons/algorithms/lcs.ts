import { lcsCode, lcsSteps } from '../../algorithms/dp/lcs';
import type { Lesson } from '../../types/lesson';

const example = { a: 'ABCBDAB', b: 'BDCABA' };

export const lcs: Lesson = {
  id: 'lcs',
  title: 'Longest Common Subsequence',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Dynamic Programming',
  description: 'Find the longest sequence of characters that appears in the same order in two strings.',
  keywords: ['lcs', 'subsequence', 'diff', 'string comparison', 'dynamic programming', '2d table', 'edit distance'],
  prerequisites: ['fibonacci-dp'],
  overview:
    'A subsequence keeps some characters of a string in their original order, possibly with gaps: "ACE" is a subsequence of "ABCDE". The longest common subsequence (LCS) of two strings is the longest one they share. Dynamic programming finds it with a table comparing every prefix of one string with every prefix of the other.',
  concept: [
    'Comparing two versions of a document, a diff tool shows which lines stayed and which changed. The lines that stayed, in order, are a longest common subsequence of the two versions. Everything else was added or removed.',
    'Trying every subsequence of one string is 2ⁿ options. Instead, look at the last characters of two prefixes. If they match, that character can end the common subsequence, and the rest is the LCS of both prefixes without it: one diagonal step back in the table, plus one.',
    'If they do not match, at least one of the two characters is not in the answer. So the LCS is the better of dropping the last character of the first string (the cell above) or of the second string (the cell to the left).',
    'Filling the table row by row gives the length in the bottom-right corner. Walking back from there, moving diagonally at each match and toward the larger neighbour otherwise, spells out the subsequence itself.',
  ],
  howItWorks: [
    'Make a table with one more row than the first string has characters and one more column than the second.',
    'Fill the first row and column with 0: an empty prefix shares nothing.',
    'If a[i − 1] equals b[j − 1], set dp[i][j] = dp[i − 1][j − 1] + 1.',
    'Otherwise set dp[i][j] = max(dp[i − 1][j], dp[i][j − 1]).',
    'Read the length in the bottom-right cell, then walk back to recover the characters.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'a', label: 'First string', type: 'text', sample: example.a, help: '1 to 8 characters.' },
      { name: 'b', label: 'Second string', type: 'text', sample: example.b, help: '1 to 8 characters.' },
    ],
    presets: [
      { label: 'Classic example', values: example },
      { label: 'No overlap', values: { a: 'ABC', b: 'XYZ' } },
      { label: 'Similar words', values: { a: 'KITTEN', b: 'SITTING' } },
    ],
    generate: lcsSteps,
  },
  code: lcsCode,
  complexity: {
    rows: [{ label: 'LCS (DP table)', best: 'O(m × n)', average: 'O(m × n)', worst: 'O(m × n)' }],
    space: 'O(m × n)',
    note: 'm and n are the two string lengths; every cell is filled once in constant time. If only the length is needed, two rows of the table are enough.',
    curves: ['n2'],
  },
  compareWith: ['lis'],
  prosCons: {
    pros: ['Exact answer, far faster than trying all subsequences', 'The same table recovers the subsequence itself', 'The basis of diff tools and edit distance'],
    cons: ['Quadratic time and memory in the string lengths', 'Too slow for comparing very long texts character by character'],
    useWhen: ['Comparing two sequences of moderate length', 'You need to know what stayed the same between two versions'],
    avoidWhen: ['The sequences are millions of items long (use specialised diff algorithms)', 'You need contiguous matches (that is longest common substring)'],
  },
  applications: [
    'Diff tools in version control such as git',
    'Comparing DNA and protein sequences in biology',
    'Plagiarism and similarity detection',
    'Spell checkers, as part of edit distance',
  ],
  commonMistakes: [
    'Confusing subsequence (gaps allowed) with substring (must be contiguous).',
    'Off-by-one errors: dp[i][j] compares a[i − 1] and b[j − 1], not a[i] and b[j].',
    'Adding 1 when characters do not match.',
    'Reconstructing the answer by reading matches row by row instead of walking back from the corner.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Comparing "AB" with "B": dp[1][1] is 0 (A ≠ B). What is dp[2][1], where B meets B?',
      view: lcsSteps({ a: 'AB', b: 'B' })[1]!.view,
      options: ['1', '0', '2', '3'],
      answer: 0,
      explanation: 'The characters match, so dp[2][1] = dp[1][0] + 1 = 0 + 1 = 1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is the LCS length of "ABCDE" and "ACE"?',
      options: ['3', '2', '5', '1'],
      answer: 0,
      explanation: '"ACE" appears in order inside "ABCDE", so the whole of it is common.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the running time for strings of lengths m and n?',
      options: ['O(m × n)', 'O(m + n)', 'O(2ⁿ)', 'O(n log n)'],
      answer: 0,
      explanation: 'The table has (m + 1) × (n + 1) cells, each filled in constant time.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'When a[i − 1] and b[j − 1] differ, what is dp[i][j]?',
      code: 'if (a[i - 1] !== b[j - 1]) dp[i][j] = ???;',
      options: ['Math.max(dp[i - 1][j], dp[i][j - 1])', 'dp[i - 1][j - 1] + 1', '0', 'dp[i - 1][j - 1]'],
      answer: 0,
      explanation: 'One of the two characters is not in the answer, so take the better of dropping either one.',
    },
  ],
  summary: [
    'The LCS is the longest sequence that appears in order, with gaps allowed, in both strings.',
    'On a match, dp[i][j] = dp[i − 1][j − 1] + 1; otherwise take the larger of the cells above and to the left.',
    'Walking back from the bottom-right cell recovers the subsequence.',
    'It runs in O(m × n) time and powers diff tools.',
  ],
};
