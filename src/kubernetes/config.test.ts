import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf } from './fixtures.testutil';
import { CONFIG_SYNC_S, type Action, type ConfigMap, type Frame, type Scenario, type Template } from './model';
import { simulate } from './sim';

const config = (color = 'blue'): ConfigMap => ({ kind: 'ConfigMap', name: 'web-config', data: { color } });
const asEnv: Partial<Template> = { env: [{ name: 'color', from: { configMap: 'web-config', key: 'color' } }] };
const asVolume: Partial<Template> = { volumes: [{ name: 'config', configMap: 'web-config' }] };

function web(extra: Partial<Template>) {
  const d = deploymentOf('web', 1);
  d.template = { ...d.template, ...extra };
  return d;
}

const run = (consume: Partial<Template>, actions: Action[], configAt = 0): Scenario => ({
  nodes: nodesOf(1),
  actions: [{ at: configAt, kind: 'apply', object: config() }, { at: 0, kind: 'apply', object: web(consume) }, { at: 20, kind: 'edit-config', name: 'web-config', key: 'color', value: 'green' }, ...actions],
  faults: [],
});
const colorAt = (frames: Frame[], t: number) => frames.filter((f) => f.event.t <= t).at(-1)!.state.pods.map((p) => p.config?.color);

describe('ConfigMaps and Secrets', () => {
  it('freezes env values when the container starts', () => {
    const { frames } = simulate(run(asEnv, [{ at: 60, kind: 'request', id: '#1', service: 'web' }, { at: 0, kind: 'apply', object: { kind: 'Service', name: 'web', selector: [{ key: 'app', op: '=', values: ['web'] }] } }]));
    expect(colorAt(frames, 60)).toEqual(['blue']);
    expect(frames.at(-1)!.state.requests[0]!.body).toBe('color=blue');
  });

  it('refreshes a mounted ConfigMap on the next sync', () => {
    const { frames } = simulate(run(asVolume, [{ at: 60, kind: 'request', id: '#1', service: 'web' }]));
    const refreshed = frames.find((f) => f.event.kind === 'config' && f.state.pods[0]?.config?.color === 'green')!;
    expect(refreshed.event.t).toBeGreaterThanOrEqual(20);
    expect(refreshed.event.t).toBeLessThanOrEqual(20 + CONFIG_SYNC_S);
  });

  it('holds a pod in CreateContainerConfigError until its ConfigMap exists', () => {
    const { frames } = simulate(run(asEnv, [], 30));
    const stuck = frames.find((f) => f.state.pods[0]?.phase === 'CreateContainerConfigError')!;
    expect(stuck.state.pods[0]!.reason).toBe('configmap "web-config" not found');
    expect(frames.filter((f) => f.event.kind === 'config-error')).toHaveLength(1);
    const running = frames.find((f) => f.state.pods[0]?.phase === 'Running')!;
    expect(running.event.t).toBeGreaterThan(30);
    expect(running.event.t).toBeLessThanOrEqual(30 + CONFIG_SYNC_S + 1);
  });

  it('waits in ContainerCreating when a mounted ConfigMap is missing', () => {
    const { frames } = simulate(run(asVolume, [], 30));
    const stuck = frames.find((f) => f.event.kind === 'config-error')!;
    expect(stuck.state.pods[0]!.phase).toBe('ContainerCreating');
    expect(stuck.state.pods[0]!.reason).toBe('MountVolume.SetUp failed for volume "config": configmap "web-config" not found');
  });

  it('names the Secret whose key is missing', () => {
    const d = web({ env: [{ name: 'password', from: { secret: 'db', key: 'password' } }] });
    const { frames } = simulate({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: { kind: 'Secret', name: 'db', data: { user: 'app' } } }, { at: 0, kind: 'apply', object: d }], faults: [], until: 40 });
    expect(frames.find((f) => f.event.kind === 'config-error')!.state.pods[0]!.reason).toBe("couldn't find key password in Secret db");
  });

  it('picks up an env change after a rollout restart', () => {
    const { frames } = simulate(run(asEnv, [{ at: 40, kind: 'rollout-restart', target: 'web' }]));
    const pods = frames.at(-1)!.state.pods;
    expect(pods.map((p) => p.config?.color)).toEqual(['green']);
  });
});
