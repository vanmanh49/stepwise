import type { Step } from '../../types/visualization';
import { readInt, readInts, refusal } from '../form';
import { at, tableGrid, type Mark } from './table';

export const coinChangeCode = `function coinChange(coins: number[], amount: number): number {
  const dp = new Array(amount + 1).fill(Infinity); // fewest coins for each amount
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a && dp[a - coin] + 1 < dp[a]) {
        dp[a] = dp[a - coin] + 1; // use coin last
      }
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}`;

const LINE = { init: 3, fill: 7, none: 6, done: 11 };

function solve(coins: number[], amount: number): { dp: number[]; last: (number | undefined)[] } {
  const dp = new Array<number>(amount + 1).fill(Infinity);
  const last: (number | undefined)[] = [];
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a && dp[a - coin]! + 1 < dp[a]!) {
        dp[a] = dp[a - coin]! + 1;
        last[a] = coin;
      }
    }
  }
  return { dp, last };
}

export function coinChange(coins: number[], amount: number): number | null {
  const best = solve(coins, amount).dp[amount]!;
  return best === Infinity ? null : best;
}

const show = (n: number) => (n === Infinity ? '∞' : n);

export function coinChangeSteps(input: Record<string, string>): Step[] {
  const empty = tableGrid([]);
  const coinsRead = readInts(input, 'coins', 'Coins', { min: 1, max: 5 }, { min: 1, max: 25 });
  if (!coinsRead.ok) return refusal('Check the coins', coinsRead.why, empty);
  const amountRead = readInt(input, 'amount', 'Amount', { min: 0, max: 20 });
  if (!amountRead.ok) return refusal('Check the amount', amountRead.why, empty);
  const coins = [...new Set(coinsRead.value)].sort((a, b) => a - b);
  const amount = amountRead.value;

  const { dp, last } = solve(coins, amount);
  const shown: (number | string | undefined)[] = dp.map((_, a) => (a === 0 ? 0 : '∞'));
  const colLabels = Array.from({ length: amount + 1 }, (_, a) => String(a));
  const grid = (marks: Mark = {}, arrows: { from: [number, number]; to: [number, number] }[] = []) =>
    tableGrid([shown], { rowLabels: ['coins'], colLabels, marks, arrows });

  const steps: Step[] = [
    {
      title: 'Amount 0 needs 0 coins',
      why: `dp[a] will hold the fewest coins that add up to a. Paying 0 takes no coins; every other amount starts at ∞, meaning "not possible yet". Coins: ${coins.join(', ')}.`,
      next: 'Fill the amounts from 1 upward.',
      codeLine: LINE.init,
      variables: { amount },
      view: grid(),
    },
  ];

  for (let a = 1; a <= amount; a++) {
    const options = coins.filter((c) => c <= a && dp[a - c] !== Infinity);
    shown[a] = show(dp[a]!);
    const marks: Mark = { [at(0, a)]: options.length > 0 ? 'active' : 'discarded' };
    for (const c of options) marks[at(0, a - c)] = 'compare';
    const arrows = options.map((c) => ({ from: [0, a - c] as [number, number], to: [0, a] as [number, number] }));
    steps.push(
      options.length > 0
        ? {
            title: `dp[${a}] = ${dp[a]} (last coin ${last[a]})`,
            why: `If the last coin is c, the rest is dp[${a} − c]. Options: ${options.map((c) => `${c} → dp[${a - c}] + 1 = ${dp[a - c]! + 1}`).join(', ')}. The smallest is ${dp[a]}.`,
            codeLine: LINE.fill,
            variables: { a, 'dp[a]': dp[a]! },
            view: grid(marks, arrows),
          }
        : {
            title: `dp[${a}] stays ∞`,
            why: `No coin leads from a reachable smaller amount to ${a}, so ${a} cannot be paid with these coins.`,
            codeLine: LINE.none,
            variables: { a },
            view: grid(marks),
          },
    );
  }

  const best = dp[amount]!;
  if (best === Infinity) {
    steps.push({
      title: `Paying ${amount} is impossible`,
      why: `dp[${amount}] is still ∞: no combination of ${coins.join(', ')} adds up to ${amount}. The code returns −1 to say so.`,
      codeLine: LINE.done,
      view: grid({ [at(0, amount)]: 'discarded' }),
    });
    return steps;
  }
  const used: number[] = [];
  const marks: Mark = {};
  for (let a = amount; a > 0; a -= last[a]!) {
    used.push(last[a]!);
    marks[at(0, a)] = 'found';
  }
  marks[at(0, 0)] = 'found';
  steps.push({
    title: `${amount} needs ${best} coin${best === 1 ? '' : 's'}: ${used.join(' + ') || 'none'}`,
    why: `Following the last coin of each amount back from ${amount} to 0 gives the coins used. Every combination was compared through the table, so no answer uses fewer coins.`,
    codeLine: LINE.done,
    variables: { coins: best },
    view: grid(marks),
  });
  return steps;
}
