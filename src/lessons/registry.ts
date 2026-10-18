import type { Category, Lesson } from '../types/lesson';
import { aStar } from './algorithms/a-star';
import { advancedGraphAlgorithms } from './algorithms/advanced-graph-algorithms';
import { backtracking } from './algorithms/backtracking';
import { bellmanFord } from './algorithms/bellman-ford';
import { bfs } from './algorithms/bfs';
import { binarySearch } from './algorithms/binary-search';
import { bubbleSort } from './algorithms/bubble-sort';
import { coinChange } from './algorithms/coin-change';
import { countingSort } from './algorithms/counting-sort';
import { dfs } from './algorithms/dfs';
import { dijkstra } from './algorithms/dijkstra';
import { divideAndConquer } from './algorithms/divide-and-conquer';
import { fibonacciDp } from './algorithms/fibonacci-dp';
import { floydWarshall } from './algorithms/floyd-warshall';
import { greedy } from './algorithms/greedy';
import { gridDp } from './algorithms/grid-dp';
import { heapSort } from './algorithms/heap-sort';
import { insertionSort } from './algorithms/insertion-sort';
import { kmp } from './algorithms/kmp';
import { knapsack } from './algorithms/knapsack';
import { kruskal } from './algorithms/kruskal';
import { lcs } from './algorithms/lcs';
import { linearSearch } from './algorithms/linear-search';
import { lis } from './algorithms/lis';
import { lowestCommonAncestor } from './algorithms/lowest-common-ancestor';
import { mergeSort } from './algorithms/merge-sort';
import { networkFlow } from './algorithms/network-flow';
import { prefixSum } from './algorithms/prefix-sum';
import { prim } from './algorithms/prim';
import { quickSort } from './algorithms/quick-sort';
import { rabinKarp } from './algorithms/rabin-karp';
import { radixSort } from './algorithms/radix-sort';
import { recursionFundamentals } from './algorithms/recursion-fundamentals';
import { selectionSort } from './algorithms/selection-sort';
import { slidingWindow } from './algorithms/sliding-window';
import { topologicalSort } from './algorithms/topological-sort';
import { treeTraversal } from './algorithms/tree-traversal';
import { twoPointers } from './algorithms/two-pointers';
import { unionFind } from './algorithms/union-find';
import { array } from './data-structures/array';
import { fenwickTree } from './data-structures/fenwick-tree';
import { segmentTree } from './data-structures/segment-tree';
import { disjointSet } from './data-structures/disjoint-set';
import { redBlackTree } from './data-structures/red-black-tree';
import { avlTree } from './data-structures/avl-tree';
import { trie } from './data-structures/trie';
import { hashTable } from './data-structures/hash-table';
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
import { constraints } from './sql/constraints';
import { createTable } from './sql/create-table';
import { deleteLesson } from './sql/delete';
import { distinct } from './sql/distinct';
import { groupByHaving } from './sql/group-by-having';
import { innerJoin } from './sql/inner-join';
import { insert } from './sql/insert';
import { leftJoin } from './sql/left-join';
import { nullValues } from './sql/null-values';
import { orderByLimit } from './sql/order-by-limit';
import { selectFrom } from './sql/select-from';
import { subqueries } from './sql/subqueries';
import { update } from './sql/update';
import { where } from './sql/where';
import { normalization } from './sql/normalization';
import { isolationLevels } from './sql/isolation-levels';
import { transactions } from './sql/transactions';
import { queryPlans } from './sql/query-plans';
import { indexes } from './sql/indexes';
import { views } from './sql/views';
import { windowFunctions } from './sql/window-functions';
import { recursiveCtes } from './sql/recursive-ctes';
import { ctes } from './sql/ctes';
import { setOperations } from './sql/set-operations';
import { caseExpressions } from './sql/case-expressions';
import { manyToMany } from './sql/many-to-many';
import { selfJoin } from './sql/self-join';

/** Every live lesson, in recommended learning order. Register new lessons here. */
export const lessons: Lesson[] = [
  array,
  string,
  linkedList,
  stack,
  queue,
  hashTable,
  binaryTree,
  binarySearchTree,
  heap,
  priorityQueue,
  graph,
  trie,
  avlTree,
  redBlackTree,
  disjointSet,
  segmentTree,
  fenwickTree,
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
  recursionFundamentals,
  backtracking,
  divideAndConquer,
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
  fibonacciDp,
  knapsack,
  coinChange,
  lcs,
  lis,
  gridDp,
  greedy,
  unionFind,
  kmp,
  rabinKarp,
  aStar,
  networkFlow,
  advancedGraphAlgorithms,
  selectFrom,
  where,
  nullValues,
  orderByLimit,
  distinct,
  aggregates,
  insert,
  update,
  deleteLesson,
  groupByHaving,
  innerJoin,
  leftJoin,
  subqueries,
  selfJoin,
  manyToMany,
  createTable,
  constraints,
  caseExpressions,
  setOperations,
  ctes,
  recursiveCtes,
  windowFunctions,
  views,
  indexes,
  queryPlans,
  transactions,
  isolationLevels,
  normalization,
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
