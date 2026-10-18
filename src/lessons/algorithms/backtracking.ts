import { nQueensCode, nQueensSteps } from '../../algorithms/recursion/nQueens';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Backtracking builds a solution step by step, trying one option at each step. When it reaches a point where no option can work, it undoes its most recent choice and tries the next one. This lesson solves the N-Queens puzzle: place N queens on an N × N board so that no two attack each other.',
  concept: [
    'Think of walking through a maze. At each junction you pick a path. If it ends in a wall, you walk back to the last junction and try a path you have not taken. You never explore a corridor you already know is a dead end, and you never need a map of the whole maze.',
    'For N-Queens, the choices are where to put the queen in each row. Put a queen in row 0, then find a safe square in row 1, then row 2. If some row has no safe square, the queens above it are in a bad arrangement: remove the last queen and move it to its next safe square.',
    'The key to backtracking’s speed is pruning. As soon as a partial board has two queens attacking each other, every board that extends it is invalid too, so the whole branch is skipped. Checking each placement right away cuts the search from millions of boards to a few dozen placements.',
    'Recursion fits naturally: place(row) tries each column and calls place(row + 1). Returning false means "dead end", and the caller undoes its choice. The call tree on the right shows every attempt, with abandoned branches crossed out.',
  ],
  howItWorks: [
    'Start at row 0 with an empty board.',
    'Go through the columns of the current row and pick the first square no earlier queen attacks.',
    'Place a queen there and recursively solve the next row.',
    'If the next row reports a dead end, remove the queen and try the next safe column.',
    'If no column works, report a dead end to the previous row. When a queen is placed in the last row, the board is solved.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'n', label: 'Queens (n)', type: 'number', sample: '4', help: 'From 4 to 6.' }],
    presets: [
      { label: '4 queens', values: { n: '4' } },
      { label: '5 queens', values: { n: '5' } },
      { label: '6 queens', values: { n: '6' } },
    ],
    generate: nQueensSteps,
  },
  code: nQueensCode,
  prosCons: {
    pros: ['Finds a solution, or proves none exists', 'Pruning skips huge parts of the search', 'Needs memory only for the current path'],
    cons: ['Worst case is still exponential or factorial', 'Speed depends heavily on the order choices are tried in', 'Can be slow when constraints are only checked late'],
    useWhen: ['You must find any or all arrangements that satisfy constraints', 'Partial solutions can be checked early', 'Puzzles, scheduling and combinations'],
    avoidWhen: ['The problem has overlapping subproblems (use dynamic programming)', 'A greedy rule is provably correct', 'An approximate answer is enough for a huge search space'],
  },
  applications: [
    'Solving Sudoku, crosswords and other puzzles',
    'Generating all permutations, combinations or subsets',
    'Scheduling with constraints, such as timetables',
    'Parsers and regular-expression engines that try alternatives',
  ],
  commonMistakes: [
    'Forgetting to undo a choice after it fails, so the board keeps stale queens.',
    'Checking for conflicts only once the board is full, which removes all pruning.',
    'Missing the diagonal check, or checking only one of the two diagonals.',
    'Not stopping after the first solution when only one is needed.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A queen sits at row 0, column 0. Which square of row 1 does backtracking try first?',
      view: nQueensSteps({ n: '4' })[1]!.view,
      options: ['Column 2', 'Column 0', 'Column 1', 'Column 3'],
      answer: 0,
      explanation: 'Column 0 is attacked along the column and column 1 along the diagonal. Column 2 is the first safe square.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does backtracking do when a row has no safe square?',
      options: ['Removes the queen from the previous row and tries its next column', 'Starts over from an empty board', 'Places the queen anyway', 'Skips the row'],
      answer: 0,
      explanation: 'The dead end means an earlier choice was wrong. Undoing only the most recent choice keeps all the work above it.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'Without any pruning, how many ways are there to place one queen per row and column on an n × n board?',
      options: ['n!', 'n²', '2n', 'n log n'],
      answer: 0,
      explanation: 'Row 0 has n columns to choose from, row 1 has n − 1 left, and so on: n × (n − 1) × … × 1.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'solveNQueens(4);',
      options: ['[1, 3, 0, 2]', '[0, 2, 1, 3]', 'null', '[0, 1, 2, 3]'],
      answer: 0,
      explanation: 'Starting with column 0 in row 0 leads to dead ends, so the first solution starts with column 1: queens at columns 1, 3, 0, 2.',
    },
  ],
  summary: [
    'Backtracking builds a solution one choice at a time and undoes choices that lead to dead ends.',
    'Checking each choice immediately prunes whole branches of the search.',
    'Recursion keeps the current path; returning false triggers the undo.',
    'The worst case is still exponential, but pruning makes many puzzles fast in practice.',
  ],
};

export default content;
