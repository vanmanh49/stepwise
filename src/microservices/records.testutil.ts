import type { SimResult } from './model';

/** The records a db holds at the end of a run, from its write, append and snapshot events. */
export function finalRecords(result: SimResult, node: string, start: Record<string, string> = {}): Record<string, string> {
  const records = { ...start };
  for (const e of result.trace) {
    if (e.kind === 'append' && e.db === node) records[`e${e.seq}`] = e.event;
    if (e.kind === 'snapshot' && e.db === node) records[`snapshot @${e.seq}`] = String(e.value);
    if (e.kind !== 'write' || e.db !== node) continue;
    for (const [key, value] of Object.entries(e.records)) {
      if (value === null) delete records[key];
      else records[key] = value;
    }
  }
  return records;
}
