import { gridPathsCode, gridPathsSteps } from '../../algorithms/dp/gridPaths';
import type { LessonContent } from '../../types/lesson';

const example = { rows: '3', cols: '4', blocked: 'none' };

const content: LessonContent = {
  overview:
    'Many DP problems live on a grid. In this one, a robot starts in the top-left corner and may only move right or down. How many different routes lead to the bottom-right corner, possibly avoiding blocked squares? Each square’s count is simply the sum of the counts of the square above and the square to the left.',
  concept: [
    'Picture a city laid out in blocks, and you are walking from the north-west corner to the south-east corner, always heading east or south. Every route is a sequence of moves, and listing them all quickly becomes impossible: a 10 × 10 grid already has 48,620 routes.',
    'Look at the last move into any square instead. It came either from the square above or from the square to the left. So the number of ways to reach a square is the ways to reach the square above plus the ways to reach the square to the left.',
    'The top-left square has exactly one way: start there. Squares in the first row can only be reached from the left, and squares in the first column only from above. A blocked square has 0 ways, which naturally cuts off every route through it.',
    'Filling the grid row by row, every square’s two neighbours are always ready. The same pattern, a cell built from its neighbours above and to the left, appears in minimum-cost paths, edit distance and the LCS table.',
  ],
  howItWorks: [
    'Set the start square to 1, or to 0 if it is blocked.',
    'Give every blocked square 0.',
    'Fill the other squares row by row: ways = ways from above + ways from the left (0 when off the grid).',
    'The bottom-right square holds the number of routes.',
    'If it is 0, the blocked squares cut the start off from the goal.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'rows', label: 'Rows', type: 'number', sample: example.rows, help: 'From 1 to 6.' },
      { name: 'cols', label: 'Columns', type: 'number', sample: example.cols, help: 'From 1 to 6.' },
      { name: 'blocked', label: 'Blocked squares', type: 'choice', sample: example.blocked, options: ['none', 'wall'] },
    ],
    presets: [
      { label: '3 × 4', values: example },
      { label: 'With a wall', values: { rows: '4', cols: '5', blocked: 'wall' } },
      { label: '6 × 6', values: { rows: '6', cols: '6', blocked: 'none' } },
    ],
    generate: gridPathsSteps,
  },
  code: gridPathsCode,
  prosCons: {
    pros: ['Counts an exponential number of routes in quadratic time', 'Obstacles fit in naturally as zeros', 'The same pattern solves many grid problems'],
    cons: ['Needs a table as large as the grid (or one row)', 'Only works when moves never go back up or left'],
    useWhen: ['Movement is restricted to directions that never revisit a square', 'You need a count, a minimum or a maximum over all routes'],
    avoidWhen: ['Moves can go in any direction (use BFS or Dijkstra)', 'You need to list every route, not count them'],
  },
  applications: [
    'Counting robot or game routes on a board',
    'Minimum-cost paths through a grid of costs',
    'Image processing such as seam carving',
    'Edit distance and sequence alignment, which use the same table shape',
  ],
  commonMistakes: [
    'Forgetting to set the start to 1, which makes every count 0.',
    'Reading cells outside the grid instead of treating them as 0.',
    'Letting a blocked square keep a count, so routes pass through walls.',
    'Filling columns before the rows above are ready.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'dp[0][1] = 1 and dp[1][0] = 1. What is dp[1][1]?',
      view: gridPathsSteps(example)[5]!.view,
      options: ['2', '1', '0', '3'],
      answer: 0,
      explanation: 'One way arrives from above and one from the left: 1 + 1 = 2.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How many routes cross an open 2 × 2 grid from top-left to bottom-right?',
      options: ['2', '1', '4', '3'],
      answer: 0,
      explanation: 'Right then down, or down then right.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What does the table method cost for an r × c grid?',
      options: ['O(r × c)', 'O(2^(r + c))', 'O(r + c)', 'O((r × c)²)'],
      answer: 0,
      explanation: 'Each of the r × c squares is filled with one addition.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'uniquePaths(1, 5, new Set());',
      options: ['1', '5', '0', '4'],
      answer: 0,
      explanation: 'In a single row the only route is to keep moving right.',
    },
  ],
  summary: [
    'Grid DP builds each square’s answer from its neighbours above and to the left.',
    'Here, ways(r, c) = ways(r − 1, c) + ways(r, c − 1), and the start has 1 way.',
    'Blocked squares are 0, which removes every route through them.',
    'It counts exponentially many routes in O(rows × cols) time.',
  ],
};

export default content;
