import type { Env } from './env';
import type { Pod } from './model';
import type { Store } from './store';

type Resolved = { ok: true; env: Record<string, string>; mounted: Record<string, string> } | { ok: false; reason: string; mount: boolean };

/** What a container would read from its ConfigMaps and Secrets if it started now, or why it can't start. */
export function resolveConfig(store: Store, pod: Pod): Resolved {
  const env: Record<string, string> = {};
  for (const { name, from } of pod.env ?? []) {
    const [kind, source] = 'configMap' in from ? (['ConfigMap', from.configMap] as const) : (['Secret', from.secret] as const);
    const object = store.get(kind, source);
    if (!object) return { ok: false, reason: `${kind.toLowerCase()} "${source}" not found`, mount: false };
    const value = object.data[from.key];
    if (value === undefined) return { ok: false, reason: `couldn't find key ${from.key} in ${kind} ${source}`, mount: false };
    // A Secret's value reaches the container but is never shown: the app doesn't hand its password out.
    if (kind === 'ConfigMap') env[name] = value;
  }
  const mounted = mountedConfig(store, pod);
  if (!mounted.ok) return mounted;
  return { ok: true, env, mounted: mounted.data };
}

function mountedConfig(store: Store, pod: Pod): { ok: true; data: Record<string, string> } | { ok: false; reason: string; mount: true } {
  const data: Record<string, string> = {};
  for (const volume of pod.volumes ?? []) {
    if (!('configMap' in volume)) continue;
    const cm = store.get('ConfigMap', volume.configMap);
    if (!cm) return { ok: false, reason: `MountVolume.SetUp failed for volume "${volume.name}": configmap "${volume.configMap}" not found`, mount: true };
    Object.assign(data, cm.data);
  }
  return { ok: true, data };
}

const format = (config: Record<string, string>) =>
  Object.entries(config)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

/** The kubelet's sync: running pods see the current contents of their mounted ConfigMaps. Env values stay as they were. */
export function configSync(env: Env) {
  for (const pod of env.store.list('Pod')) {
    if (pod.phase !== 'Running' || !pod.node || env.offline.has(pod.node) || !pod.volumes?.some((v) => 'configMap' in v)) continue;
    const mounted = mountedConfig(env.store, pod);
    if (!mounted.ok) continue;
    const config = { ...pod.config, ...mounted.data };
    if (format(config) === format(pod.config ?? {})) continue;
    env.apply({
      write: { op: 'update', object: { ...pod, config } },
      event: { kind: 'config', by: 'kubelet', node: pod.node, subjects: [pod.name], text: `kubelet refreshes ${pod.name}'s mounted config: ${format(mounted.data)}` },
    });
  }
}

/** What a pod answers a request with: the config it reads, when it has any. */
export const answerOf = (pod: Pod | undefined) => (pod?.config && Object.keys(pod.config).length > 0 ? format(pod.config) : undefined);
