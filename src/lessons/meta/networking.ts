import type { LessonMeta } from '../../types/lesson';

/** Networking lessons in learning order: what pages need without loading a lesson. */
export const networkingMeta: LessonMeta[] = [
  {
    id: 'layers-encapsulation',
    title: 'Layers & Encapsulation',
    category: 'networking',
    difficulty: 'beginner',
    group: 'Link & Internet',
    description: 'Wrap a message in UDP, IP and Ethernet headers, work out the real IPv4 checksum, then corrupt a byte and watch it fail.',
    keywords: ['osi', 'tcp/ip', 'layers', 'encapsulation', 'header', 'payload', 'packet', 'frame', 'checksum', 'network stack'],
    prerequisites: [],
  },
];
