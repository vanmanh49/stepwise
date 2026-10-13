import type { Step, View } from '../types/visualization';

export const MAX_LINEAR_ITEMS = 10;

/** Result for an operation that cannot run: one explanatory step, state untouched. */
export function refuse(
  state: number[],
  view: View,
  title: string,
  why: string,
  codeLine: number,
): { steps: Step[]; state: number[] } {
  return { steps: [{ title, why, codeLine, view }], state };
}

export function isFull(state: number[]): boolean {
  return state.length >= MAX_LINEAR_ITEMS;
}

export const FULL_WHY = `This visualization holds at most ${MAX_LINEAR_ITEMS} items so every step stays readable. Remove something first.`;
