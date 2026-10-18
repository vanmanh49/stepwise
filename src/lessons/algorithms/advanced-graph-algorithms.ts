import { directedGraph, sccGraph } from '../../algorithms/graph/graphs';
import { sccCode, sccSteps } from '../../algorithms/graph/scc';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'This lesson covers strongly connected components (SCCs) and Kosaraju’s algorithm for finding them. In a directed graph, two nodes are strongly connected when each can reach the other. Kosaraju finds every such group with two depth-first searches: one on the graph to get a finish order, and one on the graph with every edge reversed.',
  concept: [
    'In a one-way street network, being able to drive from A to B does not mean you can drive back. A strongly connected component is a set of places where you can get from any one to any other and back. Inside it, everything is mutually reachable; between components, traffic only flows one way.',
    'Shrinking every component to a single node always leaves a graph without cycles. That is why SCCs are so useful: they turn a messy directed graph into a clean one-way structure that you can order like a topological sort.',
    'Kosaraju’s first pass runs DFS and records the order in which nodes finish. A node that finishes last belongs to a component that is "upstream": nothing outside its component can reach it without being reachable from it.',
    'The second pass reverses every edge and runs DFS again, taking start nodes in reverse finish order. Reversing keeps each component intact but turns the one-way links between components around, so each DFS is trapped inside exactly one component. Every DFS tree in pass 2 is one strongly connected component.',
  ],
  howItWorks: [
    'Run DFS from every unvisited node, appending each node to a list when it finishes.',
    'Build the reversed graph by flipping every edge.',
    'Go through the nodes in reverse finish order.',
    'From each node not yet assigned, run DFS in the reversed graph; every node it reaches forms one component.',
    'Repeat until every node has a component.',
  ],
  visualization: { kind: 'graph', graphs: [sccGraph, directedGraph], needsStart: false, generate: sccSteps },
  code: sccCode,
  prosCons: {
    pros: ['Linear time', 'Built from plain DFS, easy to reason about', 'Gives components in topological order of the condensed graph'],
    cons: ['Needs two passes and a reversed copy of the graph', 'Recursive DFS can overflow the call stack on huge graphs', 'Tarjan’s algorithm does it in one pass'],
    useWhen: ['You need to know which parts of a directed graph are mutually reachable', 'Before running an algorithm that needs a DAG, such as topological sort'],
    avoidWhen: ['The graph is undirected (plain connected components are enough)', 'Memory for a reversed copy is not available (use Tarjan)'],
  },
  applications: [
    'Finding groups of web pages or social accounts that all link to each other',
    'Detecting circular dependencies between modules or packages',
    'Solving 2-SAT logic problems',
    'Simplifying a state machine into its strongly connected parts',
  ],
  commonMistakes: [
    'Running the second pass on the original graph instead of the reversed one.',
    'Taking nodes in finish order instead of reverse finish order in the second pass.',
    'Recording a node when it is first visited instead of when it finishes.',
    'Assuming that if A reaches B, they are in the same component. B must also reach A.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Pass 1 has finished. What does Kosaraju do with this graph next?',
      view: sccSteps(sccGraph).find((s) => s.title === 'Reverse every edge')!.view,
      options: ['Run DFS on the reversed graph in reverse finish order', 'Sort the nodes alphabetically', 'Run BFS from the first node', 'Remove every cycle'],
      answer: 0,
      explanation: 'With every edge flipped, a DFS from the last-finished node stays inside its own component.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'In A → B → C → A, C → D, how many strongly connected components are there?',
      options: ['2: {A, B, C} and {D}', '1', '4', '3: {A, B}, {C} and {D}'],
      answer: 0,
      explanation: 'A, B and C reach each other around the cycle. D cannot reach back, so it is on its own.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the time complexity of Kosaraju’s algorithm?',
      options: ['O(V + E)', 'O(V²)', 'O(E log V)', 'O(V × E)'],
      answer: 0,
      explanation: 'Two DFS passes and one edge reversal, each linear in the size of the graph.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'If you shrink every strongly connected component to a single node, what kind of graph is left?',
      options: ['A directed acyclic graph', 'An undirected tree', 'A complete graph', 'A single cycle'],
      answer: 0,
      explanation: 'Any cycle between components would merge them into one component, so none can remain.',
    },
  ],
  summary: [
    'A strongly connected component is a set of nodes that can all reach each other.',
    'Kosaraju runs DFS to record finish order, reverses the edges, then runs DFS again in reverse finish order.',
    'Each DFS tree in the second pass is one component.',
    'It runs in O(V + E) time.',
  ],
};

export default content;
