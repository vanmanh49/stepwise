import { NOT_READY, SELECTORS, servicesKubeProxyCode, servicesKubeProxySteps } from '../../kubernetes/scenarios/services-kube-proxy';
import type { LessonContent } from '../../types/lesson';

const even = { replicas: '3', notReady: 'off', selector: 'correct' };
const typo = { ...even, selector: 'typo' };

// The pods are ready, but the Service's selector has a typo: the first request is next.
const typoSteps = servicesKubeProxySteps(typo);
const beforeFirst = typoSteps[typoSteps.findIndex((s) => s.title.startsWith('Request #1')) - 1]!;

const content: LessonContent = {
  overview:
    'Pods come and go and change address, so clients need one stable address to call. A Service gives them that, and kube-proxy on every node forwards each connection to one of the Service\'s pods. This lesson sends 10 requests to a Service, then makes a pod unready and breaks the selector.',
  concept: [
    'A Service has a stable virtual address (its ClusterIP) and a selector. It never lists pods by name.',
    'The Endpoints controller keeps a list of the pods that match the selector and are ready. A pod that is Running but not ready is left out.',
    'kube-proxy runs on every node. For each new connection to the ClusterIP it picks one endpoint (at random, as in its iptables mode) and forwards the connection there.',
    'Changes take a moment to reach the list: a pod that just became unready can still get traffic until the Endpoints controller\'s next pass. And a selector that matches nothing leaves the list empty, so every connection is refused.',
  ],
  howItWorks: [
    'kubectl applies a Deployment named web and a Service named web that selects app=web.',
    'Once the pods are ready, the Endpoints controller lists them.',
    'From 12 s, a client sends one request per second, 10 in all. kube-proxy picks a pod for each.',
    'With a pod going not-ready at 16 s, watch it leave the list 1 s later, and stop receiving requests.',
    'With the typo, the Service selects app=wbe. No pod matches, the list stays empty, and every request is refused.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'replicas', label: 'Replicas', type: 'number', sample: even.replicas, help: 'From 1 to 4.' },
      { name: 'notReady', label: 'A pod goes not-ready', type: 'choice', sample: even.notReady, options: NOT_READY, help: 'The first web pod, at 16 s.' },
      { name: 'selector', label: 'Service selector', type: 'choice', sample: even.selector, options: SELECTORS, help: 'typo = app=wbe instead of app=web.' },
    ],
    presets: [
      { label: 'Even spread', values: even },
      { label: 'Pod goes not-ready', values: { ...even, notReady: 'on' } },
      { label: 'Selector typo', values: typo },
    ],
    generate: servicesKubeProxySteps,
    codeLabel: 'Pseudocode',
  },
  code: servicesKubeProxyCode,
  prosCons: {
    pros: ['Clients use one stable address while pods are replaced underneath', 'Traffic only goes to ready pods', 'Load is spread over every ready pod with no extra software'],
    cons: ['Random picks spread load evenly only on average', 'A pod can get a few connections after it becomes unready', 'A selector typo fails silently: the Service exists but has no endpoints'],
    useWhen: ['Any set of pods that other pods or clients need to reach'],
    avoidWhen: ['A client must reach one specific pod: use a headless Service or a StatefulSet\'s stable names'],
  },
  applications: [
    'Pods call each other by Service name (web.default.svc), which DNS turns into the ClusterIP',
    'kubectl get endpoints web shows which pods currently receive traffic',
    'LoadBalancer and NodePort Services expose the same endpoints outside the cluster',
  ],
  commonMistakes: [
    'A selector that doesn\'t match the pod template\'s labels, so the Service has no endpoints.',
    'Debugging a "connection refused" without checking kubectl get endpoints first.',
    'Expecting a pod to stop getting traffic the instant it becomes unready.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The Service selects app=wbe, but every pod is labelled app=web. Request #1 arrives. What happens?',
      view: beforeFirst.view,
      options: ['It is refused: the Service has no endpoints', 'It goes to a random web pod anyway', 'kube-proxy fixes the typo', 'It waits until a pod matches'],
      answer: 0,
      explanation: 'kube-proxy only forwards to the Endpoints list. With no matching pods that list is empty, so the connection is refused.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A pod is Running but has failed its readiness check. Is it in the Service\'s endpoints?',
      options: ['No: only ready pods are listed', 'Yes: every Running pod is listed', 'Only if it is on the same node as the client', 'Only for the first request'],
      answer: 0,
      explanation: 'The Endpoints controller lists pods that match the selector and are ready. Running is not enough.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line decides which pod gets a connection?',
      code: "const list = endpoints[svc]\nif (list.length === 0) refuse('no endpoints')\nelse forward(conn, list[randomIndex(list.length)])",
      options: ['forward(conn, list[randomIndex(list.length)])', "refuse('no endpoints')", 'const list = endpoints[svc]', 'None: the client chooses the pod'],
      answer: 0,
      explanation: 'kube-proxy picks a random entry from the Endpoints list for each new connection.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do clients call a Service instead of a pod\'s address?',
      options: ['Pods are replaced with new addresses; the Service address stays the same', 'Pods have no addresses until a Service gives them one', 'Services answer faster, because they cache each reply', 'Only Services can use HTTP'],
      answer: 0,
      explanation: 'A replacement pod gets a new name and address. The Service\'s ClusterIP and selector keep pointing at whichever pods are ready.',
    },
  ],
  summary: [
    'A Service is a stable address plus a selector.',
    'Its Endpoints list holds the ready pods that match the selector.',
    'kube-proxy forwards each new connection to a random endpoint.',
    'Unready pods leave the list a moment later; a selector typo leaves it empty.',
  ],
};

export default content;
