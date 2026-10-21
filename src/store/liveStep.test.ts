import { beforeEach, describe, expect, it } from 'vitest';
import type { Step } from '../types/visualization';
import { useLiveStep } from './liveStep';

const step = { title: 'Compare 5 and 2', why: 'Neighbours are checked in order.', view: { kind: 'array', cells: [] } } as Step;

describe('live step store', () => {
  beforeEach(() => useLiveStep.setState(useLiveStep.getInitialState(), true));

  it('starts empty', () => {
    expect(useLiveStep.getInitialState().live).toBeUndefined();
    expect(useLiveStep.getState().live).toBeUndefined();
  });

  it('keeps the step being shown', () => {
    useLiveStep.getState().set({ step, index: 3, total: 10 });
    expect(useLiveStep.getState().live).toEqual({ step, index: 3, total: 10 });
  });

  it('clears when set to nothing', () => {
    useLiveStep.getState().set({ step, index: 0, total: 1 });
    useLiveStep.getState().set(undefined);
    expect(useLiveStep.getState().live).toBeUndefined();
  });
});
