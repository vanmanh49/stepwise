import { AMOUNTS, deploymentsRollingUpdatesCode, deploymentsRollingUpdatesSteps, IMAGES, ROLLBACK } from '../../kubernetes/scenarios/deployments-rolling-updates';
import type { LessonContent } from '../../types/lesson';

const base = { replicas: '4', surge: '25%', unavailable: '25%', image: 'good', rollback: 'off' };
const bad = { ...base, image: 'bad' };

// The bad-image rollout has just started failing to pull: v1 still has 3 ready pods.
const badSteps = deploymentsRollingUpdatesSteps(bad);
const firstFail = badSteps.findIndex((s) => s.title.includes("can't pull"));
const stalled = badSteps[firstFail]!;

const content: LessonContent = {
  overview:
    'A Deployment rolls out a new version of your pods without stopping the service. This lesson changes the image of a running Deployment and watches it move pods from the old ReplicaSet to a new one, a few at a time. Then it ships a broken image and rolls it back.',
  concept: [
    'A Deployment manages ReplicaSets for you: one per version of the pod template. Changing the template (for example the image) creates a new ReplicaSet.',
    'A rolling update grows the new ReplicaSet and shrinks the old one in small steps. maxSurge says how many pods may exist above the desired count; maxUnavailable says how many may be missing from the ready count.',
    'Percentages are rounded the safe way: maxSurge up, maxUnavailable down. With 4 replicas, 25% / 25% means at most 5 pods in total and at least 3 ready.',
    'If the new pods never become ready, the rollout stops where it is: the old pods keep serving. kubectl rollout undo puts the previous template back, and its ReplicaSet scales up again.',
  ],
  howItWorks: [
    'kubectl applies a Deployment named web with app:v1. It creates a ReplicaSet and the pods.',
    'At 15 s, kubectl sets the image to app:v2 (or to app:v2-typo, which doesn\'t exist).',
    'The Deployment creates a new ReplicaSet and scales it up as far as maxSurge allows, then scales the old one down as far as maxUnavailable allows, step by step, as new pods become ready.',
    'With the bad image, the new pods can\'t pull it, never become ready, and the rollout stalls with v1 still serving.',
    'With rollback on, kubectl rolls back at 60 s and v1 returns to full strength. The run stops at 150 s.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'replicas', label: 'Replicas', type: 'number', sample: base.replicas, help: 'From 2 to 6.' },
      { name: 'surge', label: 'maxSurge', type: 'choice', sample: base.surge, options: AMOUNTS, help: 'Extra pods allowed during the rollout.' },
      { name: 'unavailable', label: 'maxUnavailable', type: 'choice', sample: base.unavailable, options: AMOUNTS, help: 'Ready pods that may be missing.' },
      { name: 'image', label: 'New image', type: 'choice', sample: base.image, options: IMAGES, help: 'bad = a typo in the image name.' },
      { name: 'rollback', label: 'Roll back at 60 s', type: 'choice', sample: base.rollback, options: ROLLBACK },
    ],
    presets: [
      { label: 'Default 25% / 25%', values: base },
      { label: 'Surge 1, unavailable 0', values: { ...base, surge: '1', unavailable: '0' } },
      { label: 'Surge 0, unavailable 1', values: { ...base, surge: '0', unavailable: '1' } },
      { label: 'Bad image stalls', values: bad },
      { label: 'Bad image, then rollback', values: { ...bad, rollback: 'on' } },
    ],
    generate: deploymentsRollingUpdatesSteps,
    codeLabel: 'Pseudocode',
  },
  code: deploymentsRollingUpdatesCode,
  prosCons: {
    pros: ['New versions go out with no downtime', 'A broken version stalls instead of replacing every healthy pod', 'Old ReplicaSets are kept, so rolling back is one command'],
    cons: ['Old and new versions serve traffic at the same time during the rollout', 'maxSurge needs spare capacity on the nodes', 'A version that is ready but wrong (bad logic) still rolls out: readiness only checks what you tell it to'],
    useWhen: ['Stateless services that can run two versions side by side'],
    avoidWhen: ['The two versions can\'t run together (for example an incompatible database change): use the Recreate strategy or a migration plan'],
  },
  applications: [
    'kubectl set image or a new manifest from CI starts a rolling update',
    'kubectl rollout status waits for a rollout; kubectl rollout undo reverts it',
    'Tools such as Argo Rollouts build canary and blue-green releases on the same idea',
  ],
  commonMistakes: [
    'Setting maxSurge and maxUnavailable both to 0: the rollout can never make progress.',
    'Using maxUnavailable 0 on a full cluster: the extra pod has nowhere to go, so the rollout waits.',
    'Watching only the Deployment\'s status and missing that new pods are stuck in ImagePullBackOff.',
    'Expecting a rollback to restore data: it only changes which pod template runs.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The new image can\'t be pulled, so the 2 new pods are never ready. maxUnavailable lets 1 of 4 be missing. What happens to the 3 ready v1 pods?',
      view: stalled.view,
      options: ['They keep running: the rollout stalls', 'They are deleted one by one anyway', 'They are restarted with the new image', 'The Deployment deletes the broken ReplicaSet by itself'],
      answer: 0,
      explanation: 'Removing another v1 pod would leave only 2 ready, below replicas − maxUnavailable = 3. The rollout waits, and v1 keeps serving.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'replicas 4, maxSurge 25%, maxUnavailable 25%. What are the limits during the rollout?',
      options: ['At most 5 pods in total, at least 3 ready', 'At most 4 pods, at least 4 ready', 'At most 8 pods, at least 0 ready', 'At most 6 pods, at least 2 ready'],
      answer: 0,
      explanation: '25% of 4 is 1. maxSurge rounds up (4 + 1 = 5) and maxUnavailable rounds down (4 − 1 = 3).',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops the old ReplicaSet from shrinking too fast?',
      code: 'newRS.replicas += min(replicas - newRS.replicas, maxTotal - total)\noldRS.replicas -= min(oldRS.replicas, total - minReady - newNotReady)',
      options: ['The oldRS line: it never goes below minReady ready pods', 'The newRS line', 'Both lines equally', 'Neither: the old ReplicaSet is deleted at once'],
      answer: 0,
      explanation: 'The old set only shrinks by as much as keeps minReady pods ready, not counting new pods that aren\'t ready yet.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does kubectl rollout undo do here?',
      options: ['Puts the previous pod template back, so the old ReplicaSet scales up again', 'Deletes the Deployment', 'Restarts every pod with the same image', 'Downloads the old image into the new ReplicaSet'],
      answer: 0,
      explanation: 'The Deployment kept the old ReplicaSet at 0 replicas. Undo makes its template current again, so it grows back and the broken one shrinks.',
    },
  ],
  summary: [
    'A Deployment manages one ReplicaSet per pod template and rolls pods from old to new.',
    'maxSurge caps the total pods; maxUnavailable caps how many ready pods may be missing.',
    'If new pods never become ready, the rollout stalls and old pods keep serving.',
    'kubectl rollout undo brings the previous template, and its ReplicaSet, back.',
  ],
};

export default content;
