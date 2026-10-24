import { CRASH_AFTER, EXIT_CODES, podsCode, podsSteps, POLICIES } from '../../kubernetes/scenarios/pods';
import type { LessonContent } from '../../types/lesson';

const crashes = { policy: 'Always', exit: '1', crashAfter: '5' };

// The second crash: the learner has seen one 10 s wait and must predict the next.
const steps = podsSteps(crashes);
const secondWait = steps.filter((s) => s.title.startsWith('kubelet waits'))[1]!;
const secondExit = steps[steps.indexOf(secondWait) - 1]!;

const content: LessonContent = {
  overview:
    'A pod is the smallest thing Kubernetes runs: one or more containers that share an address and run on the same node. This lesson runs one pod whose container keeps exiting, and shows what the kubelet does about it under each restart policy.',
  concept: [
    'kubectl get pods shows each pod\'s status: Pending (no node yet), ContainerCreating (the image is being pulled), Running, CrashLoopBackOff, and finally Completed or Failed once its containers stop for good. Underneath, Kubernetes keeps only five phases: Pending, Running, Succeeded, Failed and Unknown. ContainerCreating and CrashLoopBackOff are reasons a container is waiting, and a crash-looping pod\'s phase stays Running.',
    'When a container exits, the kubelet on its node looks at the pod\'s restart policy. Always restarts it whatever happened; OnFailure restarts it only if it failed (a non-zero exit code); Never leaves it stopped.',
    'A container that keeps crashing is restarted with a growing wait in between: 10 s, 20 s, 40 s and so on, up to 160 s. While it waits, the pod shows CrashLoopBackOff. The wait resets once the container runs for a while (60 s here).',
    'The kubelet restarts the container in place: same pod, same node, restart count + 1. A pod on its own is never moved or replaced; that is what controllers such as ReplicaSets are for.',
  ],
  howItWorks: [
    'kubectl applies a single pod named web. The scheduler places it on node-1.',
    'The kubelet pulls the image (2 s), starts the container and marks it ready.',
    'The container then exits after the time you choose, with the exit code you choose.',
    'With Always (or OnFailure and exit code 1), the kubelet waits and restarts it, doubling the wait each time. Watch the restart count on the pod.',
    'The run stops at 400 s, because a crash loop never ends by itself.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'policy', label: 'Restart policy', type: 'choice', sample: crashes.policy, options: POLICIES },
      { name: 'exit', label: 'Exit code', type: 'choice', sample: crashes.exit, options: EXIT_CODES, help: '0 means success; anything else is a failure.' },
      { name: 'crashAfter', label: 'Exits after (s)', type: 'choice', sample: crashes.crashAfter, options: CRASH_AFTER, help: 'How long the container runs each time.' },
    ],
    presets: [
      { label: 'Crashes and backs off', values: crashes },
      { label: 'Exit 0 with OnFailure', values: { ...crashes, policy: 'OnFailure', exit: '0' } },
      { label: 'Never', values: { ...crashes, policy: 'Never' } },
    ],
    generate: podsSteps,
    codeLabel: 'Pseudocode',
  },
  code: podsCode,
  prosCons: {
    pros: ['The kubelet recovers from crashes on its own, without any controller', 'Back-off stops a broken container from using up the node', 'Restart policies fit both servers (Always) and batch jobs (OnFailure, Never)'],
    cons: ['A pod on its own is not replaced if its node dies or it is deleted', 'A crash loop can hide a real bug for a long time', 'Long back-offs (up to 160 s here, 5 minutes in Kubernetes) delay recovery after a fix'],
    useWhen: ['Learning, debugging, or one-off tasks', 'Inside controllers, which create pods for you'],
    avoidWhen: ['Running a service you need to stay up: use a Deployment instead of a bare pod'],
  },
  applications: [
    'Web servers run with restartPolicy Always so they come back after a crash',
    'Batch jobs use OnFailure so a finished job is not run again',
    'kubectl describe pod shows the restart count and the last exit code when debugging CrashLoopBackOff',
  ],
  commonMistakes: [
    'Thinking CrashLoopBackOff is an error of its own: it only means the kubelet is waiting before the next restart.',
    'Expecting a restarted container to land on another node: the kubelet restarts it in place.',
    'Using Always for a job that finishes, so it runs again and again.',
    'Running a bare pod in production and losing it when its node fails.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The container has just crashed for the second time. After the first crash the kubelet waited 10 s. How long does it wait now?',
      view: secondExit.view,
      options: ['20 s', '10 s', '0 s', '160 s'],
      answer: 0,
      explanation: 'The back-off doubles after each crash: 10 s, then 20 s, then 40 s, up to the cap.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A pod with restartPolicy OnFailure exits with code 0. What happens?',
      options: ['It is Completed and not restarted', 'It is restarted after 10 s', 'It is moved to another node', 'It goes into CrashLoopBackOff'],
      answer: 0,
      explanation: 'Exit code 0 means success, and OnFailure only restarts on failure, so the pod stays Completed.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which condition decides whether the kubelet restarts a container?',
      code: "const restart = pod.restartPolicy === 'Always' ||\n  (pod.restartPolicy === 'OnFailure' && exitCode !== 0)",
      options: ['Always, or OnFailure with a non-zero exit code', 'Only Always', 'Any exit code other than 0, whatever the policy', 'Never, when the exit code is 1'],
      answer: 0,
      explanation: 'Always restarts in every case; OnFailure only when the exit code is not 0; Never never restarts.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Who restarts a crashed container?',
      options: ['The kubelet on the pod\'s node', 'The scheduler', 'The ReplicaSet controller', 'kubectl'],
      answer: 0,
      explanation: 'Restarting containers in place is the kubelet\'s job. Controllers only step in when a pod is gone.',
    },
  ],
  summary: [
    'A pod moves from Pending to ContainerCreating to Running, and ends Completed or Failed.',
    'The restart policy decides what happens when a container exits: Always, OnFailure or Never.',
    'Crashing containers are restarted with a doubling back-off (CrashLoopBackOff), capped at 160 s here.',
    'The kubelet restarts containers in place; replacing whole pods is a controller\'s job.',
  ],
};

export default content;
