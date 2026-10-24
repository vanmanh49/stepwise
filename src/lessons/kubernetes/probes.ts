import { probesCode, probesSteps, SWITCH } from '../../kubernetes/scenarios/probes';
import type { LessonContent } from '../../types/lesson';

const none = { liveness: 'off', readiness: 'off', startup: 'off', slowStart: 'off', hang: 'on' };
const liveness = { ...none, liveness: 'on' };

// The hung app has missed two liveness probes; one more and the kubelet acts.
const steps = probesSteps(liveness);
const twoMisses = steps.find((s) => s.title.includes('(2/3)'))!;

const content: LessonContent = {
  overview:
    'A running container isn\'t always a working app: it can still be starting, or it can hang. Probes are how the kubelet finds out. This lesson sends steady requests to two web pods whose app starts slowly or hangs, and shows what each probe changes for the traffic.',
  concept: [
    'A liveness probe asks "is the app still alive?". When it fails several times in a row, the kubelet restarts the container. That cures a hang.',
    'A readiness probe asks "can the app take traffic now?". When it fails, the pod is marked not ready and leaves the Service\'s endpoints; nothing is restarted.',
    'A startup probe protects a slow start. Until it succeeds, the other probes wait. Without it, a liveness probe can kill an app that simply hasn\'t finished starting, over and over.',
    'Each probe runs every periodSeconds (2 s here, 10 s by default) and acts after failureThreshold misses in a row (3 by default).',
  ],
  howItWorks: [
    'Two web pods sit behind a Service. From 10 s, a client sends a request every 2 s.',
    'With slow start on, the app answers only 20 s after its container starts. With hang on, it stops answering at 40 s.',
    'Turn each probe on or off. Liveness and readiness probe every 2 s and act after 3 misses; startup probes every 2 s and allows 15 misses (30 s).',
    'Watch the requests table: a request to a pod that doesn\'t answer times out; with no ready pods, the Service refuses the connection.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'liveness', label: 'Liveness probe', type: 'choice', sample: none.liveness, options: SWITCH },
      { name: 'readiness', label: 'Readiness probe', type: 'choice', sample: none.readiness, options: SWITCH },
      { name: 'startup', label: 'Startup probe', type: 'choice', sample: none.startup, options: SWITCH },
      { name: 'slowStart', label: 'Slow start (20 s)', type: 'choice', sample: none.slowStart, options: SWITCH },
      { name: 'hang', label: 'Hang at 40 s', type: 'choice', sample: none.hang, options: SWITCH },
    ],
    presets: [
      { label: 'No probes: a hung pod keeps traffic', values: none },
      { label: 'Liveness restarts the hung pod', values: liveness },
      { label: 'Liveness kills a slow starter', values: { ...none, liveness: 'on', slowStart: 'on', hang: 'off' } },
      { label: 'Startup probe protects a slow start', values: { ...none, liveness: 'on', startup: 'on', slowStart: 'on', hang: 'off' } },
    ],
    generate: probesSteps,
    codeLabel: 'Pseudocode',
  },
  code: probesCode,
  prosCons: {
    pros: ['Hung apps are restarted without anyone watching', 'Traffic only reaches pods that can answer', 'Slow starters get time to start without weakening the liveness check'],
    cons: ['A liveness probe that is too strict restarts healthy apps under load', 'A readiness probe that checks shared dependencies can take every pod out at once', 'Probes add a little load and need tuning'],
    useWhen: ['Readiness for anything behind a Service; liveness for apps that can hang; startup for slow starters'],
    avoidWhen: ['Don\'t make a liveness probe depend on a database: if the database is down, restarting the app won\'t help'],
  },
  applications: [
    'An HTTP /healthz endpoint for liveness and /ready for readiness',
    'Java and other slow-starting apps use startup probes so a long boot isn\'t mistaken for a hang',
    'kubectl describe pod lists "Liveness probe failed" and "Readiness probe failed" events',
  ],
  commonMistakes: [
    'Using only a liveness probe on a slow-starting app, which then restarts forever.',
    'Expecting a readiness probe to restart a hung container: it only stops traffic.',
    'Pointing liveness at a check that depends on other services, so one outage restarts everything.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The app hung at 40 s and has failed 2 liveness probes in a row (threshold 3). What happens after the next miss?',
      view: twoMisses.view,
      options: ['The kubelet restarts the container', 'The pod is deleted and recreated elsewhere', 'Nothing: only readiness can act', 'The pod is marked not ready but kept running'],
      answer: 0,
      explanation: 'Liveness failures past the threshold restart the container in place. The restarted app answers again, so traffic recovers.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does a failing readiness probe do?',
      options: ['Takes the pod out of the Service\'s endpoints, without restarting it', 'Restarts the container', 'Deletes the pod', 'Stops the node'],
      answer: 0,
      explanation: 'Readiness only controls whether the pod gets traffic.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why doesn\'t the liveness probe kill a slow starter when a startup probe is set?',
      code: 'if (startup && !startup.passed) {\n  if (answers(app)) startup.passed = true\n  ...\n}\nif (liveness && !answers(app)) ...',
      options: ['The other probes wait until startup.passed is true', 'The startup probe restarts the app instead', 'Liveness is turned off for good', 'The app starts faster'],
      answer: 0,
      explanation: 'While the startup probe hasn\'t succeeded, the kubelet doesn\'t run liveness or readiness, so a long start isn\'t counted as a hang.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With no probes at all, what happens to requests sent to a hung pod?',
      options: ['They time out: the pod stays ready and in the endpoints', 'They are sent to another pod automatically', 'The pod is restarted after 3 requests', 'The Service refuses them'],
      answer: 0,
      explanation: 'Without probes, Kubernetes only knows the container is running, so the hung pod keeps getting traffic.',
    },
  ],
  summary: [
    'Liveness restarts a container that stops answering; it cures hangs.',
    'Readiness takes a pod out of traffic until it can answer; it never restarts.',
    'A startup probe holds the others off so a slow start isn\'t killed.',
    'Probes run every periodSeconds and act after failureThreshold misses in a row.',
  ],
};

export default content;
