import type { Category, Difficulty, Topic } from '../types/lesson';

type Row = [id: string, title: string, group?: string];

const topics = (category: Category, difficulty: Difficulty, rows: Row[]): Topic[] =>
  rows.map(([id, title, group]) => ({ id, title, category, difficulty, ...(group && { group }) }));

/**
 * The full planned curriculum. A topic becomes a live lesson when a lesson with
 * the same id is registered in registry.ts; until then it shows as "Coming soon".
 */
export const curriculum: Topic[] = [
  ...topics('data-structures', 'beginner', [
    ['array', 'Array'],
    ['string', 'String'],
    ['linked-list', 'Linked List'],
    ['stack', 'Stack'],
    ['queue', 'Queue'],
    ['hash-table', 'Hash Table'],
  ]),
  ...topics('data-structures', 'intermediate', [
    ['binary-tree', 'Binary Tree'],
    ['binary-search-tree', 'Binary Search Tree'],
    ['heap', 'Heap'],
    ['priority-queue', 'Priority Queue'],
    ['graph', 'Graph'],
    ['trie', 'Trie'],
  ]),
  ...topics('data-structures', 'advanced', [
    ['avl-tree', 'AVL Tree'],
    ['red-black-tree', 'Red-Black Tree'],
    ['disjoint-set', 'Disjoint Set / Union Find'],
    ['segment-tree', 'Segment Tree'],
    ['fenwick-tree', 'Fenwick Tree'],
    ['b-tree', 'B-Tree / B+ Tree'],
    ['advanced-graph-structures', 'Graph Representations'],
  ]),
  ...topics('algorithms', 'beginner', [
    ['linear-search', 'Linear Search', 'Searching'],
    ['binary-search', 'Binary Search', 'Searching'],
    ['bubble-sort', 'Bubble Sort', 'Sorting'],
    ['selection-sort', 'Selection Sort', 'Sorting'],
    ['insertion-sort', 'Insertion Sort', 'Sorting'],
    ['two-pointers', 'Two Pointers', 'Basic Techniques'],
    ['sliding-window', 'Sliding Window', 'Basic Techniques'],
    ['prefix-sum', 'Prefix Sum', 'Basic Techniques'],
  ]),
  ...topics('algorithms', 'intermediate', [
    ['merge-sort', 'Merge Sort', 'Sorting'],
    ['quick-sort', 'Quick Sort', 'Sorting'],
    ['heap-sort', 'Heap Sort', 'Sorting'],
    ['counting-sort', 'Counting Sort', 'Sorting'],
    ['radix-sort', 'Radix Sort', 'Sorting'],
    ['recursion-fundamentals', 'Recursion Fundamentals', 'Recursion'],
    ['backtracking', 'Backtracking', 'Recursion'],
    ['divide-and-conquer', 'Divide and Conquer', 'Recursion'],
    ['bfs', 'Breadth-First Search (BFS)', 'Graph Algorithms'],
    ['dfs', 'Depth-First Search (DFS)', 'Graph Algorithms'],
    ['topological-sort', 'Topological Sort', 'Graph Algorithms'],
    ['tree-traversal', 'Tree Traversal', 'Tree Algorithms'],
    ['lowest-common-ancestor', 'Lowest Common Ancestor', 'Tree Algorithms'],
  ]),
  ...topics('algorithms', 'advanced', [
    ['dijkstra', "Dijkstra's Algorithm", 'Shortest Path'],
    ['bellman-ford', 'Bellman-Ford', 'Shortest Path'],
    ['floyd-warshall', 'Floyd-Warshall', 'Shortest Path'],
    ['kruskal', 'Kruskal', 'Minimum Spanning Tree'],
    ['prim', 'Prim', 'Minimum Spanning Tree'],
    ['fibonacci-dp', 'Fibonacci DP', 'Dynamic Programming'],
    ['knapsack', '0/1 Knapsack', 'Dynamic Programming'],
    ['coin-change', 'Coin Change', 'Dynamic Programming'],
    ['lcs', 'Longest Common Subsequence', 'Dynamic Programming'],
    ['lis', 'Longest Increasing Subsequence', 'Dynamic Programming'],
    ['grid-dp', 'Grid DP', 'Dynamic Programming'],
    ['greedy', 'Greedy Algorithms', 'Advanced Algorithms'],
    ['union-find', 'Union Find', 'Advanced Algorithms'],
    ['kmp', 'KMP', 'Advanced Algorithms'],
    ['rabin-karp', 'Rabin-Karp', 'Advanced Algorithms'],
    ['a-star', 'A*', 'Advanced Algorithms'],
    ['network-flow', 'Network Flow', 'Advanced Algorithms'],
    ['advanced-graph-algorithms', 'Advanced Graph Algorithms', 'Advanced Algorithms'],
  ]),
  ...topics('sql', 'beginner', [
    ['select-from', 'SELECT and FROM', 'Querying'],
    ['where', 'Filtering with WHERE', 'Querying'],
    ['null-values', 'NULL and three-valued logic', 'Querying'],
    ['order-by-limit', 'Sorting and LIMIT', 'Querying'],
    ['distinct', 'DISTINCT', 'Querying'],
    ['aggregates', 'COUNT, SUM, AVG, MIN, MAX', 'Summarising'],
    ['insert', 'INSERT', 'Modifying data'],
    ['update', 'UPDATE', 'Modifying data'],
    ['delete', 'DELETE', 'Modifying data'],
  ]),
  ...topics('sql', 'intermediate', [
    ['group-by-having', 'GROUP BY and HAVING', 'Summarising'],
    ['inner-join', 'INNER JOIN', 'Joins'],
    ['left-join', 'LEFT JOIN', 'Joins'],
    ['subqueries', 'Subqueries', 'Subqueries'],
    ['self-join', 'Self Join', 'Joins'],
    ['many-to-many', 'Many-to-Many Joins', 'Joins'],
    ['create-table', 'CREATE TABLE', 'Modifying data'],
    ['constraints', 'Constraints', 'Modifying data'],
    ['case-expressions', 'CASE Expressions', 'Advanced querying'],
    ['set-operations', 'UNION, INTERSECT, EXCEPT', 'Advanced querying'],
  ]),
  ...topics('sql', 'advanced', [
    ['ctes', 'Common Table Expressions', 'Advanced querying'],
    ['recursive-ctes', 'Recursive CTEs', 'Advanced querying'],
    ['window-functions', 'Window Functions', 'Advanced querying'],
    ['views', 'Views', 'Database internals'],
    ['indexes', 'Indexes', 'Database internals'],
    ['query-plans', 'Query Plans', 'Database internals'],
    ['transactions', 'Transactions', 'Database internals'],
    ['isolation-levels', 'Isolation Levels', 'Database internals'],
    ['normalization', 'Normalization', 'Database internals'],
  ]),
];

