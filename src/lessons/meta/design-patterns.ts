import type { LessonMeta } from '../../types/lesson';

/** Design Patterns lessons in learning order: what pages need without loading a lesson. */
export const designPatternsMeta: LessonMeta[] = [
  {
    id: 'singleton',
    title: 'Singleton',
    category: 'design-patterns',
    difficulty: 'beginner',
    group: 'Creational',
    description: 'Give a whole app one shared Logger, then turn on debug while it runs, and count what each design had to change.',
    keywords: ['singleton', 'getinstance', 'global state', 'shared instance', 'logger', 'static', 'creational pattern', 'gang of four', 'gof'],
    prerequisites: [],
  },
];
