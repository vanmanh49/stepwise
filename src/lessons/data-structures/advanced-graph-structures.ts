import { graphRepsStructure } from '../../data-structures/graphReps';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'The same graph can be stored in different ways, and the choice decides how fast each question is. An adjacency matrix answers "is there an edge?" in one step but uses n² cells. An adjacency list stores only real edges and lists a node\'s neighbours quickly. An edge list is the most compact, but has to be scanned for almost everything. This lesson shows all three for one graph, side by side.',
  concept: [
    'An adjacency matrix is an n × n grid: the cell in row u, column v is 1 when there is an edge from u to v. Any edge can be checked or changed in O(1), but it always takes n² cells, even when the graph has few edges, and listing a node\'s neighbours means reading a whole row.',
    'An adjacency list gives each node a list of its neighbours. It uses O(n + E) memory, and listing neighbours costs only the node\'s degree. Checking for one edge means scanning one list. Most graph algorithms, such as BFS, DFS and Dijkstra, walk neighbours, so they use adjacency lists.',
    'An edge list is just the pairs (u, v). It is O(E) memory and trivial to build, but finding an edge or a node\'s neighbours means scanning every pair. It suits algorithms that process edges one by one, such as Kruskal\'s, which sorts them by weight.',
  ],
  howItWorks: [
    'Dense graphs, where E is close to n², fit a matrix well: the n² cells are mostly used.',
    'Sparse graphs, where E is close to n, fit lists: a matrix would be almost all zeros.',
    'In an undirected graph, each edge is stored both ways: the matrix is symmetric and the edge appears in both nodes\' lists.',
    'In a directed graph, row u of the matrix and u\'s list hold only the edges leaving u.',
    'Pick by the question you ask most: "is there an edge u–v?" favours a matrix; "who are u\'s neighbours?" favours lists; "go through all edges" works with an edge list.',
  ],
  visualization: { kind: 'structure', structure: graphRepsStructure },
  code: graphRepsStructure.code,
  prosCons: {
    pros: ['Matrix: O(1) edge checks and very simple code', 'Lists: memory grows with the real edges, and neighbours come for free', 'Edge list: the smallest and easiest to sort or stream'],
    cons: ['Matrix: n² memory and O(n) to list neighbours', 'Lists: an edge check scans a list', 'Edge list: nearly every question scans all edges'],
    useWhen: ['Matrix: small or dense graphs, or many "is there an edge?" questions (Floyd–Warshall)', 'Lists: large sparse graphs and traversals (BFS, DFS, Dijkstra)', 'Edge list: algorithms that sort or loop over edges (Kruskal, Bellman–Ford)'],
    avoidWhen: ['Matrix: large sparse graphs', 'Lists: you mostly check single edges in a dense graph', 'Edge list: you need fast neighbour lookups'],
  },
  applications: [
    'Road and social networks stored as adjacency lists for route finding and friend suggestions',
    'Distance tables and image-based grids stored as matrices',
    'Graph files and databases exchanging edges as edge lists (CSV of pairs)',
    'Converting between forms: building lists from an edge list before running BFS',
  ],
  commonMistakes: [
    'Using a matrix for a huge sparse graph and running out of memory.',
    'Adding an undirected edge in only one direction, so u sees v but v does not see u.',
    'Assuming an adjacency list check is O(1). It is O(degree) unless each list is a hash set.',
    'Treating (u, v) and (v, u) as the same edge in a directed graph.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'To list the neighbours of node 4 using the adjacency matrix, how many cells are read?',
      view: graphRepsStructure.view(graphRepsStructure.initial),
      options: ['6', '3', '7', '1'],
      answer: 0,
      explanation: 'The whole row for node 4 must be read, zeros included: one cell per node, 6 in all. The adjacency list would read just its 3 neighbours.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'How much memory does an adjacency matrix use for a graph with n nodes and E edges?',
      options: ['O(n²)', 'O(n + E)', 'O(E)', 'O(n log n)'],
      answer: 0,
      explanation: 'It has a cell for every possible pair of nodes, whether or not there is an edge.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'You run BFS on a road network with a million junctions and about three roads each. Which representation fits best?',
      options: ['Adjacency list', 'Adjacency matrix', 'Edge list'],
      answer: 0,
      explanation: 'The graph is very sparse. BFS asks for each node\'s neighbours, which lists give in O(degree), and lists use O(n + E) memory instead of a trillion matrix cells.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'In an undirected graph, this code adds an edge. What is wrong with it?',
      code: `function addEdge(u: number, v: number) {\n  matrix[u][v] = 1;\n  list[u].push(v);\n}`,
      options: ['It stores only one direction, so v does not know about u', 'It should use edges.push', 'Nothing is wrong'],
      answer: 0,
      explanation: 'An undirected edge works both ways, so matrix[v][u] and list[v] must be updated too. Otherwise a search starting at v never reaches u.',
    },
  ],
  summary: [
    'An adjacency matrix answers edge checks in O(1) but always uses n² cells.',
    'Adjacency lists use O(n + E) memory and give a node\'s neighbours in O(degree): the usual choice for sparse graphs.',
    'An edge list is the most compact and suits algorithms that go through all edges.',
    'Choose by density and by the question you ask most often.',
  ],
};

export default content;
