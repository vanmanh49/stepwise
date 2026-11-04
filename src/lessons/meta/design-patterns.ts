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
  {
    id: 'factory-method',
    title: 'Factory Method',
    category: 'design-patterns',
    difficulty: 'beginner',
    group: 'Creational',
    description: 'Let subclasses decide which message to make, then add Push and count how many flows each design had to edit.',
    keywords: ['factory method', 'factory', 'creator', 'virtual constructor', 'subclass', 'polymorphism', 'creational pattern', 'gang of four', 'gof'],
    prerequisites: [],
  },
  {
    id: 'abstract-factory',
    title: 'Abstract Factory',
    category: 'design-patterns',
    difficulty: 'beginner',
    group: 'Creational',
    description: 'Build whole themes of matching widgets from one factory, catch a screen that mixes dark and light, then add High contrast.',
    keywords: ['abstract factory', 'factory', 'family of objects', 'theme', 'widget', 'kit', 'creational pattern', 'gang of four', 'gof'],
    prerequisites: ['factory-method'],
  },
];
