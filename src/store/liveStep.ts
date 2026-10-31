import { create } from 'zustand';
import type { Step } from '../types/visualization';

interface LiveStep {
  step: Step;
  index: number;
  total: number;
}

/**
 * The step the lesson's visualization is showing. Kept outside LessonPage's state so a new step
 * re-renders only the "Now running" panel, not every section of the page.
 */
export const useLiveStep = create<{ live?: LiveStep; set(live?: LiveStep): void }>((set) => ({
  live: undefined,
  set: (live) => set({ live }),
}));
