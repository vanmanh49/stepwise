import type { Change } from './controllers/types';
import type { Fault } from './model';
import type { Store } from './store';

/** Timed work the kubelet and node lifecycle schedule for themselves. */
export type Timer =
  | { kind: 'kubelet'; step: 'pull' | 'pulled' | 'started' | 'ready' | 'exit' | 'restart'; pod: string; gen: number }
  | { kind: 'evict'; node: string }
  | { kind: 'evict-retry'; pod: string; by: 'kubectl' | 'controllers' }
  | { kind: 'noexecute'; pod: string; node: string };

/** What the kubelet and node lifecycle get from the simulator. */
export interface Env {
  store: Store;
  now(): number;
  /** Writes the change (if it has a write) and records its frame; false when the write was refused. */
  apply(change: Change): boolean;
  later(delayS: number, timer: Timer): void;
  /** Nodes that are really down. */
  offline: Set<string>;
  /** When etcd or the controller manager last came back: heartbeats missed while they were down don't count. */
  recoveredAt(): number;
  faults: Fault[];
}
