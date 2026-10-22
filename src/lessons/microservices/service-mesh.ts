import { serviceMeshCode, serviceMeshSteps } from '../../microservices/scenarios/service-mesh';
import type { LessonContent } from '../../types/lesson';

const noMesh = { mesh: 'off', retries: '2', mtls: 'off', requests: '8' };
const withMesh = { ...noMesh, mesh: 'on' };

// The step where orders-1 hands its first call to its sidecar.
const meshRun = serviceMeshSteps(withMesh);
const handOff = meshRun[meshRun.findIndex((s) => s.title === 'orders-1 hands #1 to its sidecar')]!;

const content: LessonContent = {
  overview:
    'Timeouts, retries, encryption and metrics are needed on every call between services. Writing them into each service means doing it again in every language and every team. A service mesh moves them out of the app: each instance gets a sidecar proxy beside it, all traffic goes through the sidecars, and one config tells every sidecar what to do. This lesson makes payments flaky, then lets the mesh retry for orders and lock out a caller that has no certificate.',
  concept: [
    'A sidecar is a small proxy that runs next to each instance, on the same host. The app sends its calls to localhost; the sidecar carries them on.',
    'The mesh is all the sidecars plus a control plane that gives them their config: retries, timeouts, which services may call which, and certificates.',
    'mTLS (mutual TLS): both sides of every call show a certificate. Sidecars set it up for the app, so a caller outside the mesh is refused.',
    'The cost is extra hops and processing on every call, and more moving parts to run. Here each call spends 6 ms more inside the proxies.',
  ],
  howItWorks: [
    'The client places an order every 30 ms; orders calls payments, which fails each request with chance 0.4 ("500: flaky", seed 7).',
    'A scraper outside the system calls payments directly at 15 ms.',
    'With the mesh on, orders-1 hands each call to orders-proxy, which sends it to payments-proxy, which hands it to payments-1. Mesh retries is how many times orders-proxy tries again, 10 ms apart.',
    'With mTLS on, payments-proxy only accepts calls from other sidecars. Each sidecar\'s badge counts the calls it made and the retries. "extra ms per call" is the time the proxies add to each call.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'mesh', label: 'Mesh', type: 'choice', sample: noMesh.mesh, options: ['off', 'on'] },
      { name: 'retries', label: 'Mesh retries', type: 'number', sample: noMesh.retries, help: 'From 0 to 3, done by the sidecar. Ignored without the mesh.' },
      { name: 'mtls', label: 'mTLS', type: 'choice', sample: noMesh.mtls, options: ['off', 'on'], help: 'Mesh only: refuse callers without a certificate.' },
      { name: 'requests', label: 'Orders', type: 'number', sample: noMesh.requests, help: 'From 4 to 12, one every 30 ms.' },
    ],
    presets: [
      { label: 'No mesh', values: noMesh },
      { label: 'Mesh with retries', values: withMesh },
      { label: 'Mesh with mTLS', values: { ...withMesh, mtls: 'on' } },
      { label: 'Mesh without retries', values: { ...withMesh, retries: '0' } },
    ],
    generate: serviceMeshSteps,
    codeLabel: 'Pseudocode',
  },
  code: serviceMeshCode,
  prosCons: {
    pros: ['Retries, timeouts and mTLS without changing app code', 'The same rules for every service, whatever its language', 'Every call is measured, which feeds metrics and traces'],
    cons: ['Extra latency on every call, through two proxies', 'Many more processes to run, upgrade and debug', 'Retries in the mesh plus retries in the app can multiply load'],
    useWhen: ['Many services in several languages need the same network rules', 'Calls between services must be encrypted and authorised'],
    avoidWhen: ['A handful of services, where a shared library is simpler', 'Latency budgets too tight for extra hops'],
  },
  applications: [
    'Istio and Linkerd running Envoy or linkerd2-proxy sidecars in Kubernetes',
    'Zero-trust networks where every service call uses mTLS',
    'Traffic splitting and retries set in mesh config instead of code',
  ],
  commonMistakes: [
    'Retrying in the app and in the mesh, so one failure becomes many calls.',
    'Retrying calls that are not idempotent, such as a payment without a key.',
    'Forgetting that the mesh only covers traffic that goes through the sidecars.',
    'Adding a mesh for two services and paying its cost for little gain.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'orders-1 has handed its call to its sidecar. Where does the sidecar send it?',
      view: handOff.view,
      options: ['To payments-proxy, which hands it to payments-1', 'Straight to payments-1', 'Back to orders-1', 'To the client'],
      answer: 0,
      explanation: 'In the mesh, traffic goes sidecar to sidecar. payments-proxy then passes the call to its own instance.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With the mesh retrying, what changed in orders\' code?',
      options: ['Nothing: the retry rule lives in the mesh config', 'A retry loop around the call', 'A new timeout', 'It calls payments-proxy by name'],
      answer: 0,
      explanation: 'The app still makes one plain call. Its sidecar applies the retries.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line refuses the scraper?',
      code: "route payments:\n  retries: 2\n  perTryTimeout: 100ms\n  mtls: STRICT",
      options: ['mtls: STRICT', 'retries: 2', 'perTryTimeout: 100ms', 'route payments:'],
      answer: 0,
      explanation: 'With strict mTLS, payments-proxy accepts only callers with a mesh certificate. The scraper has none.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does the mesh cost each call here?',
      options: ['About 6 ms in extra hops and proxy work', 'Nothing', 'One retry', 'A second database query'],
      answer: 0,
      explanation: 'Each call passes two sidecars: four 1 ms loopback hops plus 1 ms of work in each proxy on the way in.',
    },
  ],
  summary: [
    'A sidecar proxy runs beside each instance and carries its traffic.',
    'Mesh config applies retries, timeouts and mTLS without changing app code.',
    'mTLS lets only services in the mesh call each other.',
    'The price is extra latency per call and more infrastructure to run.',
  ],
};

export default content;
