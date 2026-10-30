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
  {
    id: 'message-authentication',
    title: 'Message Authentication',
    category: 'security',
    difficulty: 'beginner',
    group: 'Cryptography',
    description: 'Forge a tag without the key against a naive hash, then watch HMAC stop the same attack.',
    keywords: ['mac', 'hmac', 'tag', 'length extension', 'message authentication code', 'signed webhook'],
    prerequisites: ['hash-functions'],
  },
  {
    id: 'symmetric-encryption',
    title: 'Symmetric Encryption',
    category: 'security',
    difficulty: 'beginner',
    group: 'Cryptography',
    description: 'Encrypt one block of your text with the real AES-128 and watch all 10 rounds turn it into noise.',
    keywords: ['aes', 'aes-128', 'block cipher', 'encryption', 'secret key', 'substitution', 'rijndael'],
    prerequisites: [],
  },
  {
    id: 'block-modes',
    title: 'Block Modes & AEAD',
    category: 'security',
    difficulty: 'beginner',
    group: 'Cryptography',
    description: 'See ECB leak a picture, read a message through a reused nonce, and watch GCM catch a flipped bit.',
    keywords: ['ecb', 'cbc', 'ctr', 'gcm', 'aead', 'nonce', 'authenticated encryption', 'mode of operation', 'bit flipping'],
    prerequisites: ['symmetric-encryption'],
  },
];
