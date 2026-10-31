import { CONFIG_MAP, CONSUME, configmapsSecretsCode, configmapsSecretsSteps, RESTART } from '../../kubernetes/scenarios/configmaps-secrets';
import type { LessonContent } from '../../types/lesson';

const asEnv = { consume: 'env', restart: 'off', configMap: 'present' };
const asVolume = { ...asEnv, consume: 'volume' };

// Right after the edit: the ConfigMap says green, but the pods still answer blue.
const steps = configmapsSecretsSteps(asVolume);
const edited = steps.find((s) => s.title.includes('edits ConfigMap'))!;

const content: LessonContent = {
  overview:
    'Apps need settings and passwords, but baking them into the image means a rebuild for every change. A ConfigMap holds settings and a Secret holds sensitive values, both as key-value pairs that pods read when they run. This lesson changes a setting while the app is serving and shows which pods notice.',
  concept: [
    'A ConfigMap is a set of keys and values stored in the API server. Pods use it in two ways: as environment variables, or as files in a mounted volume (one file per key).',
    'Environment variables are copied when the container starts. Editing the ConfigMap later changes nothing in a running container; only a new container reads the new value.',
    'Mounted files follow the ConfigMap. The kubelet refreshes them on its periodic sync (every 10 s here; within about a minute by default), so the app sees the edit without a restart, if it re-reads the file.',
    'A Secret works the same way but is meant for passwords and keys. Its values are only base64-encoded, which anyone can decode. Limit who can read Secrets (RBAC) and turn on encryption at rest.',
    'If a pod refers to a ConfigMap or Secret that doesn\'t exist, its container can\'t start: CreateContainerConfigError for environment variables, or stuck in ContainerCreating for a missing volume. The kubelet retries until it appears.',
  ],
  howItWorks: [
    'Deployment web runs 2 pods. Each reads color from ConfigMap web-config (blue) and DB_PASSWORD from Secret db. A client sends a request every 3 s, and each pod answers with the config it sees.',
    'At 22 s, kubectl edits web-config: color=green.',
    'Read as env, the pods keep answering blue. Read as a volume, they switch to green after the kubelet\'s next sync.',
    'With rollout restart on, kubectl rollout restart at 40 s replaces the pods; the new ones read green. With the ConfigMap created at 30 s, the pods can\'t start until then: CreateContainerConfigError when it is read as env, ContainerCreating when it is a volume.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'consume', label: 'Read color as', type: 'choice', sample: asEnv.consume, options: CONSUME },
      { name: 'restart', label: 'Rollout restart at 40 s', type: 'choice', sample: asEnv.restart, options: RESTART },
      { name: 'configMap', label: 'ConfigMap web-config', type: 'choice', sample: asEnv.configMap, options: CONFIG_MAP },
    ],
    presets: [
      { label: 'Env keeps the old value', values: asEnv },
      { label: 'Volume picks up the edit', values: asVolume },
      { label: 'Rollout restart picks it up', values: { ...asEnv, restart: 'on' } },
      { label: 'Missing ConfigMap blocks the start', values: { ...asEnv, configMap: 'created at 30 s' } },
    ],
    generate: configmapsSecretsSteps,
    codeLabel: 'Pseudocode',
  },
  code: configmapsSecretsCode,
  prosCons: {
    pros: ['One image runs in every environment with different settings', 'Settings change without a rebuild', 'Mounted files can update without restarting pods'],
    cons: ['Env values need a restart to change', 'Secrets are only base64 unless encryption at rest is on', 'Apps must re-read mounted files to notice an edit'],
    useWhen: ['Settings that differ between environments, such as URLs, feature flags and log levels', 'Passwords, tokens and certificates (as Secrets)'],
    avoidWhen: ['Large files or binary data (a ConfigMap holds at most 1 MiB)', 'Values that change every second: use a database or a config service'],
  },
  applications: [
    'kubectl create configmap web-config --from-literal=color=blue',
    'kubectl rollout restart deployment web after changing env-based config',
    'Mounting TLS certificates from a Secret into an ingress controller',
  ],
  commonMistakes: [
    'Editing a ConfigMap and expecting env variables in running pods to change.',
    'Treating base64 in a Secret as encryption.',
    'Mounting with subPath, which never receives updates.',
    'Deploying a pod before its ConfigMap, then wondering why it is stuck in CreateContainerConfigError.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The pods mount web-config as a volume. kubectl has just changed color to green. What do the pods answer straight away?',
      view: edited.view,
      options: ['Still blue, until the kubelet\'s next sync refreshes the files', 'Green at once, because the mount is live', 'Nothing: each pod restarts first to read the new file', 'An error'],
      answer: 0,
      explanation: 'The API server has the new value, but each kubelet only refreshes mounted files on its sync (every 10 s here, about a minute by default).',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A pod reads color as an environment variable. How does it get the new value after the ConfigMap is edited?',
      options: ['Its container must be restarted, e.g. by kubectl rollout restart', 'On the next kubelet sync, which rewrites the variable', 'Immediately, because variables read the ConfigMap live', 'By editing the Secret too'],
      answer: 0,
      explanation: 'Environment variables are fixed when the container starts. A rollout restart gives the Deployment a new template, so new pods read the new value.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes a missing ConfigMap stop the pod from starting?',
      code: "env.color = configMap('web-config').color\nif (missing) fail('CreateContainerConfigError')\nfor (const pod of runningPods) refresh(pod.mountedFiles)",
      options: ["fail('CreateContainerConfigError')", 'refresh(pod.mountedFiles)', 'env.color = …', 'None: the pod starts anyway'],
      answer: 0,
      explanation: "The kubelet can't build the container's environment, so the pod waits in CreateContainerConfigError and retries.",
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How does Kubernetes protect the values in a Secret by default?',
      options: ['It base64-encodes them, which is not encryption', 'It encrypts them with AES', 'It hashes them', 'It hides them from every user'],
      answer: 0,
      explanation: 'Anyone who can read the Secret can decode it. Restrict access with RBAC and turn on encryption at rest.',
    },
  ],
  summary: [
    'ConfigMaps hold settings; Secrets hold sensitive values, only base64-encoded by default.',
    'Env variables are read once at container start; a rollout restart picks up changes.',
    'Mounted files follow edits after the kubelet\'s sync.',
    'A missing ConfigMap or Secret keeps the container from starting until it exists.',
  ],
};

export default content;
