import { kmpCode, kmpSteps } from '../../algorithms/strings/kmp';
import type { Lesson } from '../../types/lesson';

const example = { text: 'ABABDABACDABABCABAB', pattern: 'ABABCABAB' };

export const kmp: Lesson = {
  id: 'kmp',
  title: 'KMP',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Advanced Algorithms',
  description: 'Find a pattern in a text in linear time, without ever re-reading a text character, using a precomputed failure table.',
  keywords: ['knuth-morris-pratt', 'string matching', 'pattern search', 'failure function', 'prefix function', 'lps array', 'substring search'],
  prerequisites: ['string'],
  overview:
    'The Knuth-Morris-Pratt (KMP) algorithm finds every place a pattern occurs in a text. A simple search restarts the pattern one position further after each mismatch and re-reads text it has already seen. KMP first studies the pattern itself, building a failure table, and then scans the text once from left to right without ever moving back.',
  concept: [
    'Searching for ABABC in ABABABC, the simple method matches ABAB, fails on the fifth character, shifts the pattern by one and starts comparing from scratch. But it already knew the last two characters it read were AB, which is exactly how the pattern begins. That knowledge is thrown away.',
    'KMP keeps it. For each position in the pattern, the failure table records the length of the longest prefix of the pattern that is also a suffix of what has been matched so far. After a mismatch, the pattern slides right so that this prefix lines up with the text it already matched, and comparison continues at the same text character.',
    'The table depends only on the pattern, so it is built once, in time proportional to the pattern’s length, using the same idea on the pattern itself.',
    'Because the text pointer i only ever moves forward, the scan takes at most about 2n comparisons for a text of length n. Overall KMP runs in O(n + m), even on nasty inputs like searching for AAAAB in AAAAAAAA…, where the simple method degrades to O(n × m).',
  ],
  howItWorks: [
    'Build the failure table: fail[q] is the length of the longest proper prefix of the pattern that is also a suffix of pattern[0..q].',
    'Scan the text with i, keeping j = how many pattern characters are matched.',
    'On a mismatch with j > 0, set j = fail[j − 1] and compare again, without moving i.',
    'On a match, increase j. When j reaches the pattern length, record a match at i − j + 1 and set j = fail[j − 1].',
    'Continue until the end of the text.',
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
      { label: 'No match', values: { text: 'ABCDEF', pattern: 'XYZ' } },
    ],
    generate: kmpSteps,
  },
  code: kmpCode,
  complexity: {
    rows: [{ label: 'KMP', best: 'O(n + m)', average: 'O(n + m)', worst: 'O(n + m)' }],
    space: 'O(m)',
    note: 'n is the text length and m the pattern length. The table costs O(m) to build, and the scan never moves back in the text, so it costs O(n).',
    curves: ['n'],
  },
  prosCons: {
    pros: ['Guaranteed linear time, even on worst-case inputs', 'Reads the text strictly left to right, so it works on streams', 'Finds overlapping matches naturally'],
    cons: ['The failure table is tricky to get right', 'For ordinary text, simpler methods are often just as fast in practice'],
    useWhen: ['Inputs can be adversarial or highly repetitive', 'The text arrives as a stream you cannot rewind', 'You search for one pattern many times'],
    avoidWhen: ['You search for many patterns at once (use Aho-Corasick)', 'A built-in, well-tuned search is available and fast enough'],
  },
  applications: [
    'Text editors’ find feature',
    'Searching DNA sequences for a motif',
    'Network intrusion detection scanning packets for signatures',
    'The prefix-function idea also solves string periodicity and border problems',
  ],
  commonMistakes: [
    'Moving the text pointer back after a mismatch, which throws away KMP’s advantage.',
    'Using fail[j] instead of fail[j − 1] when falling back.',
    'Forgetting to fall back after a full match, which misses overlapping matches.',
    'Letting the failure value equal the whole prefix length instead of a proper prefix.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'ABAB is matched and the next text character D does not match C. fail[3] = 2. What happens?',
      view: kmpSteps(example)[12]!.view,
      options: [
        'Keep 2 matched characters, slide the pattern, compare D again',
        'Move the text pointer back to index 1',
        'Restart the pattern after D',
        'Report a match',
      ],
      answer: 0,
      explanation: 'The last two matched characters, AB, are also the start of the pattern, so they are kept. The text pointer stays on D.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is the failure table of "AAAB"?',
      options: ['[0, 1, 2, 0]', '[0, 0, 0, 0]', '[1, 2, 3, 0]', '[0, 1, 2, 3]'],
      answer: 0,
      explanation: '"A", "AA" and "AAA" end in prefixes of length 0, 1 and 2; "AAAB" ends in B, which no prefix ends with.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the running time of KMP for a text of length n and a pattern of length m?',
      options: ['O(n + m)', 'O(n × m)', 'O(n log m)', 'O(m²)'],
      answer: 0,
      explanation: 'O(m) for the table and O(n) for the scan, since the text pointer never moves back.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: "kmpSearch('ABABAB', 'ABAB');",
      options: ['[0, 2]', '[0]', '[0, 4]', '[2]'],
      answer: 0,
      explanation: 'The pattern occurs at 0 and again at 2. After the first match, fail[3] = 2 keeps "AB" and the second match follows.',
    },
  ],
  summary: [
    'KMP finds a pattern in a text without ever re-reading a text character.',
    'The failure table says how much of a partial match can be kept after a mismatch.',
    'The table costs O(m) and the scan O(n), so KMP is O(n + m) even on worst-case inputs.',
    'Falling back after a full match finds overlapping occurrences.',
  ],
};
