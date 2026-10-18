import { coinChangeCode, coinChangeSteps } from '../../algorithms/dp/coinChange';
import type { LessonContent } from '../../types/lesson';

const fails = { coins: '1, 3, 4', amount: '6' };

const content: LessonContent = {
  overview:
    'The coin change problem asks for the fewest coins that add up to an amount, when each coin value can be used as often as you like. Taking the largest coin first works for everyday coins but fails for others. Dynamic programming always finds the best answer by working out the fewest coins for every amount from 0 up to the target.',
  concept: [
    'In the Greedy lesson, paying 6 with coins 1, 3 and 4 went wrong: greedy took 4, then 1, then 1, three coins, while 3 + 3 needs only two. Greedy commits to a choice too early. To be sure, we must compare the options.',
    'Think about the last coin of the best answer for amount a. If it is coin c, the rest of the coins pay a − c, and they must be the best way to pay a − c. So the fewest coins for a is 1 plus the fewest coins for a − c, for the best choice of c.',
    'That gives a table dp[a] for every amount from 0 to the target. dp[0] is 0. For each larger amount, try every coin that fits, look up dp[a − coin], add one, and keep the smallest. Amounts that no coin can reach stay at ∞.',
    'Each cell depends only on cells to its left, so filling left to right always has what it needs. Remembering which coin gave each minimum lets you walk back from the target to list the coins used.',
  ],
  howItWorks: [
    'Make a table dp[0..amount], with dp[0] = 0 and every other cell ∞.',
    'For each amount a from 1 to the target, and each coin c ≤ a:',
    'if dp[a − c] + 1 is smaller than dp[a], store it and remember c as the last coin.',
    'When the table is full, dp[amount] is the fewest coins, or ∞ if the amount is impossible.',
    'Walk back from the target, subtracting the remembered last coin each time, to list the coins.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'coins', label: 'Coins', type: 'numbers', sample: fails.coins, help: '1 to 5 coin values from 1 to 25.' },
      { name: 'amount', label: 'Amount', type: 'number', sample: fails.amount, help: 'From 0 to 20.' },
    ],
    presets: [
      { label: 'Greedy fails', values: fails },
      { label: 'US coins', values: { coins: '1, 5, 10, 25', amount: '20' } },
      { label: 'Impossible', values: { coins: '5', amount: '3' } },
    ],
    generate: coinChangeSteps,
  },
  code: coinChangeCode,
  prosCons: {
    pros: ['Always finds the fewest coins, for any coin set', 'Detects impossible amounts', 'Simple one-dimensional table'],
    cons: ['Slower than greedy', 'The table grows with the amount, so huge amounts are costly', 'Works with whole-number amounts only'],
    useWhen: ['The coin set is unusual, or you cannot prove greedy is safe', 'Amounts are modest whole numbers'],
    avoidWhen: ['The coins are a standard system where greedy is known to be optimal and speed matters'],
  },
  applications: [
    'Vending machines and tills with unusual coin sets',
    'Fewest stamps, packages or batches to reach an exact total',
    'Counting the number of ways to make change (a small variation)',
    'A building block for many resource-allocation problems',
  ],
  commonMistakes: [
    'Starting dp[0] at ∞ instead of 0, so nothing is ever reachable.',
    'Using 0 instead of ∞ for unreachable amounts, which makes impossible amounts look free.',
    'Adding 1 to ∞ with fixed-size integers, which can overflow.',
    'Assuming greedy gives the same answer and skipping the table.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With coins 1, 3 and 4, the table is filled up to dp[5] = 2. What is dp[6]?',
      view: coinChangeSteps(fails)[5]!.view,
      options: ['2', '3', '1', '6'],
      answer: 0,
      explanation: 'Last coin 3 gives dp[3] + 1 = 1 + 1 = 2, better than dp[5] + 1 = 3 or dp[2] + 1 = 3.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does this method beat greedy on coins 1, 3, 4 for amount 6?',
      options: [
        'It compares every possible last coin instead of committing to the largest',
        'It sorts the coins differently',
        'It uses only the smallest coin',
        'It stops as soon as it finds any answer',
      ],
      answer: 0,
      explanation: 'For each amount, every coin choice is checked against the best answers for smaller amounts.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the running time for n coin values and a target amount A?',
      options: ['O(n × A)', 'O(A²)', 'O(2ⁿ)', 'O(n log n)'],
      answer: 0,
      explanation: 'A + 1 cells, each trying n coins.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'coinChange([2], 3);',
      options: ['-1', '1', '2', '0'],
      answer: 0,
      explanation: 'Only even amounts can be made with 2s, so dp[3] stays ∞ and the function returns −1.',
    },
  ],
  summary: [
    'Coin change finds the fewest coins for an amount when coins can be reused.',
    'dp[a] = 1 + the smallest dp[a − c] over all coins c that fit.',
    'Unreachable amounts stay at ∞.',
    'Unlike greedy, it is correct for every coin set, in O(n × amount) time.',
  ],
};

export default content;
