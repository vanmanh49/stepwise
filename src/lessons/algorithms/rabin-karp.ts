import { rabinKarpCode, rabinKarpSteps } from '../../algorithms/strings/rabinKarp';
import type { Lesson } from '../../types/lesson';

const example = { text: 'GEEKS FOR GEEKS', pattern: 'GEEK' };

export const rabinKarp: Lesson = {
  id: 'rabin-karp',
  title: 'Rabin-Karp',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Advanced Algorithms',
  description: 'Find a pattern by comparing hashes of each text window, updating the hash in constant time as the window slides.',
  keywords: ['rolling hash', 'string matching', 'pattern search', 'hashing', 'hash collision', 'fingerprint', 'plagiarism detection'],
  prerequisites: ['string'],
  overview:
    'Rabin-Karp searches for a pattern by turning strings into numbers. It hashes the pattern once, then slides a window of the same length along the text, updating the window’s hash in constant time with a rolling hash. Only when the two hashes are equal does it compare the actual characters.',
  concept: [
    'Imagine checking whether a long list of phone numbers contains yours. Comparing digit by digit for every entry is slow. If each entry came with a quick checksum, you could skip every entry whose checksum differs from yours, and only read the few that agree.',
    'Rabin-Karp computes such a checksum, a hash, for the pattern and for each window of the text. Here the hash treats a string as a number in base 256 and keeps the remainder after dividing by 101, so every hash is a number from 0 to 100.',
    'The clever part is the rolling update. Moving the window one step right removes one character and adds one. Instead of rehashing all m characters, subtract the leaving character’s contribution, shift the rest, and add the new character: a few arithmetic operations.',
    'Equal strings always have equal hashes, but unequal strings can collide on the same hash. So a hash match is only a hint, and the characters are then checked. The "Hash collision" example shows a window whose hash matches while its characters differ.',
  ],
  howItWorks: [
    'Compute the hash of the pattern and of the first window of the text.',
    'If the two hashes differ, the window is not a match.',
    'If they are equal, compare the characters to rule out a collision; record a match if they agree.',
    'Roll the window one step: remove the first character’s contribution and add the next character.',
    'Repeat until the window reaches the end of the text.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'text', label: 'Text', type: 'text', sample: example.text, help: '1 to 20 characters.' },
      { name: 'pattern', label: 'Pattern', type: 'text', sample: example.pattern, help: '1 to 10 characters.' },
    ],
    presets: [
      { label: 'Classic example', values: example },
      { label: 'Overlapping', values: { text: 'AAAA', pattern: 'AA' } },
      { label: 'Hash collision', values: { text: 'JUMP AB', pattern: 'AB' } },
    ],
    generate: rabinKarpSteps,
  },
  code: rabinKarpCode,
  complexity: {
    rows: [{ label: 'Rabin-Karp', best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n × m)' }],
    space: 'O(1)',
    note: 'Rolling the hash makes each window O(1). In the worst case, every window collides and must be checked character by character, which is O(n × m); a good hash makes that extremely unlikely.',
    curves: ['n', 'n2'],
  },
  compareWith: ['kmp'],
  prosCons: {
    pros: ['Simple to implement', 'Fast on average', 'Extends naturally to searching for many patterns of the same length at once'],
    cons: ['Hash collisions force extra character checks', 'Worst case is O(n × m)', 'Needs care with modular arithmetic'],
    useWhen: ['Searching for many patterns at once by storing their hashes in a set', 'Finding repeated or shared chunks, such as plagiarism detection'],
    avoidWhen: ['You need a guaranteed linear worst case (use KMP)', 'Patterns have very different lengths'],
  },
  applications: [
    'Plagiarism detection by hashing chunks of documents',
    'Searching for many keywords at once',
    'Finding duplicate blocks in files and backups',
    'Detecting repeated substrings in DNA',
  ],
  commonMistakes: [
    'Treating a hash match as a confirmed match without checking the characters.',
    'Forgetting to add the modulus back before taking the remainder, so the hash goes negative.',
    'Recomputing the full hash for each window, which loses the speed-up.',
    'Using a tiny modulus in real code, which causes frequent collisions.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'multiple-choice',
      prompt: 'The window "JU" has the same hash as the pattern "AB", yet it is ruled out. Why?',
      view: rabinKarpSteps({ text: 'JUMP AB', pattern: 'AB' })[1]!.view,
      options: [
        'The characters were compared after the hashes matched, and they differ',
        'Its hash was computed wrongly',
        'Windows at index 0 are never matches',
        'The pattern hash changed',
      ],
      answer: 0,
      explanation: 'Equal hashes are only a hint. The characters are checked, and J ≠ A, so it is a collision, not a match.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does the rolling hash do when the window moves one step?',
      options: [
        'Removes the leaving character’s contribution and adds the new character',
        'Hashes the whole new window from scratch',
        'Doubles the previous hash',
        'Keeps the previous hash unchanged',
      ],
      answer: 0,
      explanation: 'That update takes constant time, which is the whole point of Rabin-Karp.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the worst-case running time of Rabin-Karp?',
      options: ['O(n × m)', 'O(n + m)', 'O(log n)', 'O(n log n)'],
      answer: 0,
      explanation: 'If every window collides with the pattern’s hash, each needs an O(m) character check.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: "rabinKarp('ABCABC', 'CA');",
      options: ['[2]', '[2, 5]', '[]', '[0, 3]'],
      answer: 0,
      explanation: '"CA" occurs only once, starting at index 2.',
    },
  ],
  summary: [
    'Rabin-Karp compares a hash of each text window with the hash of the pattern.',
    'A rolling hash updates each window in constant time.',
    'Equal hashes are checked character by character, because different strings can collide.',
    'It is O(n + m) on average and O(n × m) in the worst case.',
  ],
};
