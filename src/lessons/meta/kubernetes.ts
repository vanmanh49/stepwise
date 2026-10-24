import type { LessonMeta } from '../../types/lesson';

/** Kubernetes lessons in learning order: what pages need without loading a lesson. */
export const kubernetesMeta: LessonMeta[] = [
  {
    id: 'cluster-architecture',
    title: 'Cluster Architecture',
    category: 'kubernetes',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Follow one kubectl apply from the API server to running containers, then take the scheduler or etcd away.',
    keywords: ['kubernetes', 'control plane', 'api server', 'etcd', 'scheduler', 'controller manager', 'kubelet', 'node'],
    prerequisites: [],
  },
  {
    id: 'pods',
    title: 'Pods',
    category: 'kubernetes',
    difficulty: 'beginner',
    group: 'Foundations',
    description: 'Run one pod whose container keeps crashing, and see what each restart policy and CrashLoopBackOff do.',
    keywords: ['pod', 'container', 'restart policy', 'crashloopbackoff', 'back-off', 'exit code', 'kubelet', 'phase'],
    prerequisites: ['cluster-architecture'],
  },
];
