import type { ArrayView, Cell, Role, Step } from '../../types/visualization';
import { readInt, readInts, refusal } from '../form';

export const greedyCoinsCode = `function greedyCoins(coins: number[], amount: number): number[] | null {
  const sorted = [...coins].sort((a, b) => b - a); // largest first
  const taken: number[] = [];
  let remaining = amount;
  for (const coin of sorted) {
    while (coin <= remaining) {
      taken.push(coin); // take the biggest coin that fits
      remaining -= coin;
    }
  }
  return remaining === 0 ? taken : null; // stuck if anything is left
}`;

export function greedyCoins(coins: number[], amount: number): number[] | null {
  const sorted = coins.toSorted((a, b) => b - a);
  const taken: number[] = [];
  let remaining = amount;
  for (const coin of sorted) {
    while (coin <= remaining) {
      taken.push(coin);
      remaining -= coin;
    }
  }
  return remaining === 0 ? taken : null;
}

function view(coins: number[], roles: Record<number, Role>, taken: number[], total: number): ArrayView {
  const cells: Cell[] = coins.map((value, i) => ({ id: `coin${i}`, value, role: roles[i] ?? 'default' }));
  return {
    kind: 'array',
    cells,
    aux: { label: `taken: ${taken.length} coin${taken.length === 1 ? '' : 's'}, total ${total}`, cells: taken.map((value, i) => ({ id: `t${i}`, value, role: 'found' })) },
  };
}

export function greedyCoinsSteps(values: Record<string, string>): Step[] {
  const coinsRead = readInts(values, 'coins', 'Coins', { min: 1, max: 6 }, { min: 1, max: 100 });
  const amountRead = readInt(values, 'amount', 'Amount', { min: 1, max: 200 });
  const empty: ArrayView = { kind: 'array', cells: [] };
  if (!coinsRead.ok) return refusal('Check the coins', coinsRead.why, empty);
  if (!amountRead.ok) return refusal('Check the amount', amountRead.why, empty);

  const coins = coinsRead.value.toSorted((a, b) => b - a);
  const amount = amountRead.value;
  const taken: number[] = [];
  let remaining = amount;
  const total = () => amount - remaining;
  const steps: Step[] = [
    {
      title: `Make ${amount} from coins ${coins.join(', ')}`,
      why: 'A greedy algorithm makes the choice that looks best right now and never revisits it. Here that means: always take the largest coin that still fits.',
      next: `Start with the largest coin, ${coins[0]}.`,
      codeLine: 2,
      variables: { remaining },
      view: view(coins, {}, taken, total()),
    },
  ];

  coins.forEach((coin, i) => {
    const done = Object.fromEntries(coins.slice(0, i).map((_, j) => [j, 'discarded' as Role]));
    while (coin <= remaining) {
      taken.push(coin);
      remaining -= coin;
      steps.push({
        title: `Take ${coin}`,
        why: `${coin} is the largest coin that is not more than the ${remaining + coin} still to pay.`,
        codeLine: 7,
        variables: { coin, remaining },
        view: view(coins, { ...done, [i]: 'active' }, taken, total()),
      });
    }
    if (remaining > 0) {
      steps.push({
        title: `${coin} is too big for the ${remaining} left`,
        why: `Taking ${coin} would pay more than ${remaining}. Move on to the next smaller coin.`,
        codeLine: 6,
        variables: { coin, remaining },
        view: view(coins, { ...done, [i]: 'discarded' }, taken, total()),
      });
    }
  });

  const allDone = Object.fromEntries(coins.map((_, j) => [j, 'discarded' as Role]));
  steps.push(
    remaining === 0
      ? {
          title: `Paid ${amount} with ${taken.length} coin${taken.length === 1 ? '' : 's'}`,
          why: 'The greedy choices added up exactly. With coin systems like 25, 10, 5, 1 this is also the fewest coins possible, but that is not true for every coin system.',
          codeLine: 11,
          variables: { coins: taken.length },
          view: view(coins, allDone, taken, total()),
        }
      : {
          title: `Stuck with ${remaining} left to pay`,
          why: 'Every coin is too big for what is left, and greedy never undoes an earlier choice, so it cannot finish even if a different combination would work.',
          codeLine: 11,
          variables: { remaining },
          view: view(coins, allDone, taken, total()),
        },
  );
  return steps;
}
