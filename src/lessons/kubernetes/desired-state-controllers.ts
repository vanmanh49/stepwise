import { desiredStateControllersCode, desiredStateControllersSteps, OUTAGE } from '../../kubernetes/scenarios/desired-state-controllers';
import type { LessonContent } from '../../types/lesson';

const one = { desired: '3', deleted: '1', outage: 'off' };
const outage = { desired: '3', deleted: '3', outage: 'on' };

// All three pods are gone and the controller manager is still down.
const steps = desiredStateControllersSteps(outage);
const beforeReturn = steps[steps.findIndex((s) => s.title === 'The controller manager is back') - 1]!;

const content: LessonContent = {
  overview:
    'Kubernetes works by comparing what you asked for with what exists, and closing the gap, over and over. This lesson runs that loop for a ReplicaSet: delete pods by hand, take the controller away for a while, and watch it repair everything when it returns.',
  concept: [
    'You describe the desired state (here: 3 pods). The actual state is whatever is running now. A controller\'s whole job is to make actual match desired.',
    'Every controller runs the same loop: read the desired state, observe the actual state, act on the difference, then wait for the next change.',
    'Controllers are level-triggered: they act on the current state, not on the events that led to it. A controller that missed ten deletions does not need to replay them; one look tells it that three pods are missing.',
    'This is why Kubernetes heals itself. Whatever removed a pod (a person, a crash, a lost node), the controller only sees that one is missing and makes another.',
  ],
  howItWorks: [
    'kubectl applies a ReplicaSet named web with the desired number of pods. The controller creates them.',
    'At 15 s, kubectl deletes some pods by hand.',
    'With the outage off, the controller notices 1 s later (the watch delay) and creates replacements.',
    'With the outage on, the controller manager is down from 10 s to 40 s. The deletions are stored, but nothing reacts until it comes back, and then it fixes everything at once.',
    'With nothing deleted, the loop finds nothing to do, and says so.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'desired', label: 'Desired pods', type: 'number', sample: one.desired, help: 'From 1 to 5.' },
      { name: 'deleted', label: 'Pods deleted at 15 s', type: 'number', sample: one.deleted, help: 'From 0 to 3 (never more than exist).' },
      { name: 'outage', label: 'Controller outage', type: 'choice', sample: one.outage, options: OUTAGE, help: 'The controller manager is down from 10 s to 40 s.' },
    ],
    presets: [
      { label: 'Delete one pod', values: one },
      { label: 'Delete three while the controller is down', values: outage },
      { label: 'Desired already matches', values: { ...one, deleted: '0' } },
    ],
    generate: desiredStateControllersSteps,
    codeLabel: 'Pseudocode',
  },
  code: desiredStateControllersCode,
  prosCons: {
    pros: ['The system repairs itself, whatever caused the gap', 'A controller that restarts or misses events still ends up right', 'You state the goal once instead of scripting every step'],
    cons: ['Changes take effect a moment later, not instantly', 'Fixing things by hand is undone: the controller puts back what the spec says', 'Two controllers that want different things can fight forever'],
    useWhen: ['You want a system to stay in a known shape without watching it', 'Failures are normal and must be recovered from automatically'],
    avoidWhen: ['A one-off task that must run exactly once: use a Job, not a loop that recreates it'],
  },
  applications: [
    'ReplicaSets keep a set number of pods running',
    'The node controller notices nodes that stop reporting',
    'GitOps tools such as Argo CD and Flux apply the same loop to whole clusters, with Git as the desired state',
  ],
  commonMistakes: [
    'Deleting a pod to stop it: its controller simply makes a new one. Scale the workload down instead.',
    'Thinking a controller that was down will replay every change it missed: it only looks at the state now.',
    'Editing a running object by hand and expecting it to stay: the next reconcile restores the spec.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'All three pods were deleted while the controller manager was down. It comes back at 40 s. What does the ReplicaSet controller do?',
      view: beforeReturn.view,
      options: ['Sees 0 of 3 pods and creates 3 at once', 'Replays the three deletions one by one', 'Does nothing, because it missed the events', 'Waits for someone to apply the ReplicaSet again'],
      answer: 0,
      explanation: 'Controllers are level-triggered. It compares desired (3) with actual (0) and creates the difference in one pass.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'You delete a pod that belongs to a ReplicaSet with 3 replicas. What happens?',
      options: ['A new pod with a new name is created to replace it', 'The ReplicaSet now wants 2 pods', 'The pod comes back with the same name', 'Nothing until you apply the ReplicaSet again'],
      answer: 0,
      explanation: 'The desired state still says 3. The controller sees 2, so it creates one more, with a new generated name.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line runs when desired and actual already match?',
      code: 'if (actual < desired) create(desired - actual)\nelse if (actual > desired) remove(actual - desired)\nelse doNothing()',
      options: ['doNothing()', 'create(desired - actual)', 'remove(actual - desired)', 'All of them, in turn'],
      answer: 0,
      explanation: 'With no difference there is nothing to fix, so the loop waits for the next change.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does level-triggered mean for a controller?',
      options: ['It acts on the current state, not on the history of events', 'It only runs at fixed times of day', 'It reacts to each event exactly once', 'It needs every event delivered in order'],
      answer: 0,
      explanation: 'Because it reads the current state each time, a lost or repeated event does no harm.',
    },
  ],
  summary: [
    'Desired state is what you asked for; actual state is what exists.',
    'A controller loops: observe, compare, act on the difference, wait.',
    'Controllers are level-triggered, so a missed event does no harm: one look at the current state is enough.',
    'Deleting a managed pod doesn\'t stop it: the controller replaces it.',
  ],
};

export default content;
