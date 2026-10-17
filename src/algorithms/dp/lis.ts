import type { Step } from '../../types/visualization';
import { at, tableGrid, type Mark } from './table';

export const lisCode = `function lis(arr: number[]): number[] {
  const length = arr.map(() => 1); // each value alone is a run of 1
  const from = arr.map(() => -1);
  for (let i = 1; i < arr.length; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[j] < arr[i] && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1; // extend the run ending at j
        from[i] = j;
      }
    }
  }
  return rebuild(arr, length, from); // follow from[] back from the longest
}`;

const LINE = { init: 2, extend: 7, none: 5, rebuild: 12 };

function solve(values: number[]): { length: number[]; from: number[] } {
  const length = values.map(() => 1);
  const from = values.map(() => -1);
  for (let i = 1; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j]! < values[i]! && length[j]! + 1 > length[i]!) {
        length[i] = length[j]! + 1;
        from[i] = j;
      }
    }
  }
  return { length, from };
}

/** Indexes of one longest run, ending at the first position with the maximum length. */
function chain(length: number[], from: number[]): number[] {
  if (length.length === 0) return [];
  const best = Math.max(...length);
  const indexes: number[] = [];
  for (let i = length.indexOf(best); i !== -1; i = from[i]!) indexes.unshift(i);
  return indexes;
}

export function lis(values: number[]): number[] {
  const { length, from } = solve(values);
  return chain(length, from).map((i) => values[i]!);
}

export function lisSteps(values: number[]): Step[] {
  const { length, from } = solve(values);
  const shownLength: (number | undefined)[] = values.map(() => 1);
  const shownFrom: (number | string | undefined)[] = values.map(() => '—');
  const grid = (marks: Mark = {}, arrows: { from: [number, number]; to: [number, number] }[] = []) =>
    tableGrid([values, shownLength, shownFrom], {
      rowLabels: ['value', 'length', 'from'],
      colLabels: values.map((_, i) => String(i)),
      marks,
      arrows,
    });

  const steps: Step[] = [
    {
      title: 'Every value alone is an increasing run of length 1',
      why: 'length[i] will be the length of the longest strictly increasing subsequence that ends at position i, and from[i] the position before it in that subsequence.',
      next: 'Work out each position from the ones before it.',
      codeLine: LINE.init,
      view: grid(),
    },
  ];

  for (let i = 1; i < values.length; i++) {
    const smaller = values.flatMap((v, j) => (j < i && v < values[i]! ? [j] : []));
    shownLength[i] = length[i];
    shownFrom[i] = from[i] === -1 ? '—' : from[i];
    const marks: Mark = { [at(0, i)]: 'active', [at(1, i)]: 'active' };
    for (const j of smaller) marks[at(1, j)] = 'compare';
    steps.push(
      smaller.length > 0
        ? {
            title: `length[${i}] = ${length[i]}: ${values[i]} extends the run ending at position ${from[i]}`,
            why: `Earlier values smaller than ${values[i]}: ${smaller.map((j) => `${values[j]} (length ${length[j]})`).join(', ')}. The longest of those runs is ${length[i]! - 1}, and ${values[i]} adds one more.`,
            codeLine: LINE.extend,
            variables: { i, 'length[i]': length[i]! },
            view: grid(marks, [{ from: [1, from[i]!], to: [1, i] }]),
          }
        : {
            title: `length[${i}] = 1: nothing before ${values[i]} is smaller`,
            why: `No earlier value is smaller than ${values[i]}, so the longest increasing run ending here is ${values[i]} alone.`,
            codeLine: LINE.none,
            variables: { i },
            view: grid(marks),
          },
    );
  }

  const indexes = chain(length, from);
  const result = indexes.map((i) => values[i]!);
  const marks: Mark = {};
  for (const i of indexes) {
    marks[at(0, i)] = 'found';
    marks[at(1, i)] = 'found';
  }
  steps.push({
    title: `Longest increasing subsequence: ${result.join(', ')} (length ${result.length})`,
    why: `The largest length is ${result.length}, first reached at position ${indexes[indexes.length - 1]}. Following "from" back from there gives the values in reverse.`,
    codeLine: LINE.rebuild,
    variables: { length: result.length },
    view: grid(marks),
  });
  return steps;
}
