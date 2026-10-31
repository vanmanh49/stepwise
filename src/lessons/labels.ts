import type { Category, Difficulty } from '../types/lesson';

export const CATEGORY_TITLE: Record<Category, string> = {
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
  sql: 'SQL',
  microservices: 'Microservices',
  kubernetes: 'Kubernetes',
  ai: 'AI',
  security: 'Security',
  networking: 'Networking',
};

/** Every track, in site order. Generated from the record above, so a new track can't be missed. */
export const CATEGORIES = Object.keys(CATEGORY_TITLE) as Category[];

export const CATEGORY_INTRO: Record<Category, string> = {
  'data-structures':
    'Ways of organising data so that the operations you need are fast. Each lesson lets you run the operations yourself and watch what moves.',
  algorithms:
    'Step-by-step procedures for searching, sorting and exploring data. Each lesson plays the algorithm on your own input, one decision at a time.',
  sql: 'Ask questions of a database. Each lesson runs your query one clause at a time, so you can see which rows every clause keeps, joins, groups or removes.',
  microservices:
    'How a system made of many small services stays fast and keeps working when parts of it fail. Each lesson runs a simulated system on your settings, one message at a time.',
  kubernetes:
    'How Kubernetes keeps your apps running: you declare what you want, and controllers keep working until the cluster matches. Each lesson runs a simulated cluster on your settings, one change at a time.',
  ai: 'How large language models work, from the first token to AI agents. Each lesson runs a tiny model on your input, so you can see every number it computes.',
  security:
    'How software keeps secrets and proves who is who, and how attackers break it when it goes wrong. Each lesson runs the real steps on your input, against a simulated system.',
  networking:
    'How a message really crosses the internet, from frames on a wire up to HTTP. Each lesson runs a simulated network on your settings, one packet at a time.',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const difficultyLabel = (difficulty: Difficulty) => DIFFICULTY_LABEL[difficulty];
