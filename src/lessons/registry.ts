import type { Category, Lesson } from '../types/lesson';
import { bfs } from './algorithms/bfs';
import { binarySearch } from './algorithms/binary-search';
import { bubbleSort } from './algorithms/bubble-sort';
import { dfs } from './algorithms/dfs';
import { dijkstra } from './algorithms/dijkstra';
import { insertionSort } from './algorithms/insertion-sort';
import { linearSearch } from './algorithms/linear-search';
import { mergeSort } from './algorithms/merge-sort';
import { quickSort } from './algorithms/quick-sort';
import { selectionSort } from './algorithms/selection-sort';
import { array } from './data-structures/array';
import { binarySearchTree } from './data-structures/binary-search-tree';
import { graph } from './data-structures/graph';
import { heap } from './data-structures/heap';
import { linkedList } from './data-structures/linked-list';
import { queue } from './data-structures/queue';
import { stack } from './data-structures/stack';

/** Every live lesson, in recommended learning order. Register new lessons here. */
export const lessons: Lesson[] = [
  array,
  linkedList,
  stack,
  queue,
  binarySearchTree,
  heap,
  graph,
  linearSearch,
  binarySearch,
  bubbleSort,
  selectionSort,
  insertionSort,
  mergeSort,
  quickSort,
  bfs,
  dfs,
  dijkstra,
];

const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));

export function getLesson(id: string): Lesson | undefined {
  return byId.get(id);
}

export function lessonsIn(category: Category): Lesson[] {
  return lessons.filter((lesson) => lesson.category === category);
}

/** Previous and next lesson within the same category. */
export function adjacentLessons(id: string): { prev?: Lesson; next?: Lesson } {
  const lesson = byId.get(id);
  if (!lesson) return {};
  const siblings = lessonsIn(lesson.category);
  const index = siblings.indexOf(lesson);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  return { ...(prev && { prev }), ...(next && { next }) };
}

export function lessonPath(lesson: Pick<Lesson, 'category' | 'id'>): string {
  return `/${lesson.category}/${lesson.id}`;
}
