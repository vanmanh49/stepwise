import { aStarCode, aStarSteps } from '../../algorithms/graph/aStar';
import { openGraph, wallGraph } from '../../algorithms/graph/graphs';
import type { Lesson } from '../../types/lesson';

export const aStar: Lesson = {
  id: 'a-star',
  title: 'A*',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Advanced Algorithms',
  description: 'Find a shortest path to one goal faster than Dijkstra, by steering toward the goal with a distance estimate.',
  keywords: ['a star', 'a-star search', 'heuristic', 'pathfinding', 'shortest path', 'f = g + h', 'game ai'],
  prerequisites: ['dijkstra'],
  overview:
    'A* finds a shortest path from a start to one specific goal. It works like Dijkstra’s algorithm, but instead of expanding the node closest to the start, it expands the node with the lowest f = g + h: the cost so far plus an estimate of the cost still to go. A good estimate pulls the search toward the goal, so far fewer nodes are explored.',
  concept: [
    'Dijkstra’s algorithm spreads out evenly in every direction, like ripples in a pond, until the goal happens to be reached. That is wasteful when you know where the goal is. If you are walking to a building you can see, you head roughly toward it rather than exploring every street around you equally.',
    'A* adds that sense of direction. For every node it knows g, the cost of the best path found so far, and computes h, an estimate of the remaining cost to the goal. Here h is the straight-line distance between node positions. It always expands the open node with the smallest f = g + h, the most promising estimate of a complete trip.',
    'The estimate must never overestimate the true remaining cost. A straight line is never longer than any road, so it qualifies. With such an admissible heuristic, the first time A* takes the goal off the open set, its path is a shortest path, just as with Dijkstra.',
    'If h is always 0, A* becomes Dijkstra. The better h guesses the real remaining cost, the fewer nodes A* expands. In the grid with a wall, notice how it first heads straight for the goal, discovers the wall, and only then explores around it.',
  ],
  howItWorks: [
    'Put the start in the open set with g = 0.',
    'Take the open node with the lowest f = g + h. If it is the goal, follow the parent links back: that is the path.',
    'Otherwise close it: its g is final.',
    'For each neighbour, compute g through this node. If it beats the neighbour’s current g, update g and the parent and add the neighbour to the open set.',
    'If the open set runs empty, the goal cannot be reached.',
  ],
  visualization: { kind: 'graph', graphs: [wallGraph, openGraph], needsStart: true, needsGoal: true, generate: aStarSteps },
  code: aStarCode,
  complexity: {
    rows: [{ label: 'A* with a binary heap', best: 'O(d)', average: 'O(E log V)', worst: 'O(E log V)' }],
    space: 'O(V)',
    note: 'In the worst case, with an uninformative heuristic, A* explores as much as Dijkstra. With a good heuristic it expands only nodes near the best path; d is the number of edges on that path.',
    curves: ['nlogn'],
  },
  compareWith: ['dijkstra', 'bfs'],
  prosCons: {
    pros: ['Usually explores far fewer nodes than Dijkstra', 'Still finds a shortest path with an admissible heuristic', 'Easy to tune by choosing the heuristic'],
    cons: ['Needs a good heuristic, such as positions on a map', 'Finds the path to one goal only', 'Keeps every open node in memory, which can be large'],
    useWhen: ['You need a path to one known goal', 'Nodes have positions or another way to estimate the remaining distance', 'Pathfinding in games, maps and robotics'],
    avoidWhen: ['You need distances to every node (use Dijkstra)', 'There is no sensible estimate of remaining cost', 'Edge weights can be negative'],
  },
  applications: [
    'Character movement and pathfinding in video games',
    'Route planning in maps and navigation apps',
    'Robot motion planning around obstacles',
    'Solving puzzles such as the 15-puzzle, with a heuristic like the number of misplaced tiles',
  ],
  commonMistakes: [
    'Using a heuristic that overestimates, which can return a path that is not the shortest.',
    'Stopping as soon as the goal is first reached by an edge, instead of when it is taken off the open set.',
    'Sorting by h alone (greedy best-first search), which ignores the cost already paid.',
    'Mixing units, such as a heuristic in metres and edge weights in minutes.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A* has just checked A’s neighbours. Which node does it expand next?',
      view: aStarSteps(wallGraph, 'A', 'L')[3]!.view,
      options: ['The open node with the lowest f', 'The open node with the lowest g', 'The open node with the lowest h', 'The node added most recently'],
      answer: 0,
      explanation: 'A* always expands the open node with the smallest f = g + h, the best estimate of a full trip through it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What happens if the heuristic h is 0 for every node?',
      options: ['A* behaves exactly like Dijkstra', 'A* becomes depth-first search', 'A* never finds the goal', 'A* finds a longer path'],
      answer: 0,
      explanation: 'With h = 0, f = g, so A* expands nodes in order of distance from the start, which is what Dijkstra does.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why is the straight-line distance a safe heuristic on a map?',
      options: ['It never overestimates the real remaining cost', 'It is always exact', 'It is always 0', 'It is faster to compute than the edge weights'],
      answer: 0,
      explanation: 'No route between two points is shorter than the straight line, so h never exceeds the true cost. That keeps the answer optimal.',
    },
    {
      id: 'q4',
      type: 'complexity',
      prompt: 'What is the worst-case time of A* with a binary heap, on a graph with V nodes and E edges?',
      options: ['O(E log V)', 'O(V)', 'O(V³)', 'O(2ⁿ)'],
      answer: 0,
      explanation: 'With a useless heuristic it may expand everything, like Dijkstra. A good heuristic makes it much faster in practice.',
    },
  ],
  summary: [
    'A* finds a shortest path to one goal by expanding the open node with the lowest f = g + h.',
    'g is the cost so far, h an estimate of the cost still to go.',
    'If h never overestimates, the path found is a shortest path.',
    'A good heuristic makes A* explore far fewer nodes than Dijkstra.',
  ],
};
