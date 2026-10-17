import type { Category, Lesson } from '../types/lesson';
import { aStar } from './algorithms/a-star';
import { advancedGraphAlgorithms } from './algorithms/advanced-graph-algorithms';
import { bellmanFord } from './algorithms/bellman-ford';
import { bfs } from './algorithms/bfs';
import { binarySearch } from './algorithms/binary-search';
import { bubbleSort } from './algorithms/bubble-sort';
import { countingSort } from './algorithms/counting-sort';
import { dfs } from './algorithms/dfs';
import { dijkstra } from './algorithms/dijkstra';
import { floydWarshall } from './algorithms/floyd-warshall';
import { greedy } from './algorithms/greedy';
import { heapSort } from './algorithms/heap-sort';
import { insertionSort } from './algorithms/insertion-sort';
import { kruskal } from './algorithms/kruskal';
import { linearSearch } from './algorithms/linear-search';
import { lowestCommonAncestor } from './algorithms/lowest-common-ancestor';
import { mergeSort } from './algorithms/merge-sort';
import { networkFlow } from './algorithms/network-flow';
import { prefixSum } from './algorithms/prefix-sum';
import { prim } from './algorithms/prim';
import { quickSort } from './algorithms/quick-sort';
import { radixSort } from './algorithms/radix-sort';
import { selectionSort } from './algorithms/selection-sort';
import { slidingWindow } from './algorithms/sliding-window';
import { topologicalSort } from './algorithms/topological-sort';
import { treeTraversal } from './algorithms/tree-traversal';
import { twoPointers } from './algorithms/two-pointers';
import { unionFind } from './algorithms/union-find';
import { array } from './data-structures/array';
import { binarySearchTree } from './data-structures/binary-search-tree';
import { binaryTree } from './data-structures/binary-tree';
import { graph } from './data-structures/graph';
import { heap } from './data-structures/heap';
import { linkedList } from './data-structures/linked-list';
import { priorityQueue } from './data-structures/priority-queue';
import { queue } from './data-structures/queue';
import { stack } from './data-structures/stack';
import { string } from './data-structures/string';
import { aggregates } from './sql/aggregates';
import { distinct } from './sql/distinct';
import { groupByHaving } from './sql/group-by-having';
import { innerJoin } from './sql/inner-join';
import { leftJoin } from './sql/left-join';
import { nullValues } from './sql/null-values';
import { orderByLimit } from './sql/order-by-limit';
import { selectFrom } from './sql/select-from';
import { subqueries } from './sql/subqueries';
import { where } from './sql/where';

/** Every live lesson, in recommended learning order. Register new lessons here. */
export const lessons: Lesson[] = [
  array,
  string,
  linkedList,
  stack,
  queue,
  binaryTree,
  binarySearchTree,
  heap,
  priorityQueue,
  graph,
  linearSearch,
  binarySearch,
  bubbleSort,
  selectionSort,
  insertionSort,
  twoPointers,
  slidingWindow,
  prefixSum,
  mergeSort,
  quickSort,
  heapSort,
  countingSort,
  radixSort,
  bfs,
  dfs,
  topologicalSort,
  treeTraversal,
  lowestCommonAncestor,
  dijkstra,
  bellmanFord,
  floydWarshall,
  kruskal,
  prim,
  greedy,
  unionFind,
  aStar,
  networkFlow,
  advancedGraphAlgorithms,
  selectFrom,
  where,
  nullValues,
  orderByLimit,
  distinct,
  aggregates,
  groupByHaving,
  innerJoin,
  leftJoin,
  subqueries,
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
