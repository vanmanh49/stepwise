import type { LessonMeta } from '../../types/lesson';

/** Security lessons in learning order: what pages need without loading a lesson. */
export const securityMeta: LessonMeta[] = [
  {
    id: 'hash-functions',
    title: 'Hash Functions',
    category: 'security',
    difficulty: 'beginner',
    group: 'Cryptography',
    description: 'Run the real SHA-256 on your text, round by round, and see one changed letter scramble the whole digest.',
    keywords: ['hash', 'sha-256', 'sha256', 'digest', 'avalanche effect', 'collision', 'checksum', 'fingerprint'],
    prerequisites: [],
  },
];
