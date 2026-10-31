import { KEYS, labelsSelectorsCode, labelsSelectorsSteps, OPERATORS } from '../../kubernetes/scenarios/labels-selectors';
import type { LessonContent } from '../../types/lesson';

const web = { key: 'app', op: '=', values: 'web' };
const notProd = { key: 'env', op: '!=', values: 'prod' };

// Just before web-c3 (which has no env label) is checked against env!=prod.
const steps = labelsSelectorsSteps(notProd);
const beforeC3 = steps[steps.findIndex((s) => s.title.startsWith('web-c3')) - 1]!;

const content: LessonContent = {
  overview:
    'Kubernetes objects find each other by labels, not by name. A label is a key=value tag on an object, and a selector is a rule that picks every object whose labels fit. This lesson checks one selector against six labelled pods, one pod at a time.',
  concept: [
    'Labels are short key=value pairs you put on objects, such as app=web or env=prod. They mean nothing to Kubernetes on their own; you choose them.',
    'A selector picks objects by their labels. Equality selectors use = and != (app=web, env!=prod). Set selectors use in, notin and exists (tier in (fe,be), track).',
    'A Service sends traffic to the pods its selector matches, a ReplicaSet counts the pods its selector matches, and kubectl get pods -l app=web lists them. Pods can come and go; the selector keeps finding the right ones.',
    'A pod without the label does not match =, in or exists, but it does match != and notin. And a selector with a typo matches nothing, without any error.',
  ],
  howItWorks: [
    'Six pods run on two nodes, each with a few labels (shown on the pod).',
    'Choose a label key, an operator and the values to compare with.',
    'Each step checks one pod, in name order, and says which label decided.',
    'The last step counts the pods that match: the ones a Service or ReplicaSet with this selector would use.',
    'Try the typo preset: app=wbe matches no pod at all, and nothing warns you.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'key', label: 'Label key', type: 'choice', sample: web.key, options: KEYS },
      { name: 'op', label: 'Operator', type: 'choice', sample: web.op, options: OPERATORS },
      { name: 'values', label: 'Values', type: 'text', sample: web.values, help: 'One value for = and !=, up to 3 separated by commas for in and notin; ignored for exists.' },
    ],
    presets: [
      { label: 'app=web', values: web },
      { label: 'tier in (fe,be)', values: { key: 'tier', op: 'in', values: 'fe,be' } },
      { label: 'env!=prod', values: notProd },
      { label: 'A typo', values: { ...web, values: 'wbe' } },
    ],
    generate: labelsSelectorsSteps,
    codeLabel: 'Pseudocode',
  },
  code: labelsSelectorsCode,
  prosCons: {
    pros: ['Objects stay loosely coupled: a Service never lists pod names', 'New pods with the right labels are picked up at once', 'One pod can belong to several groups through different labels'],
    cons: ['A typo in a selector fails silently: it simply matches nothing', 'Two workloads with overlapping labels can steal each other\'s pods', 'Labels are free text, so teams need naming rules'],
    useWhen: ['Connecting Services and controllers to the pods they manage', 'Filtering objects with kubectl get -l'],
    avoidWhen: ['Storing data a program reads but never selects on: use annotations instead'],
  },
  applications: [
    'A Service with selector app=web sends traffic to every web pod',
    'A ReplicaSet uses its selector to count the pods it owns',
    'kubectl get pods -l env=prod,tier=fe lists matching pods',
  ],
  commonMistakes: [
    'A selector that doesn\'t match the pod template\'s labels, so a Service has no endpoints.',
    'Forgetting that != and notin also match pods that don\'t have the label at all.',
    'Reusing the same labels for two different apps, so one selector picks pods from both.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The selector is env!=prod. Next, web-c3 is checked. Its labels are app=web, tier=fe, track=canary. Does it match?',
      view: beforeC3.view,
      options: ['Yes: it has no env label, and a missing label counts as not equal', 'No: a pod without the label never matches', 'No: env!=prod only matches env=dev', 'The selector is refused'],
      answer: 0,
      explanation: 'The pod has no env label at all. A missing value is not equal to prod, so != matches it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A Service has the selector app=wbe (a typo). The pods are labelled app=web. What happens?',
      options: ['The Service matches no pods and gets no endpoints, with no error', 'Kubernetes corrects the typo', 'kubectl refuses to create the Service', 'The Service matches every pod'],
      answer: 0,
      explanation: 'A selector is only a filter. No pod has app=wbe, so nothing matches, and nothing reports it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes tier in (fe,be) reject a pod?',
      code: "if (req.op === 'in' && !req.values.includes(value)) return false",
      options: ['The in line: the pod\'s value is not in the list', 'The = line', 'The exists line', 'None: in matches every pod'],
      answer: 0,
      explanation: 'For in, the pod\'s value must be one of the listed values; otherwise matches returns false.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do Services find pods by labels instead of by name?',
      options: ['Pods are replaced with new names all the time, but keep their labels', 'Names are secret, and only the kubelet can read them', 'Labels are faster to look up than names are in etcd', 'Pods have no names'],
      answer: 0,
      explanation: 'A replacement pod gets a new generated name, but the same labels from its template, so the selector keeps finding it.',
    },
  ],
  summary: [
    'Labels are key=value tags; selectors pick objects whose labels fit.',
    'Equality selectors use = and !=; set selectors use in, notin and exists.',
    'A missing label matches != and notin, but not =, in or exists.',
    'Services and ReplicaSets find their pods with selectors, so a typo silently matches nothing.',
  ],
};

export default content;
