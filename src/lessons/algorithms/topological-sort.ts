import { buildGraph, courseGraph, directedGraph } from '../../algorithms/graph/graphs';
import { topologicalSortCode, topologicalSortSteps } from '../../algorithms/graph/topological';
import { graphView } from '../../algorithms/graph/view';
import type { Lesson } from '../../types/lesson';

export const topologicalSort: Lesson = {
  id: 'topological-sort',
  title: 'Topological Sort',
  category: 'algorithms',
  difficulty: 'intermediate',
  group: 'Graph Algorithms',
  description: 'Put the nodes of a dependency graph in an order where every prerequisite comes first.',
  keywords: ['dag', 'dependency', 'ordering', 'kahn', 'in-degree', 'prerequisite', 'schedule', 'build order'],
  prerequisites: ['graph', 'bfs'],
  overview:
    'A topological sort arranges the nodes of a directed graph in a line so that every arrow points forward. If an arrow from A to B means "A must happen before B", the result is a valid order in which to do everything. It only works when the graph has no cycles.',
  concept: [
    'Think about getting dressed. Socks go on before shoes, and a shirt before a jacket, but socks and shirt can be in either order. A topological sort produces one order that respects every "before" rule.',
    'The method in this lesson is Kahn\'s algorithm. It rests on a simple question: which tasks can be done right now? Exactly those with nothing left to wait for. In graph terms, those are the nodes with no incoming arrows: in-degree 0.',
    'Do one of those tasks, then cross it off. Every task that was waiting on it now has one fewer prerequisite. Some of them drop to zero and become available. Repeat until nothing is left.',
    'If the dependencies form a cycle (A needs B, B needs C, C needs A), none of those nodes ever reaches zero. The algorithm runs out of available nodes early, which is how it detects that no valid order exists.',
  ],
  howItWorks: [
    'Count the incoming arrows of every node. This number is its in-degree.',
    'Put every node with in-degree 0 into a ready list.',
    'Take a node from the ready list and append it to the result.',
    'For each arrow leaving that node, subtract 1 from the in-degree of the node it points to.',
    'Any node whose in-degree reaches 0 joins the ready list.',
    'Repeat until the ready list is empty. If some nodes were never placed, the graph has a cycle.',
  ],
  visualization: {
    kind: 'graph',
    graphs: [courseGraph, buildGraph, directedGraph],
    needsStart: false,
    generate: topologicalSortSteps,
  },
  code: topologicalSortCode,
  complexity: {
    rows: [{ label: 'Topological Sort (Kahn)', best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' }],
    space: 'O(V)',
    note: 'V is the number of nodes and E the number of arrows. Counting in-degrees looks at every arrow once, and the main loop takes each node once and follows each arrow once. The in-degree table and the ready list hold at most V entries.',
    curves: ['n'],
  },
  compareWith: ['bfs', 'dfs'],
  prosCons: {
    pros: ['Linear time in the size of the graph', 'Detects cycles as a side effect', 'The ready list shows which tasks could run in parallel'],
    cons: ['Only defined for directed graphs without cycles', 'The answer is usually not unique, which can surprise people comparing outputs'],
    useWhen: ['Tasks have prerequisites and you need a valid order', 'You need to check whether dependencies are circular'],
    avoidWhen: ['The graph is undirected, or cycles are a normal part of the data'],
  },
  applications: [
    'Build systems and package managers deciding what to compile or install first',
    'Planning a degree: which courses to take in which term',
    'Spreadsheets recalculating cells in dependency order',
    'Scheduling the stages of a data pipeline',
  ],
  commonMistakes: [
    'Running it on a graph with a cycle and not checking whether every node was placed.',
    'Expecting one specific answer. Several orders are usually valid.',
    'Reversing the arrows: decide once whether A → B means "A before B" or "A depends on B".',
    'Recounting in-degrees from scratch after each node instead of subtracting as you go, which makes it O(V × E).',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'An arrow means "must come before". Which of these is a valid topological order for this graph?',
      view: graphView(courseGraph),
      options: ['A, B, C, D, E, F', 'A, B, D, C, E, F', 'B, A, C, D, E, F', 'A, C, F, E, D, B'],
      answer: 0,
      explanation: 'Every arrow points forward in A, B, C, D, E, F. The others break a rule: D needs C, B needs A, and E needs D.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'In Kahn\'s algorithm, which nodes can be placed next?',
      options: [
        'Nodes whose in-degree is 0',
        'Nodes with the most outgoing arrows',
        'Nodes in alphabetical order',
        'Nodes with the highest in-degree',
      ],
      answer: 0,
      explanation: 'In-degree 0 means nothing the node depends on is still unplaced, so it is safe to go next.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the time complexity of a topological sort on a graph with V nodes and E edges?',
      options: ['O(V + E)', 'O(V²)', 'O(V × E)', 'O(E log V)'],
      answer: 0,
      explanation: 'Each node is taken from the ready list once and each edge is followed once.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'The graph has three nodes and edges A → B, B → C and C → A. What does this return?',
      code: `topologicalSort(graph);`,
      options: ['null', "['A', 'B', 'C']", "['C', 'B', 'A']", '[]'],
      answer: 0,
      explanation: 'The three nodes form a cycle, so every one has in-degree 1 and none is ever ready. Fewer nodes were placed than exist, so the function reports that no order exists.',
    },
  ],
  summary: [
    'A topological order lists nodes so that every arrow points forward.',
    'Kahn\'s algorithm repeatedly takes a node with in-degree 0 and removes its outgoing arrows.',
    'It runs in O(V + E) and detects cycles: if nodes are left over, no order exists.',
    'There are usually several valid orders.',
  ],
};
