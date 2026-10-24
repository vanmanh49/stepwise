import { readChoice, refusal, type Read } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ClusterView, Role, Step } from '../../types/visualization';
import type { Labels, Requirement, Selector } from '../model';
import { explainMatch, formatSelector } from '../selector';
import { emptyClusterView } from '../view';

export const labelsSelectorsCode = `// Does a pod match the selector?
function matches(pod, selector) {
  for (const req of selector) {
    const value = pod.labels[req.key]        // may be missing
    if (req.op === '=' && value !== req.values[0]) return false
    if (req.op === '!=' && value === req.values[0]) return false
    if (req.op === 'in' && !req.values.includes(value)) return false
    if (req.op === 'notin' && req.values.includes(value)) return false
    if (req.op === 'exists' && value === undefined) return false
  }
  return true
}

const chosen = pods.filter((pod) => matches(pod, selector))`;

export const KEYS = ['app', 'tier', 'env', 'track'];
export const OPERATORS = ['=', '!=', 'in', 'notin', 'exists'];
const VALUE = /^[a-z0-9-]{1,12}$/;

/** Six pods on two nodes, labelled so each preset tells a different story. */
const PODS: { name: string; node: string; labels: Labels }[] = [
  { name: 'api-a1', node: 'node-2', labels: { app: 'api', tier: 'be', env: 'prod' } },
  { name: 'api-b2', node: 'node-1', labels: { app: 'api', tier: 'be', env: 'prod' } },
  { name: 'db-a1', node: 'node-2', labels: { app: 'db', tier: 'be', env: 'dev' } },
  { name: 'web-a1', node: 'node-1', labels: { app: 'web', tier: 'fe', env: 'prod' } },
  { name: 'web-b2', node: 'node-2', labels: { app: 'web', tier: 'fe', env: 'dev' } },
  { name: 'web-c3', node: 'node-1', labels: { app: 'web', tier: 'fe', track: 'canary' } },
];

export function readSelector(values: Record<string, string>): Read<Selector> {
  const key = readChoice(values, 'key', 'Label key', KEYS);
  if (!key.ok) return key;
  const op = readChoice(values, 'op', 'Operator', OPERATORS);
  if (!op.ok) return op;
  if (op.value === 'exists') return { ok: true, value: [{ key: key.value, op: 'exists', values: [] }] };
  const list = (values.values ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  if (list.some((v) => !VALUE.test(v))) return { ok: false, why: 'Values use 1 to 12 lowercase letters, digits or dashes, separated by commas.' };
  const single = op.value === '=' || op.value === '!=';
  if (single && list.length !== 1) return { ok: false, why: `${op.value} takes exactly one value.` };
  if (!single && (list.length < 1 || list.length > 3)) return { ok: false, why: `${op.value} needs 1 to 3 values, separated by commas.` };
  return { ok: true, value: [{ key: key.value, op: op.value as Requirement['op'], values: list }] };
}

const labelText = (labels: Labels) => Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(', ');

function view(roles: Map<string, Role>, log: string[]): ClusterView {
  return {
    ...emptyClusterView(),
    nodes: ['node-1', 'node-2'].map((name) => {
      const pods = PODS.filter((p) => p.node === name);
      return {
        name,
        ready: true,
        role: 'default' as Role,
        cpu: { used: pods.length, capacity: 4 },
        pods: pods.map((p) => ({ name: p.name, phase: 'Running', ready: true, role: roles.get(p.name) ?? 'default', badge: labelText(p.labels) })),
      };
    }),
    log,
  };
}

const OP_LINE: Record<Requirement['op'], string> = {
  '=': "req.op === '='",
  '!=': "req.op === '!='",
  in: "req.op === 'in'",
  notin: "req.op === 'notin'",
  exists: "req.op === 'exists'",
};

/** Checks the selector against each pod in name order, then counts the matches. */
export function labelsSelectorsSteps(values: Record<string, string>): Step[] {
  const read = readSelector(values);
  if (!read.ok) return refusal("Can't use this selector", read.why, emptyClusterView());
  const selector = read.value;
  const req = selector[0]!;
  const shown = formatSelector(selector);
  const roles = new Map<string, Role>();
  const log: string[] = [];
  const steps: Step[] = [];
  const add = (title: string, why: string, line: string, matched: number, checked: number) => {
    log.push(title);
    steps.push({ title, why, codeLine: lineOf(labelsSelectorsCode, line), variables: { selector: shown, checked, matched }, view: view(new Map(roles), log.slice(-4)) });
  };

  add(`Check ${shown} against 6 pods`, 'A selector picks pods by their labels, not by name. Services, ReplicaSets and kubectl all use selectors this way.', 'const chosen', 0, 0);
  let matched = 0;
  PODS.forEach((pod, i) => {
    roles.set(pod.name, 'active');
    const { ok } = explainMatch(selector, pod.labels);
    const value = pod.labels[req.key];
    const has = value === undefined ? `${pod.name} has no ${req.key} label` : `${pod.name} has ${req.key}=${value}`;
    if (ok) matched++;
    const why = ok
      ? value === undefined
        ? `${has}, and a missing label counts as "not equal" and "not in", so the pod matches.`
        : `${has}, which satisfies ${shown}.`
      : `${has}, which fails ${shown}.`;
    add(ok ? `${pod.name} matches ${shown}` : `${pod.name} doesn't match: ${shown} fails (${value === undefined ? `no ${req.key} label` : `${req.key} is ${value}`})`, why, ok ? 'return true' : OP_LINE[req.op], matched, i + 1);
    roles.set(pod.name, ok ? 'found' : 'discarded');
  });
  add(`${matched} of 6 pods match ${shown}`, matched === 0 ? 'No pod has these labels. A Service with this selector would have no endpoints, and nothing warns you: a typo in a selector fails silently.' : 'These are the pods a Service or ReplicaSet with this selector would use.', 'const chosen', matched, 6);
  return steps;
}
