import { serviceDiscoveryCode, serviceDiscoverySteps } from '../../microservices/scenarios/service-discovery';
import type { LessonContent } from '../../types/lesson';

const register = { instances: '3', heartbeat: '20', ttl: '60', dies: '0' };
const dies = { instances: '3', heartbeat: '20', ttl: '60', dies: '50' };

const death = serviceDiscoverySteps(dies).find((s) => s.title === 'orders-3 stops')!;

const content: LessonContent = {
  overview:
    'In a microservice system, instances start, stop and move all the time, so their addresses cannot be written into the callers. A service registry keeps the current list instead. Instances register when they start and send heartbeats to say they are still alive; clients ask the registry before calling. This lesson kills an instance and shows the window in which the registry still lists it.',
  concept: [
    'Each instance registers itself with the registry when it starts. From then on it sends a heartbeat every few milliseconds (here, every heartbeat interval).',
    'Before each request, the client looks the service up. The registry answers with the instances it has heard from recently, and the client takes them in turn.',
    'An instance that crashes cannot say goodbye. Its heartbeats just stop. The registry only notices on a tick, when the last heartbeat is older than the TTL (time to live), and then evicts it.',
    'Between the death and the eviction, the registry still hands out the dead instance, and requests sent to it fail. A shorter TTL shrinks that window, but if it is shorter than the heartbeat interval, healthy instances get dropped between beats.',
  ],
  howItWorks: [
    'At time 0 every orders instance registers; then each one sends a heartbeat every interval.',
    'On every tick, the registry evicts instances whose last heartbeat is older than the TTL.',
    'The client sends 10 GET /orders, one every 15 ms. For each, it looks up orders first and calls the next instance in the list.',
    'With "dies at" above 0, the last instance dies at that time and stops sending heartbeats.',
    'Watch the badges: ♥ 12 ms means the registry last heard from that instance 12 ms ago; "evicted" means it has been dropped.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'instances', label: 'Instances', type: 'number', sample: register.instances, help: 'Orders instances, from 1 to 4.' },
      { name: 'heartbeat', label: 'Heartbeat interval', type: 'number', sample: register.heartbeat, help: 'Milliseconds between heartbeats, from 10 to 100.' },
      { name: 'ttl', label: 'TTL', type: 'number', sample: register.ttl, help: 'Milliseconds without a heartbeat before eviction, from 20 to 300.' },
      { name: 'dies', label: 'Dies at', type: 'number', sample: register.dies, help: 'When the last instance dies, in ms; 0 means never.' },
    ],
    presets: [
      { label: 'Register and look up', values: register },
      { label: 'Instance dies', values: dies },
      { label: 'Short TTL', values: { instances: '3', heartbeat: '20', ttl: '25', dies: '50' } },
    ],
    generate: serviceDiscoverySteps,
    codeLabel: 'Pseudocode',
  },
  code: serviceDiscoveryCode,
  prosCons: {
    pros: ['Instances can start and stop without any caller changing', 'Dead instances are dropped automatically', 'Clients always ask for the current list'],
    cons: ['Requests can still reach a dead instance until it is evicted', 'Heartbeats and lookups add network traffic', 'The registry itself must stay available'],
    useWhen: ['Instances are added and removed often, for example when scaling', 'Addresses are not known in advance'],
    avoidWhen: ['A handful of fixed servers whose addresses never change'],
  },
  applications: [
    'Container platforms that start and stop instances as load changes',
    'Registries such as Consul, Eureka or etcd',
    'DNS-based discovery inside Kubernetes clusters',
  ],
  commonMistakes: [
    'Setting the TTL shorter than the heartbeat interval, so healthy instances keep getting evicted.',
    'Setting a very long TTL, so dead instances stay listed for a long time.',
    'Caching the instance list in the client forever instead of refreshing it.',
    'Assuming an instance that is listed is certainly alive.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'orders-3 has just died at 50 ms. Heartbeats come every 20 ms and the TTL is 60 ms. What happens to a request the client sends to orders-3 at 85 ms?',
      view: death.view,
      options: ['It fails: orders-3 is still listed but refuses the connection', 'It succeeds: the registry redirects it', 'The registry has already evicted orders-3, so it goes elsewhere', 'It waits until orders-3 restarts'],
      answer: 0,
      explanation: 'The last heartbeat arrived at 45 ms, so orders-3 is only evicted at the 120 ms tick. Until then the client can still be sent to it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How does the registry find out that an instance has crashed?',
      options: ['Its heartbeats stop, and after the TTL the registry evicts it', 'The instance sends a goodbye message as it crashes', 'The client tells the registry', 'It never finds out'],
      answer: 0,
      explanation: 'A crash gives no warning. Silence for longer than the TTL is the only signal.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line in the registry decide?',
      code: 'if (now - lastSeen[instance] > ttl) registry.remove(instance)',
      options: ['Whether the instance has been silent too long and must be dropped', 'Whether the instance is busy', 'Which instance gets the next request', 'How often heartbeats are sent'],
      answer: 0,
      explanation: 'An instance whose last heartbeat is older than the TTL is treated as dead and removed from the list.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why not set the TTL to 5 ms when heartbeats come every 20 ms?',
      options: ['Healthy instances would be evicted between their heartbeats', 'The registry would run out of memory', 'Heartbeats would get slower', 'Clients could not look anything up'],
      answer: 0,
      explanation: 'The TTL must be longer than the gap between heartbeats, or every instance looks dead most of the time.',
    },
  ],
  summary: [
    'A service registry keeps the list of live instances so callers never hard-code addresses.',
    'Instances register at start and keep sending heartbeats.',
    'A crashed instance is evicted only once its last heartbeat is older than the TTL.',
    'Until then, requests can still reach it: a shorter TTL shrinks that window, but must stay above the heartbeat interval.',
  ],
};

export default content;
