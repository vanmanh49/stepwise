import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { operatorsCrdsScenario, operatorsCrdsSteps } from './operators-crds';

const base = { crd: 'installed', change: 'nothing', backup: 'on', handEdit: 'off', outage: 'off' };
const run = (values: Partial<typeof base>) => {
  const read = operatorsCrdsScenario({ ...base, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const dbPods = (state: Frame['state']) => state.pods.filter((p) => p.ownerKind === 'StatefulSet');

describe('Operators & CRDs', () => {
  it('turns a Database into a Secret, a Service and a 3-pod StatefulSet', () => {
    const { final } = run({});
    expect(final!.secrets.map((s) => s.name)).toEqual(['db-credentials']);
    expect(final!.services.map((s) => s.name)).toEqual(['db']);
    expect(dbPods(final!).map((p) => p.name)).toEqual(['db-0', 'db-1', 'db-2']);
    expect(final!.databases[0]!.status).toMatchObject({ phase: 'Ready', version: 15 });
  });

  it('refuses the Database without its CRD, so nothing is built', () => {
    const { frames, final } = run({ crd: 'missing' });
    expect(frames.some((f) => f.event.kind === 'refuse-write')).toBe(true);
    expect(final!.statefulSets).toEqual([]);
  });

  it('puts a hand-scaled StatefulSet back', () => {
    const { frames, final } = run({ handEdit: 'on' });
    expect(frames.some((f) => f.event.text.includes('sets it back to 3'))).toBe(true);
    expect(final!.statefulSets[0]!.replicas).toBe(3);
  });

  it('scales the database when the Database asks for 5', () => {
    expect(dbPods(run({ change: 'replicas 3 → 5' }).final!)).toHaveLength(5);
  });

  it('backs up first, then upgrades', () => {
    const { frames, final } = run({ change: 'version 15 → 16' });
    const backedUp = frames.find((f) => f.state.jobs.some((j) => j.status.condition === 'Complete'))!.event.t;
    const firstNew = frames.find((f) => dbPods(f.state).some((p) => p.image === 'postgres:16'))!.event.t;
    expect(firstNew).toBeGreaterThan(backedUp);
    expect(final!.databases[0]!.status).toMatchObject({ phase: 'Ready', version: 16 });
  });

  it('upgrades without a Job when backup is off', () => {
    expect(run({ change: 'version 15 → 16', backup: 'off' }).final!.jobs).toEqual([]);
  });

  it('changes nothing while the operator is down, then catches up', () => {
    const { frames } = run({ change: 'replicas 3 → 5', outage: 'on' });
    expect(frames.find((f) => f.state.statefulSets[0]?.replicas === 5)!.event.t).toBeGreaterThan(120);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ crd: 'maybe' }, { change: 'delete' }, { outage: 'long' }]) {
      const steps = operatorsCrdsSteps({ ...base, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this operator");
    }
  });
});

describe('Operators & CRDs: status and narration', () => {
  it('scales for a spec change instead of calling it a hand edit', () => {
    const { frames } = run({ change: 'replicas 3 → 5', outage: 'on' });
    expect(frames.some((f) => f.event.text.includes('sets it back'))).toBe(false);
    expect(frames.some((f) => f.event.by === 'operator' && f.event.text.includes('scales StatefulSet db to 5'))).toBe(true);
  });

  it('keeps the Database status through kubectl apply, and reports v15 Upgrading until every pod runs v16', () => {
    const { frames, final } = run({ change: 'version 15 → 16' });
    const allNew = frames.findIndex((f) => dbPods(f.state).length === 3 && dbPods(f.state).every((p) => p.image === 'postgres:16' && p.ready));
    for (const f of frames.slice(0, allNew)) {
      const status = f.state.databases[0]?.status;
      if (status) expect(status.version).toBe(15);
    }
    const phases = frames.filter((f) => f.event.t > 90).map((f) => f.state.databases[0]?.status?.phase);
    const firstUpgrade = phases.indexOf('Upgrading');
    expect(firstUpgrade).toBeGreaterThan(-1);
    expect(phases.slice(firstUpgrade).includes('Creating')).toBe(false);
    expect(final!.databases[0]!.status).toMatchObject({ phase: 'Ready', version: 16 });
  });

  it("writes data to the database's volumes", () => {
    expect(run({}).final!.volumes.every((v) => v.records > 0)).toBe(true);
  });
});
