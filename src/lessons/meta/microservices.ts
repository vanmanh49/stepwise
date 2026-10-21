import type { LessonMeta } from '../../types/lesson';

/** Microservices lessons in learning order: what pages need without loading a lesson. */
export const microservicesMeta: LessonMeta[] = [
  {
    id: 'monolith-vs-microservices',
    title: 'Monolith vs Microservices',
    category: 'microservices',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Run the same requests through one big process and through small services, then break something.',
    keywords: ['monolith', 'microservices', 'architecture', 'service', 'process', 'failure isolation', 'network hop', 'deploy'],
    prerequisites: [],
  },
];
