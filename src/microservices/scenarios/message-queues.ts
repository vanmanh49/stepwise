import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario, TraceEvent } from '../model';
import type { StepOptions } from '../steps';
import { broker, client, link, scenarioSteps, service } from './shared';

export const messageQueuesCode = `// Producer: hand the job over and move on
async function upload(image) {
  await queue.push(job)                 // stored: the producer is done
  return accepted
}

// Worker: one job at a time, oldest first
async function work() {
  while (true) {
    const job = await worker.receive(queue)
    try {
      await resize(job)
      ack(job)                          // done: remove it for good
    } catch (err) {
      queue.unshift(job)                // put it back and try again later
    }
  }
}`;

const GAP_MS = 20;
const WORK_MS = 60;
const OUTAGE = { from: 30, until: 230 };

interface Settings {
  queue: boolean;
  workers: number;
  jobs: number;
  outage: boolean;
}

function read(values: Record<string, string>): Read<Settings> {
  const style = readChoice(values, 'style', 'Style', ['sync', 'queue']);
  if (!style.ok) return style;
  const workers = readInt(values, 'workers', 'Workers', { min: 1, max: 3 });
  if (!workers.ok) return workers;
  const jobs = readInt(values, 'jobs', 'Jobs', { min: 1, max: 10 });
  if (!jobs.ok) return jobs;
  const outage = readChoice(values, 'outage', 'Worker outage', ['off', 'on']);
  if (!outage.ok) return outage;
  return { ok: true, value: { queue: style.value === 'queue', workers: workers.value, jobs: jobs.value, outage: outage.value === 'on' } };
}

export function messageQueuesScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { queue, workers, jobs, outage } = settings.value;
  const worker = service('worker', queue ? 2 : 1, [], { count: workers, processMs: WORK_MS });
  const first = queue ? 'jobs' : 'worker';
  return {
    ok: true,
    value: {
      nodes: queue ? [client(), broker('jobs', 1, 'queue', ['worker']), worker] : [client(), worker],
      links: queue ? [link('client', 'jobs'), link('jobs', 'worker')] : [link('client', 'worker')],
      requests: Array.from({ length: jobs }, (_, i) => ({ label: 'POST /resize', path: '/resize', to: first, at: i * GAP_MS })),
      faults: outage ? [{ kind: 'outage', node: 'worker', from: OUTAGE.from, until: OUTAGE.until, mode: 'refuse' }] : [],
    },
  };
}

/** How many messages wait in the broker's queues after each change. */
export function queueDepths(trace: TraceEvent[]): { t: number; waiting: number }[] {
  let waiting = 0;
  return trace.flatMap((e) => {
    if (e.kind === 'store') waiting += e.queues.length;
    else if (e.kind === 'send' && e.message.kind === 'deliver') waiting--;
    else if (e.kind === 'requeue') waiting++;
    else return [];
    return [{ t: e.t, waiting }];
  });
}

export function messageQueuesSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(messageQueuesScenario(values), 'Check the settings', (result): StepOptions => {
    const depths = queueDepths(result.trace);
    return {
      code: messageQueuesCode,
      lines: { store: 'queue.push(job)', handle: 'await resize(job)', delivered: 'ack(job)', requeue: 'queue.unshift(job)', done: 'return accepted' },
      explain: (event) => {
        if (event.kind === 'send' && event.message.kind === 'deliver') return { line: 'worker.receive(' };
        if (event.kind === 'send' && event.message.kind === 'request') return { line: 'async function upload(' };
        return undefined;
      },
      variables: (event): Record<string, number> => (depths.length > 0 ? { waiting: depths.filter((d) => d.t <= event.t).at(-1)?.waiting ?? 0 } : {}),
    };
  });
}
