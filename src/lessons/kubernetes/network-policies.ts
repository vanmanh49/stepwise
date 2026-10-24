import { networkPoliciesCode, networkPoliciesSteps, ON_OFF, POLICIES } from '../../kubernetes/scenarios/network-policies';
import type { LessonContent } from '../../types/lesson';

const base = { policies: 'none', egress: 'off', dns: 'off' };
const allowed = { ...base, policies: 'deny + allow frontend→api' };

// debug is about to call api, with only frontend allowed in.
const steps = networkPoliciesSteps(allowed);
const debugCall = steps.findIndex((s) => s.title.startsWith('debug-') && s.title.includes('sends request'));
const beforeDebug = steps[debugCall - 1]!;

const content: LessonContent = {
  overview:
    'By default every pod can reach every other pod. That is convenient, and it means one compromised pod can talk to your database. A NetworkPolicy is a firewall rule for pods: it selects pods by label and says who may connect to them, or where they may connect to. This lesson locks down a small app one policy at a time.',
  concept: [
    'A pod is open until some NetworkPolicy selects it. Once a policy with type Ingress selects a pod, only the connections that some selecting policy\'s rules allow can reach it. Egress works the same for outgoing connections.',
    'Rules add up: there are no deny rules. A policy with podSelector {} and no rules selects every pod and allows nothing: a default deny. Further policies then open exactly what is needed.',
    'Traffic a policy forbids is dropped, not refused, so clients see a timeout. That makes policy mistakes look like network trouble.',
    'Egress policies block DNS too. A pod that may only talk to api can\'t even look up the name "api" unless a rule allows UDP 53 to the cluster DNS.',
    'Policies are enforced by the network (CNI) plugin. With a plugin that doesn\'t support them (some basic setups), they are stored and silently ignored. Policies can also select namespaces (namespaceSelector), which this lesson leaves out.',
  ],
  howItWorks: [
    'Four Deployments: frontend, api, db and debug, and Services api and db. Requests go frontend → api, debug → api and api → db, twice.',
    'With no policies, all of them succeed. A default deny isolates every pod, so all of them time out.',
    'Allowing frontend → api opens exactly that path; debug stays blocked. A second rule opens api → db.',
    'Locking frontend\'s egress to api only breaks its DNS lookups; allowing DNS fixes it.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'policies', label: 'Ingress policies', type: 'choice', sample: base.policies, options: POLICIES },
      { name: 'egress', label: 'Lock down frontend egress', type: 'choice', sample: base.egress, options: ON_OFF },
      { name: 'dns', label: 'Allow DNS', type: 'choice', sample: base.dns, options: ON_OFF },
    ],
    presets: [
      { label: 'No policies: all traffic flows', values: base },
      { label: 'Default deny blocks everything', values: { ...base, policies: 'default deny' } },
      { label: 'Allow frontend to api', values: allowed },
      { label: 'Egress deny breaks DNS', values: { policies: 'deny + allow frontend→api, api→db', egress: 'on', dns: 'off' } },
      { label: 'Allowing DNS fixes it', values: { policies: 'deny + allow frontend→api, api→db', egress: 'on', dns: 'on' } },
    ],
    generate: networkPoliciesSteps,
    codeLabel: 'Pseudocode',
  },
  code: networkPoliciesCode,
  prosCons: {
    pros: ['Limits what a compromised pod can reach', 'Rules follow labels, not IP addresses', 'Default deny plus small allows is easy to reason about'],
    cons: ['Dropped traffic looks like a timeout, which is hard to debug', 'Only works with a CNI plugin that enforces it', 'Egress rules must remember DNS'],
    useWhen: ['Any cluster shared by several apps or teams', 'Protecting databases and internal APIs'],
    avoidWhen: ['As the only security layer: combine with authentication between services'],
  },
  applications: [
    'A default-deny policy in every namespace, then one allow per real dependency',
    'Allowing only the ingress controller to reach web pods',
    'kubectl describe networkpolicy shows what a policy selects and allows',
  ],
  commonMistakes: [
    'Locking down egress and forgetting DNS.',
    'Expecting policies to work on a CNI that doesn\'t enforce them.',
    'Thinking a policy can deny: rules only allow, and isolation comes from being selected.',
    'Reading a timeout as a network fault instead of a policy drop.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Policies: default-deny and api-from-frontend. debug now calls api. What happens?',
      view: beforeDebug.view,
      options: ['The packets are dropped: debug times out', 'It succeeds: debug is not selected by any policy', 'It gets "connection refused"', 'api-from-frontend is deleted'],
      answer: 0,
      explanation: 'api is selected, so only frontend may connect. Dropped packets mean a timeout, not a refusal.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which policy is a default deny for incoming traffic?',
      options: ['podSelector {}, policyTypes [Ingress], no ingress rules', 'podSelector {} with ingress from {}', 'A policy with action: Deny', 'No policy at all'],
      answer: 0,
      explanation: 'It selects every pod and allows nothing. Kubernetes NetworkPolicies have no deny action.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'frontend may only talk to api. Which line makes its requests fail before reaching api?',
      code: "if (!out.some(allowsDns)) drop()\nif (!out.some((p) => allowsTo(p, to))) drop()",
      options: ['if (!out.some(allowsDns)) drop()', 'if (!out.some((p) => allowsTo(p, to))) drop()', 'Neither', 'Both at once'],
      answer: 0,
      explanation: 'Before connecting, frontend must look up "api". Its egress allows only api, not DNS.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Two policies select api: one allows frontend, the other allows debug. Who can reach api?',
      options: ['Both frontend and debug', 'Only frontend: the first policy wins', 'Neither: they conflict', 'Everyone'],
      answer: 0,
      explanation: 'Rules add up across every policy that selects the pod.',
    },
  ],
  summary: [
    'Pods are open until a NetworkPolicy selects them.',
    'Selected pods accept only what some policy\'s rules allow; rules add up.',
    'Denied traffic is dropped, so clients see timeouts.',
    'Egress policies must allow DNS.',
  ],
};

export default content;
