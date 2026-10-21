import type { LessonMeta } from '../../types/lesson';

/** Microservices lessons in learning order: what pages need without loading a lesson. */
export const microservicesMeta: LessonMeta[] = [
  {
    id: 'monolith-vs-microservices',
    title: 'Monolith vs Microservices',
    category: 'microservices',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Run the same requests through one big process and through small services, then break something.',
    keywords: ['monolith', 'microservices', 'architecture', 'service', 'process', 'failure isolation', 'network hop', 'deploy'],
    prerequisites: [],
  },
  {
    id: 'service-boundaries',
    title: 'Service Boundaries',
    category: 'microservices',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Split the same shop by layer and by business capability, and count the calls between services.',
    keywords: ['service boundaries', 'bounded context', 'domain', 'capability', 'layers', 'coupling', 'cohesion', 'chatty'],
    prerequisites: ['monolith-vs-microservices'],
  },
  {
    id: 'synchronous-calls',
    title: 'Synchronous Calls',
    category: 'microservices',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Follow one request through a chain of services and watch the waiting add up.',
    keywords: ['synchronous', 'request response', 'latency', 'call chain', 'fan-out', 'parallel', 'rpc', 'http', 'slow service'],
    prerequisites: ['service-boundaries'],
  },
  {
    id: 'api-gateway',
    title: 'API Gateway',
    category: 'microservices',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Send requests through one front door that checks tokens and routes each path to its service.',
    keywords: ['api gateway', 'routing', 'reverse proxy', 'authentication', 'token', '401', '404', 'entry point', 'edge'],
    prerequisites: ['synchronous-calls'],
  },
];
