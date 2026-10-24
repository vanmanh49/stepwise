import { CONTROLLER, DEFAULT_BACKENDS, ingressCode, ingressSteps, PATH_TYPES } from '../../kubernetes/scenarios/ingress';
import type { LessonContent } from '../../types/lesson';

const base = { apiPathType: 'Prefix', defaultBackend: 'none', apiReplicas: '1', controller: 'on' };

// The request for /apiary is about to be matched.
const steps = ingressSteps(base);
const apiary = steps.findIndex((s) => s.title.includes('/apiary'));
const beforeApiary = steps[apiary - 1]!;

const content: LessonContent = {
  overview:
    'A Service gives pods one address inside the cluster. To reach many Services from outside through one entry point, by host name and URL path, Kubernetes has Ingress: rules such as "shop.example.com/api goes to the api Service", carried out by an ingress controller. This lesson sends five requests through those rules.',
  concept: [
    'An Ingress is a list of rules: a host, and paths under it, each pointing to a Service. It does nothing alone: an ingress controller (ingress-nginx, Traefik, a cloud load balancer) must be running to read the rules and serve traffic.',
    'Rules naming the request\'s host are used; rules without a host match any host. Among the matching paths the longest wins, and at equal length Exact beats Prefix.',
    'Prefix matches whole path elements: /api matches /api and /api/cart, but not /apiary. Exact matches only that path.',
    'No match goes to the default backend if there is one, else 404. A matched Service with no ready pods gives 503. The controller sends requests straight to pod IPs from the Service\'s endpoints.',
    'The Ingress API is frozen: it still works, but new features go into its successor, the Gateway API (Gateway and HTTPRoute objects).',
  ],
  howItWorks: [
    'Deployments web and api, each with a Service. Ingress shop sends shop.example.com/ to web and /api to api.',
    'Five requests arrive: /, /api/cart, /apiary and /api on shop.example.com, then / on admin.example.com.',
    'Switch /api to Exact and /api/cart falls through to /. Add a default backend and admin.example.com gets web instead of 404.',
    'With 0 api replicas, /api requests get 503. With no ingress controller, every request is refused.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'apiPathType', label: '/api pathType', type: 'choice', sample: base.apiPathType, options: PATH_TYPES },
      { name: 'defaultBackend', label: 'Default backend', type: 'choice', sample: base.defaultBackend, options: DEFAULT_BACKENDS },
      { name: 'apiReplicas', label: 'api replicas', type: 'number', sample: base.apiReplicas, help: 'From 0 to 2 pods.' },
      { name: 'controller', label: 'Ingress controller', type: 'choice', sample: base.controller, options: CONTROLLER },
    ],
    presets: [
      { label: 'Routes by path', values: base },
      { label: 'Exact vs Prefix', values: { ...base, apiPathType: 'Exact' } },
      { label: 'Unknown host: default backend', values: { ...base, defaultBackend: 'web' } },
      { label: 'No endpoints: 503', values: { ...base, apiReplicas: '0' } },
      { label: 'No ingress controller', values: { ...base, controller: 'off' } },
    ],
    generate: ingressSteps,
    codeLabel: 'Pseudocode',
  },
  code: ingressCode,
  prosCons: {
    pros: ['One entry point and one TLS certificate for many Services', 'Routing by host and path without a load balancer per Service', 'Rules live with the app as Kubernetes objects'],
    cons: ['Needs an ingress controller installed and run', 'Behaviour beyond the basics differs between controllers (annotations)', 'The API is frozen; new features are in the Gateway API'],
    useWhen: ['HTTP(S) apps that share a domain or need path-based routing'],
    avoidWhen: ['Non-HTTP traffic: use a LoadBalancer Service', 'New setups that need advanced routing: consider the Gateway API'],
  },
  applications: [
    'ingress-nginx serving shop.example.com with paths to several Services',
    'TLS termination with a certificate from a Secret (cert-manager)',
    'kubectl describe ingress shop shows each rule and its backends',
  ],
  commonMistakes: [
    'Creating an Ingress with no ingress controller installed, then wondering why it has no address.',
    'Expecting Prefix /api to match /apiary.',
    'Forgetting that a matched Service with no ready pods returns 503, not 404.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The next request is GET shop.example.com/apiary. The rules are / (Prefix) → web and /api (Prefix) → api. Where does it go?',
      view: beforeApiary.view,
      options: ['web: /api doesn\'t match /apiary, but / does', 'api: /apiary starts with /api', '404', 'Both'],
      answer: 0,
      explanation: 'Prefix matching works on whole path elements, so /api covers /api/cart but not /apiary.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'You apply an Ingress but no ingress controller runs in the cluster. What happens to requests?',
      options: ['Nothing serves them: the Ingress is only stored rules', 'kube-proxy routes them instead', 'The API server answers them', 'They go to the default backend'],
      answer: 0,
      explanation: 'An Ingress needs a controller to read it and listen for traffic.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line answers when the api Service has no ready pods?',
      code: 'if (!backend) return 404\nif (endpoints(backend).length === 0) return 503\nproxy(request, pick(endpoints(backend)))',
      options: ['return 503', 'return 404', 'proxy(…)', 'None: the request waits'],
      answer: 0,
      explanation: 'A rule matched, so it is not 404; there is just nowhere to send it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Two paths match /api: /api (Exact) and /api (Prefix). Which wins?',
      options: ['Exact', 'Prefix', 'The first one listed', 'Neither: it is an error'],
      answer: 0,
      explanation: 'The longest match wins; at equal length, Exact beats Prefix.',
    },
  ],
  summary: [
    'An Ingress maps hosts and paths to Services; a controller carries it out.',
    'The longest matching path wins; Exact beats Prefix at equal length.',
    'Prefix matches whole path elements.',
    'No match gives 404 (or the default backend); no ready pods gives 503.',
  ],
};

export default content;
