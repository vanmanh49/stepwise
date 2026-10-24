import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Scenario, Template } from '../model';
import { deployment, scenarioSteps, service } from './shared';

export const configmapsSecretsCode = `// kubelet, when a container starts
env.color = configMap('web-config').color     // read once, then fixed
mount('/etc/config', configMap('web-config'))  // one file per key
env.DB_PASSWORD = secret('db').password       // plain text inside the pod
if (missing) fail('CreateContainerConfigError') // retried on every sync

// kubelet sync: every 10 s here, about a minute by default
for (const pod of runningPods) refresh(pod.mountedFiles)

// kubectl rollout restart deployment web
template.annotations.restartedAt = now        // a new template: new pods`;

export const CONSUME = ['env', 'volume'];
export const RESTART = ['off', 'on'];
export const CONFIG_MAP = ['present', 'created at 30 s'];
const EDIT_AT = 22;
const RESTART_AT = 40;

export function configmapsSecretsScenario(values: Record<string, string>): Read<Scenario> {
  const consume = readChoice(values, 'consume', 'Read color as', CONSUME);
  if (!consume.ok) return consume;
  const restart = readChoice(values, 'restart', 'Rollout restart at 40 s', RESTART);
  if (!restart.ok) return restart;
  const configMap = readChoice(values, 'configMap', 'ConfigMap web-config', CONFIG_MAP);
  if (!configMap.ok) return configMap;
  const late = configMap.value !== 'present';
  const web = deployment('web', 2);
  const color: Partial<Template> =
    consume.value === 'env' ? { env: [{ name: 'color', from: { configMap: 'web-config', key: 'color' } }] } : { volumes: [{ name: 'config', configMap: 'web-config' }] };
  web.template = { ...web.template, ...color, env: [...(color.env ?? []), { name: 'DB_PASSWORD', from: { secret: 'db', key: 'password' } }] };
  const requests: Action[] = Array.from({ length: 19 }, (_, i) => ({ at: 6 + 3 * i, kind: 'request', id: `#${i + 1}`, service: 'web' }));
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: { kind: 'Secret', name: 'db', data: { password: 's3cr3t' } } },
    { at: late ? 30 : 0, kind: 'apply', object: { kind: 'ConfigMap', name: 'web-config', data: { color: 'blue' } } },
    { at: 0, kind: 'apply', object: web },
    { at: 0, kind: 'apply', object: service('web') },
    ...(late ? [] : [{ at: EDIT_AT, kind: 'edit-config' as const, name: 'web-config', key: 'color', value: 'green' }]),
    ...(restart.value === 'on' ? [{ at: RESTART_AT, kind: 'rollout-restart' as const, target: 'web' }] : []),
    ...requests,
  ];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }], actions, faults: [], until: 70 } };
}

export function configmapsSecretsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(configmapsSecretsScenario(values), "Can't run this config", {
    code: configmapsSecretsCode,
    focus: 'web',
    lines: { start: 'env.color', 'config-error': "fail('CreateContainerConfigError')", config: 'refresh(pod.mountedFiles)', route: 'env.color', action: 'template.annotations' },
    explain: (event) => {
      if (event.kind === 'action' && event.text.includes('edits ConfigMap')) {
        return { line: "mount('/etc/config'", why: 'The ConfigMap changes in the API server at once. Running pods only see it if they read it as a mounted file, and then only after the kubelet\'s next sync. Environment variables were copied when the container started and never change.' };
      }
      if (event.kind === 'action' && event.text.includes('rollout restart')) return { why: 'A rollout restart changes an annotation in the pod template. To the Deployment that is a new template, so it rolls out new pods, which read the ConfigMap afresh.' };
      if (event.kind === 'action' && event.text.includes('applies ConfigMap')) return { line: 'env.color', why: 'The ConfigMap exists now. On its next try the kubelet can read it and start the waiting containers.' };
      if (event.kind === 'action' && event.text.includes('applies Secret')) return { line: 'env.DB_PASSWORD', why: 'A Secret holds values like passwords. Kubernetes stores them base64-encoded, which anyone can decode: it is not encryption unless the cluster turns on encryption at rest.' };
      if (event.kind === 'route' && event.text.includes('answers')) return { why: 'Each pod answers with the config it reads. Watch whether the answer changes after the ConfigMap is edited.' };
      return undefined;
    },
  });
}
