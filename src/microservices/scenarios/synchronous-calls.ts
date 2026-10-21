import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { NodeSpec, Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, link, scenarioSteps, service, serviceOf } from './shared';

export const synchronousCallsCode = `// Sequential: each service waits for the next one
async function handle(req) {
  await work()                         // this service's own time
  const answer = await call(next, req) // nothing happens until it replies
  return answer
}

// Parallel fan-out: ask every branch at once
async function handleFanOut(req) {
  await work()
  const answers = await Promise.all(branches.map((b) => call(b, req)))
  return combine(answers)              // ready when the slowest answers
}`;

const WORK_MS = 5;
const SLOW_MS = 200;

interface Settings {
  depth: number;
  hop: number;
  slow: boolean;
  parallel: boolean;
}

function read(values: Record<string, string>): Read<Settings> {
  const depth = readInt(values, 'depth', 'Depth', { min: 1, max: 4 });
  if (!depth.ok) return depth;
  const hop = readInt(values, 'hop', 'Hop latency', { min: 1, max: 50 });
  if (!hop.ok) return hop;
  const slow = readChoice(values, 'slow', 'Slow service', ['none', 'last']);
  if (!slow.ok) return slow;
  const style = readChoice(values, 'style', 'Call style', ['sequential', 'parallel']);
  if (!style.ok) return style;
  return { ok: true, value: { depth: depth.value, hop: hop.value, slow: slow.value === 'last', parallel: style.value === 'parallel' } };
}

export function synchronousCallsScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { depth, hop, slow, parallel } = settings.value;
  const time = (last: boolean) => (slow && last ? SLOW_MS : WORK_MS);
  const requests = [{ label: 'GET /page', path: '/page', to: 's1', at: 0 }];
  if (parallel) {
    const branches = Array.from({ length: depth }, (_, i) => `b${i + 1}`);
    const nodes: NodeSpec[] = [
      client(),
      service('s1', 1, branches, { processMs: WORK_MS, parallel: true }),
      ...branches.map((id, i) => service(id, 2, [], { processMs: time(i === depth - 1) })),
    ];
    return { ok: true, value: { nodes, links: [link('client', 's1', hop), ...branches.map((b) => link('s1', b, hop))], requests, faults: [] } };
  }
  const chain = Array.from({ length: depth }, (_, i) => `s${i + 1}`);
  const nodes: NodeSpec[] = [client(), ...chain.map((id, i) => service(id, i + 1, chain[i + 1] ? [chain[i + 1]!] : [], { processMs: time(i === depth - 1) }))];
  const links = ['client', ...chain].slice(0, -1).map((from, i) => link(from, chain[i]!, hop));
  return { ok: true, value: { nodes, links, requests, faults: [] } };
}

export function synchronousCallsSteps(values: Record<string, string>): Step[] {
  const settings = read(values);
  const parallel = settings.ok && settings.value.parallel;
  const options: StepOptions = {
    code: synchronousCallsCode,
    lines: { handle: 'async function handle(', done: 'return answer' },
    explain: (event) => {
      const fanOutNode = parallel && (event.kind === 'handle' ? event.node === 's1' : event.kind === 'send' && serviceOf(event.message.from) === 's1');
      if (event.kind === 'handle') return { line: fanOutNode ? 'async function handleFanOut(' : 'async function handle(' };
      if (event.kind === 'send') {
        const m = event.message;
        if (m.kind === 'reply') return { line: fanOutNode ? 'return combine(answers)' : 'return answer' };
        if (fanOutNode) return { line: 'Promise.all', why: `s1 sends to every branch at once, without waiting for the others. Crossing the network takes ${m.arrives - m.departs} ms.` };
        if (m.from !== 'client') return { line: 'await call(next, req)', why: `${m.from} can't answer until ${serviceOf(m.to)} answers it, so it waits. Crossing the network takes ${m.arrives - m.departs} ms.` };
        return undefined;
      }
      if (event.kind === 'done' && settings.ok) {
        const { depth, hop } = settings.value;
        const network = parallel ? 4 * hop : 2 * hop * depth;
        return {
          why: parallel
            ? `${network} ms on the network (to s1 and to a branch, there and back) plus s1's work and the slowest branch: the branches ran at the same time, so only the slowest one counts.`
            : `${network} ms on the network (${depth} hop${depth === 1 ? '' : 's'}, there and back) plus the work in every service: in a chain, every delay adds up.`,
        };
      }
      return undefined;
    },
  };
  return scenarioSteps(synchronousCallsScenario(values), 'Check the settings', options);
}
