import type { TraceEvent } from '../model';
import type { Store, Write } from '../store';

export interface Ctx {
  now: number;
  store: Store;
  rng: () => number;
}

/** A write with its narration; a change without a write is a note (a reconcile that found nothing to do). */
export interface Change {
  write?: Write;
  event: Omit<TraceEvent, 't'>;
}

/** Level-triggered: reads the whole current state and returns what to change, never mutating the store itself. */
export type Reconcile = (ctx: Ctx) => Change[];
