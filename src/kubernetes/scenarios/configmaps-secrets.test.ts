import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { configmapsSecretsScenario, configmapsSecretsSteps } from './configmaps-secrets';

const env = { consume: 'env', restart: 'off', configMap: 'present' };
const run = (values: Partial<typeof env>) => {
  const read = configmapsSecretsScenario({ ...env, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
/** The color each answered request saw, with the time it was sent. */
const answers = (values: Partial<typeof env>) =>
  run(values).frames.flatMap((f) => (f.event.kind === 'route' && f.event.text.includes('answers') ? [{ t: f.event.t, green: f.event.text.includes('color=green') }] : []));

describe('ConfigMaps & Secrets', () => {
  it('keeps answering with the old value when config comes from env', () => {
    const all = answers({});
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((a) => !a.green)).toBe(true);
  });

  it('picks up the edit after the next kubelet sync when the ConfigMap is a volume', () => {
    const all = answers({ consume: 'volume' });
    expect(all.filter((a) => a.t < 22).every((a) => !a.green)).toBe(true);
    expect(all.filter((a) => a.t >= 33).every((a) => a.green)).toBe(true);
  });

  it('picks up the edit through a rollout restart when config comes from env', () => {
    const all = answers({ restart: 'on' });
    expect(all.filter((a) => a.t < 40).every((a) => !a.green)).toBe(true);
    expect(all.at(-1)!.green).toBe(true);
  });

  it("holds the pods until the ConfigMap exists, and the Service has nowhere to send requests", () => {
    const { frames } = run({ configMap: 'created at 30 s' });
    expect(frames.some((f) => f.state.pods.some((p) => p.phase === 'CreateContainerConfigError'))).toBe(true);
    const early = frames.filter((f) => f.event.t < 30 && (f.event.kind === 'route' || f.event.kind === 'request-fail'));
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((f) => f.event.kind === 'request-fail')).toBe(true);
    expect(frames.some((f) => f.event.t > 30 && f.event.kind === 'route')).toBe(true);
  });

  it('shows the Secret as base64, not encrypted', () => {
    const view = configmapsSecretsSteps(env).at(-1)!.view as import('../../types/visualization').ClusterView;
    expect(view.objects.find((o) => o.kind === 'Secret')!.note).toContain('(base64, not encrypted)');
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ consume: 'file' }, { restart: 'maybe' }, { configMap: 'later' }]) {
      const steps = configmapsSecretsSteps({ ...env, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this config");
    }
  });
});
