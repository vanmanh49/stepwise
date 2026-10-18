import { greedyCoinsCode, greedyCoinsSteps } from '../../algorithms/greedy/coins';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A greedy algorithm builds a solution one step at a time, always taking the option that looks best at that moment and never going back. This lesson uses making change: pay an amount with as few coins as possible by always taking the largest coin that fits. It works perfectly for everyday coins, and fails for some other coin sets, which shows exactly when greedy is safe.',
  concept: [
    'Giving change at a till, you instinctively reach for the biggest coin that does not overshoot: for 63 cents, two quarters, a dime and three pennies. That instinct is a greedy algorithm. Each choice is made locally, using only what is left to pay, and is never reconsidered.',
    'Greedy algorithms are attractive because they are simple and fast: here, sort the coins once and walk through them. Kruskal’s and Prim’s minimum spanning trees and Dijkstra’s shortest paths are all greedy, and for those problems the greedy choice is provably always safe.',
    'For making change, it depends on the coins. With coins 1, 3 and 4, paying 6 greedily takes 4, then 1, then 1: three coins. But 3 + 3 uses only two. The early choice of 4 looked best and turned out to be a trap, and greedy has no way to back out.',
    'So the real skill with greedy algorithms is knowing when the locally best choice is guaranteed to be part of a best overall answer. When it is not, you need a method that compares alternatives, such as dynamic programming in the Coin Change lesson.',
  ],
  howItWorks: [
    'Sort the coins from largest to smallest.',
    'Take the largest coin that is not more than the amount still to pay.',
    'Subtract it and repeat with the same coin while it still fits.',
    'When it no longer fits, move to the next smaller coin.',
    'Stop when nothing is left to pay, or report that you are stuck if no coin fits.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'coins', label: 'Coins', type: 'numbers', sample: '25, 10, 5, 1', help: '1 to 6 coin values from 1 to 100.' },
      { name: 'amount', label: 'Amount', type: 'number', sample: '63', help: 'From 1 to 200.' },
    ],
    presets: [
      { label: 'US coins', values: { coins: '25, 10, 5, 1', amount: '63' } },
      { label: 'Greedy fails', values: { coins: '1, 3, 4', amount: '6' } },
      { label: 'Greedy gets stuck', values: { coins: '4, 3', amount: '6' } },
    ],
    generate: greedyCoinsSteps,
  },
  code: greedyCoinsCode,
  prosCons: {
    pros: ['Very simple to write and explain', 'Fast: usually a sort plus one pass', 'Optimal for many important problems, such as minimum spanning trees'],
    cons: ['Can give a worse answer than the best possible', 'Can get stuck even when a solution exists', 'Proving that greedy is correct for a problem can be hard'],
    useWhen: ['The problem is known to have the greedy-choice property', 'A good, fast approximation is acceptable'],
    avoidWhen: ['A wrong early choice can ruin the result and you need the true optimum (use dynamic programming)'],
  },
  applications: [
    'Making change with standard currency coins',
    'Scheduling the most meetings in one room by always picking the one that ends first',
    'Huffman coding for compression',
    'Minimum spanning trees (Kruskal, Prim) and shortest paths (Dijkstra)',
  ],
  commonMistakes: [
    'Assuming greedy is optimal for every coin system. It is not for coins such as 1, 3, 4.',
    'Forgetting to sort the coins from largest to smallest first.',
    'Taking each coin at most once instead of as many times as it fits.',
    'Not handling the case where greedy gets stuck with an amount left over.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Greedy change for 63 has taken one 25. What does it take next?',
      view: greedyCoinsSteps({ coins: '25, 10, 5, 1', amount: '63' })[1]!.view,
      options: ['Another 25', 'A 10', 'A 5', 'A 1'],
      answer: 0,
      explanation: '38 is still left to pay, and 25 fits into 38, so greedy takes 25 again before moving on.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With coins 1, 3 and 4, how many coins does greedy use to pay 6, and what is the best possible?',
      options: ['Greedy uses 3, the best is 2', 'Both use 2', 'Greedy uses 2, the best is 3', 'Both use 3'],
      answer: 0,
      explanation: 'Greedy takes 4, 1, 1. The best answer is 3 + 3, which greedy never considers once it has taken the 4.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What dominates the running time of greedy change for n coin types?',
      options: ['Sorting the coins: O(n log n)', 'Trying every combination: O(2ⁿ)', 'A table of all amounts: O(n × amount)', 'Nothing: it is O(1)'],
      answer: 0,
      explanation: 'After one sort, greedy walks through the coins once and never compares alternatives.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'greedyCoins([4, 3], 6);',
      options: ['null', '[3, 3]', '[4]', '[4, 3]'],
      answer: 0,
      explanation: 'Greedy takes 4 and then 2 is left, which neither coin fits. It is stuck, even though 3 + 3 would have worked.',
    },
  ],
  summary: [
    'A greedy algorithm always takes the choice that looks best right now and never revisits it.',
    'Greedy change takes the largest coin that fits, again and again.',
    'It is optimal for everyday coins but not for every coin system, and it can get stuck.',
    'When greedy is not safe, dynamic programming compares the alternatives instead.',
  ],
};

export default content;
