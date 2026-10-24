import { CPU_LIMITS, LEAK, QOS, requestsLimitsCode, requestsLimitsSteps } from '../../kubernetes/scenarios/requests-limits';
import type { LessonContent } from '../../types/lesson';

const throttled = { qos: 'Burstable', cpuLimit: '500m', leak: 'off' };
const pressure = { qos: 'Burstable', cpuLimit: 'none', leak: 'on' };

// The node is out of memory for the first time; the kubelet is about to pick a pod to evict.
const steps = requestsLimitsSteps(pressure);
const beforeEvict = steps[steps.findIndex((s) => s.title.includes('to free memory')) - 1]!;

const content: LessonContent = {
  overview:
    'Each container can say how much CPU and memory it needs (requests) and the most it may use (limits). Requests decide where a pod fits; limits decide what happens when it wants more. This lesson puts two web pods under rising traffic and a memory leak, next to a batch pod that asked for nothing.',
  concept: [
    'A request is what the pod is promised. The scheduler only places a pod where its requests fit. A limit is a ceiling the pod can\'t go past.',
    'CPU over the limit is throttled: the pod gets less CPU and slows down, but keeps running. Memory can\'t be taken back, so a container that goes over its memory limit is killed (OOMKilled, exit code 137) and restarted.',
    'Requests and limits give each pod a QoS class. Guaranteed: limits equal requests for both CPU and memory. Burstable: some request or limit set. BestEffort: nothing set.',
    'When a node runs out of memory, the kubelet evicts pods to save the node: BestEffort first, then Burstable pods using more than they requested, Guaranteed last. While the node is short of memory, no new BestEffort pods are placed there.',
  ],
  howItWorks: [
    'One node with 4 CPU and 768 MiB of memory runs two web pods and one batch pod (BestEffort).',
    'Traffic to web rises from 20 to 120 requests per second at 30–40 s; each request costs 10m of CPU, shared between the web pods.',
    'Pick the web pods\' QoS class and CPU limit. Burstable requests 250m CPU and 128 MiB; Guaranteed sets CPU and memory limits equal to requests (memory 256 MiB).',
    'With the leak on, each web container\'s memory grows 10 MiB a second. Metrics are read every 5 s here (about 15 s in Kubernetes).',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'qos', label: 'Web QoS class', type: 'choice', sample: throttled.qos, options: QOS },
      { name: 'cpuLimit', label: 'CPU limit', type: 'choice', sample: throttled.cpuLimit, options: CPU_LIMITS, help: 'Guaranteed uses it as the request too (500m if none); BestEffort ignores it.' },
      { name: 'leak', label: 'Memory leak in web', type: 'choice', sample: throttled.leak, options: LEAK, help: '10 MiB a second.' },
    ],
    presets: [
      { label: 'Throttled, not killed', values: throttled },
      { label: 'OOMKilled', values: { qos: 'Guaranteed', cpuLimit: '500m', leak: 'on' } },
      { label: 'Node pressure evicts BestEffort first', values: pressure },
    ],
    generate: requestsLimitsSteps,
    codeLabel: 'Pseudocode',
  },
  code: requestsLimitsCode,
  prosCons: {
    pros: ['Requests let the scheduler pack nodes without overcommitting them', 'CPU limits protect neighbours from a busy pod without killing it', 'QoS classes make it predictable who is evicted first'],
    cons: ['A CPU limit set too low makes a pod slow under load', 'A memory limit set too low turns normal peaks into OOMKills and restarts', 'Pods without requests (BestEffort) are the first to go under pressure'],
    useWhen: ['Always set requests; set memory limits for anything that could leak'],
    avoidWhen: ['Don\'t copy one set of numbers to every app: measure what each one actually uses'],
  },
  applications: [
    'kubectl describe pod shows "OOMKilled" and exit code 137 as the last state of a container that hit its memory limit',
    'Critical services run as Guaranteed so they are evicted last',
    'Batch jobs often run as BestEffort to soak up spare capacity',
  ],
  commonMistakes: [
    'Thinking a pod over its CPU limit gets killed: it gets throttled.',
    'Setting no memory limit on a leaky app, so it fills the node and other pods are evicted.',
    'Forgetting requests, so the scheduler thinks the pod needs nothing and the pod is first to be evicted.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The node has run out of memory. The web pods are Burstable and leaking; the batch pod is BestEffort. Which pod does the kubelet evict first?',
      view: beforeEvict.view,
      options: ['The batch pod: BestEffort goes first', 'A web pod, because it is leaking', 'All pods at once', 'None: the node just slows down'],
      answer: 0,
      explanation: 'Eviction follows QoS class, not blame: BestEffort pods promised nothing, so they go before Burstable pods over their request.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A pod keeps wanting more CPU than its limit. What happens?',
      options: ['It is throttled: slower, but still running', 'It is OOMKilled', 'It is evicted', 'It is moved to a bigger node'],
      answer: 0,
      explanation: 'CPU can be shared out over time, so going over the limit only means getting less of it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line explains exit code 137?',
      code: "cpu = min(wanted, limits.cpu)\nif (memory > limits.memory)\n  kill(pod, 'OOMKilled')",
      options: ["kill(pod, 'OOMKilled'): memory over the limit kills the container", 'cpu = min(wanted, limits.cpu)', 'Neither: 137 means the image is missing', 'Both lines together'],
      answer: 0,
      explanation: 'A container killed for using more memory than its limit ends with exit code 137 and reason OOMKilled.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which pod is Guaranteed?',
      options: ['CPU request = limit = 500m and memory request = limit = 256 MiB', 'CPU request 250m and no limits', 'No requests or limits at all', 'Only a memory limit of 256 MiB and a CPU request of 100m'],
      answer: 0,
      explanation: 'Guaranteed needs limits equal to requests for both CPU and memory. Anything partial is Burstable; nothing at all is BestEffort.',
    },
  ],
  summary: [
    'Requests decide placement; limits cap use.',
    'Over the CPU limit: throttled. Over the memory limit: OOMKilled and restarted.',
    'QoS classes (Guaranteed, Burstable, BestEffort) come from requests and limits.',
    'Under memory pressure, BestEffort pods are evicted first and no new ones are placed.',
  ],
};

export default content;
