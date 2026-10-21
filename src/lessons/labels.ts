import type { Category, Difficulty } from '../types/lesson';

export const CATEGORY_TITLE: Record<Category, string> = {
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
  sql: 'SQL',
  microservices: 'Microservices',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const difficultyLabel = (difficulty: Difficulty) => DIFFICULTY_LABEL[difficulty];