export const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export function topicsIn(category: Category): Topic[] {
  return curriculum.filter((t) => t.category === category);
}

/** The recommended journey shown on the home page. */
export const roadmap: { stage: string; steps: { label: string; topicIds: string[] }[] }[] = [
  {
    stage: 'Foundations',
    steps: [
      { label: 'Array', topicIds: ['array'] },
      { label: 'Linked List', topicIds: ['linked-list'] },
      { label: 'Stack & Queue', topicIds: ['stack', 'queue'] },
      { label: 'Hash Table', topicIds: ['hash-table'] },
    ],
  },
  {
    stage: 'Data Structures',
    steps: [
      { label: 'Tree', topicIds: ['binary-tree', 'binary-search-tree'] },
      { label: 'Heap', topicIds: ['heap'] },
      { label: 'Graph', topicIds: ['graph'] },
    ],
  },
  {
    stage: 'Algorithms',
    steps: [
      { label: 'Searching', topicIds: ['linear-search', 'binary-search'] },
      { label: 'Sorting', topicIds: ['bubble-sort', 'selection-sort', 'insertion-sort', 'merge-sort', 'quick-sort'] },
      { label: 'Recursion', topicIds: ['recursion-fundamentals', 'backtracking', 'divide-and-conquer'] },
      { label: 'Graph Algorithms', topicIds: ['bfs', 'dfs', 'dijkstra'] },
      { label: 'Dynamic Programming', topicIds: ['fibonacci-dp', 'knapsack', 'coin-change'] },
    ],
  },
];
