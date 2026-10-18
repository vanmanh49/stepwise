import { hashTableStructure } from '../../data-structures/hashTable';
import type { Lesson } from '../../types/lesson';

export const hashTable: Lesson = {
  id: 'hash-table',
  title: 'Hash Table',
  category: 'data-structures',
  difficulty: 'beginner',
  description: 'Turns each key into a bucket number, so lookups go straight to the right place.',
  keywords: ['hash map', 'hashmap', 'dictionary', 'map', 'hash function', 'collision', 'chaining', 'load factor', 'rehash', 'bucket'],
  prerequisites: ['array', 'linked-list'],
  overview:
    'A hash table stores key–value pairs and finds a key without searching through everything. A hash function turns the key into a number, and that number picks a bucket in an array. To look the key up later, you hash it again and go straight to the same bucket.',
  concept: [
    'An array gives O(1) access by index, but keys are usually words, not indexes. A hash function bridges the gap: it turns any key into an index between 0 and the number of buckets minus 1. The same key always gives the same index.',
    'Different keys can land in the same bucket. This is a collision, and it is normal, not an error. This lesson uses separate chaining: each bucket holds a short list (a chain), and a lookup compares keys along that one chain.',
    'Speed depends on keeping chains short. The load factor is the number of keys divided by the number of buckets. When it passes a limit (0.75 here), the table doubles its buckets and rehashes every key, so chains stay at about one entry each.',
  ],
  howItWorks: [
    'Hash: start with h = 0. For each character, h = (h × 31 + character code) mod the number of buckets.',
    'Put: hash the key and walk its chain. If the key is there, replace its value. Otherwise append the new entry to the chain.',
    'Get: hash the key and walk its chain until the key matches. Reaching the end of the chain means the key is not stored.',
    'Remove: hash the key, find it in the chain, and cut it out.',
    'Resize: when keys ÷ buckets goes over 0.75, double the buckets and put every key in again. Each key may move, because its bucket depends on the bucket count.',
  ],
  visualization: { kind: 'structure', structure: hashTableStructure },
  code: hashTableStructure.code,
  complexity: {
    rows: [
      { label: 'Put', best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
      { label: 'Get', best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
      { label: 'Remove', best: 'O(1)', average: 'O(1)', worst: 'O(n)' },
      { label: 'Resize', best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    ],
    space: 'O(n)',
    note: 'With a good hash function and a bounded load factor, each chain holds about one entry, so operations are O(1) on average. If every key collided into one bucket, the chain would be a list of n entries: O(n). A resize costs O(n), but it happens rarely enough that a put is still O(1) on average (amortised).',
    curves: ['1', 'n'],
  },
  compareWith: ['array', 'binary-search-tree'],
  prosCons: {
    pros: ['O(1) average put, get and remove', 'Works with any key that can be hashed, such as strings', 'Simple to use: most languages have one built in'],
    cons: ['No order: you cannot list keys sorted or find the next larger key', 'A bad hash function or many collisions make it O(n)', 'Resizing makes an occasional put slow'],
    useWhen: ['You look things up by an exact key', 'You need to count, group or de-duplicate items', 'You want to cache results by their input'],
    avoidWhen: ['You need keys in sorted order or range queries (use a balanced tree)', 'You need guaranteed worst-case time for every operation'],
  },
  applications: [
    'Dictionaries and maps in every language: JavaScript Map, Python dict, Java HashMap',
    'Caches, such as remembering web pages or computed results by key',
    'Counting word frequencies or finding duplicates in one pass',
    'Database hash indexes and hash joins',
  ],
  commonMistakes: [
    'Thinking a collision is a bug. Collisions always happen; the table must handle them.',
    'Using a hash function that sends many keys to the same bucket, such as one that only looks at the first letter.',
    'Forgetting that resizing changes every key\'s bucket, so keys must be rehashed, not copied to the same index.',
    'Expecting keys to come out in the order they were added or in sorted order.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'hash("elk") is 4. After putting "elk", what does bucket 4 hold, from the head of the chain?',
      view: hashTableStructure.view(hashTableStructure.initial),
      options: ['dog, owl, elk', 'elk, dog, owl', 'elk only', 'dog, elk, owl'],
      answer: 0,
      explanation: 'Bucket 4 already holds dog and owl. A new key goes at the end of its bucket\'s chain, so the chain becomes dog, owl, elk.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the average time to get a key from a hash table whose load factor stays below 0.75?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      answer: 0,
      explanation: 'Hashing the key takes constant time, and with a bounded load factor each chain holds about one entry, so the walk is constant too.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why does every key have to be rehashed when the table doubles from 8 to 16 buckets?',
      options: [
        'The bucket is the hash mod the number of buckets, so it changes when the number of buckets changes',
        'The keys are sorted again after a resize',
        'The hash function is replaced with a new one',
      ],
      answer: 0,
      explanation: 'h mod 8 and h mod 16 can differ. A key left in its old bucket would never be found, because lookups hash into the new 16 buckets.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'A table has 8 buckets and uses this hash function. Which problem does it have?',
      code: `function hash(key: string): number {\n  return key.length % 8;\n}`,
      options: ['Keys of the same length always collide', 'It can return a number larger than 7', 'The same key can give different buckets'],
      answer: 0,
      explanation: 'It ignores the letters, so "cat", "dog" and "owl" all land in bucket 3. Chains grow long and lookups slow towards O(n).',
    },
  ],
  summary: [
    'A hash function turns a key into a bucket number, so a lookup goes straight to one bucket.',
    'Collisions are normal; separate chaining keeps a short list in each bucket.',
    'Keeping the load factor low (doubling and rehashing) keeps put, get and remove O(1) on average.',
    'Hash tables have no order; use a balanced tree when you need sorted keys or ranges.',
  ],
};
