import { refusal, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Call, Link, NodeSpec, Scenario } from '../model';
import { simulate } from '../sim';
import { emptyServicesView, traceSteps, type StepOptions } from '../steps';

/** The shared numbers every scenario starts from, unless a lesson says otherwise. */
export const LINK_MS = 5;
export const INSTANCE_MS = 10;
export const GATEWAY_MS = 2;
export const DB_MS = 3;

export const client = (extra: Partial<Extract<NodeSpec, { type: 'client' }>> = {}): NodeSpec => ({ id: 'client', label: 'client', type: 'client', column: 0, ...extra });

export function service(id: string, column: number, calls: (string | Call)[] = [], options: { count?: number; processMs?: number; parallel?: boolean } = {}): NodeSpec {
  const { count = 1, processMs = INSTANCE_MS, parallel = false } = options;
  return {
    id,
    label: id,
    type: 'service',
    column,
    instances: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i + 1}`, processMs })),
    calls: calls.map((c) => (typeof c === 'string' ? { to: c } : c)),
    parallel,
  };
}

export const db = (id: string, column: number, columns: string[] = []): NodeSpec => ({ id, label: id, type: 'db', column, processMs: DB_MS, columns });

export const link = (from: string, to: string, latencyMs = LINK_MS): Link => ({ from, to, latencyMs });

/** Runs a scenario into steps, or explains in one step why the settings can't run. */
export function scenarioSteps(read: Read<Scenario>, refusalTitle: string, options: StepOptions): Step[] {
  if (!read.ok) return refusal(refusalTitle, read.why, emptyServicesView());
  return traceSteps(read.value, simulate(read.value), options);
}
