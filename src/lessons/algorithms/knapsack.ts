import { knapsackCode, knapsackSteps } from '../../algorithms/dp/knapsack';
import type { LessonContent } from '../../types/lesson';

const example = { weights: '1, 3, 4, 5', values: '1, 4, 5, 7', capacity: '7' };

const content: LessonContent = {
  overview:
    'In the 0/1 knapsack problem you have items, each with a weight and a value, and a bag that can carry a limited weight. Each item is either taken whole or left behind. Dynamic programming finds the most valuable selection by filling a table: for each item and each capacity, the best value is either the best without that item or that item plus the best for the capacity left over.',
  concept: [
    'You are packing for a hike with a bag that holds 7 kg. A camera is worth a lot but weighs 4 kg, snacks are light but less useful, and so on. Taking the most valuable item first, or the lightest, can both go wrong. You need to compare combinations.',
    'Trying every combination is 2ⁿ subsets. Dynamic programming avoids that by asking a smaller question: what is the best value using only the first i items, with capacity c? Call it dp[i][c].',
    'For item i there are only two choices. Skip it: the answer is dp[i − 1][c], the cell directly above. Take it, if it fits: its value plus dp[i − 1][c − weight], the best for the capacity that remains. dp[i][c] is the larger of the two. Every cell depends only on the row above, so the table fills row by row.',
    'The bottom-right cell holds the best value. To find which items achieve it, walk back up: wherever a cell differs from the one above, that item was taken, so jump left by its weight and continue.',
  ],
  howItWorks: [
    'Make a table with one row per item (plus a row for no items) and one column per capacity from 0 to C.',
    'Fill the no-items row with 0.',
    'For each item i and capacity c: dp[i][c] = dp[i − 1][c] if the item does not fit.',
    'Otherwise dp[i][c] = max(dp[i − 1][c], value + dp[i − 1][c − weight]).',
    'Read the answer in dp[n][C], then walk back up the table to recover the chosen items.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'weights', label: 'Weights', type: 'numbers', sample: example.weights, help: '1 to 5 items, each 1 to 20.' },
      { name: 'values', label: 'Values', type: 'numbers', sample: example.values, help: 'One value per item, each 1 to 20.' },
      { name: 'capacity', label: 'Capacity', type: 'number', sample: example.capacity, help: 'From 0 to 10.' },
    ],
    presets: [
      { label: 'Hiking bag', values: example },
      { label: 'Nothing fits', values: { weights: '5, 6', values: '3, 4', capacity: '4' } },
      { label: 'Light but valuable', values: { weights: '2, 2, 3, 5', values: '6, 10, 12, 13', capacity: '7' } },
    ],
    generate: knapsackSteps,
  },
  code: knapsackCode,
  prosCons: {
    pros: ['Finds the true best selection, unlike greedy rules', 'Far faster than trying all 2ⁿ subsets', 'The table also tells you which items to take'],
    cons: ['Needs a table of size items × capacity', 'Slow when the capacity is a huge number', 'Only works with whole-number weights'],
    useWhen: ['Items cannot be split', 'The capacity is a modest whole number', 'You need the optimal choice, not an approximation'],
    avoidWhen: ['Items can be split into fractions (greedy by value per weight is optimal)', 'Capacities are in the millions'],
  },
  applications: [
    'Choosing projects to fund within a budget',
    'Loading cargo, containers or delivery vans by weight',
    'Picking ads or content to fit a time slot',
    'Selecting investments with limited capital',
  ],
  commonMistakes: [
    'Taking items greedily by value or by value per weight, which can miss the best combination.',
    'Reading from the current row instead of the row above, which lets an item be taken twice.',
    'Forgetting the case where the item does not fit and leaving the cell empty.',
    'Recovering the items by checking only values, without jumping left by the item’s weight.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Next is dp[2][3]: item 2 weighs 3 and is worth 4. The cell above holds 1 and dp[1][0] is 0. What value goes in?',
      view: knapsackSteps(example)[11]!.view,
      options: ['4', '1', '5', '3'],
      answer: 0,
      explanation: 'Skip gives 1. Take gives 4 + dp[1][0] = 4 + 0 = 4. The larger is 4.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which two cells does dp[i][c] depend on?',
      options: ['dp[i − 1][c] and dp[i − 1][c − weight]', 'dp[i][c − 1] and dp[i − 1][c − 1]', 'Only dp[i − 1][c]', 'Every cell in the row above'],
      answer: 0,
      explanation: 'Skipping the item reads the cell above; taking it reads the cell above and to the left by the item’s weight.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the running time for n items and capacity C?',
      options: ['O(n × C)', 'O(2ⁿ)', 'O(n log n)', 'O(C²)'],
      answer: 0,
      explanation: 'The table has (n + 1) × (C + 1) cells and each is filled in constant time.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'knapsack([2, 3], [3, 4], 4);',
      options: ['4', '7', '3', '0'],
      answer: 0,
      explanation: 'Both items together weigh 5, too much. Alone, item 2 (weight 3, value 4) beats item 1 (value 3).',
    },
  ],
  summary: [
    '0/1 knapsack picks whole items to maximise value within a weight limit.',
    'dp[i][c] is the best value from the first i items with capacity c.',
    'Each cell is the better of skipping the item or taking it plus the best for the remaining capacity.',
    'It runs in O(n × C), and walking back through the table recovers the chosen items.',
  ],
};

export default content;
