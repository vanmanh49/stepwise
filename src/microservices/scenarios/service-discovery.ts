import { readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import type { StepOptions } from '../steps';
import { client, db, GATEWAY_MS, link, scenarioSteps, service } from './shared';

export const serviceDiscoveryCode = `// Each instance, when it starts and then on every beat
function register(instance) {
  registry.add(instance)
}
function onHeartbeat(instance) {
  lastSeen[instance] = now
}

// The registry, on every tick
function evictExpired() {
  for (const instance of registry) {
    if (now - lastSeen[instance] > ttl) registry.remove(instance)
  }
}

// The client, before every request
function lookup(service) {
  return registry.instancesOf(service) // only the recently seen ones
}
const instance = next(lookup("orders")) // take them in turn`;

interface Settings {
  instances: number;
  heartbeat: number;
  ttl: number;
  dies: number;
}

function read(values: Record<string, string>): Read<Settings> {
  const instances = readInt(values, 'instances', 'Instances', { min: 1, max: 4 });
  if (!instances.ok) return instances;
  const heartbeat = readInt(values, 'heartbeat', 'Heartbeat interval', { min: 10, max: 100 });
  if (!heartbeat.ok) return heartbeat;
  const ttl = readInt(values, 'ttl', 'TTL', { min: 20, max: 300 });
  if (!ttl.ok) return ttl;
  const dies = readInt(values, 'dies', 'Dies at', { min: 0, max: 400 });
  if (!dies.ok) return dies;
  if (ttl.value < heartbeat.value) {
    return {
      ok: false,
      why: `The TTL (${ttl.value} ms) must be at least the heartbeat interval (${heartbeat.value} ms), or the registry would drop live instances between heartbeats.`,
    };
  }
  return { ok: true, value: { instances: instances.value, heartbeat: heartbeat.value, ttl: ttl.value, dies: dies.value } };
}

export function serviceDiscoveryScenario(values: Record<string, string>): Read<Scenario> {
  const settings = read(values);
  if (!settings.ok) return settings;
  const { instances, heartbeat, ttl, dies } = settings.value;
  return {
    ok: true,
    value: {
      nodes: [
        client({ discovery: { registry: 'registry', service: 'orders' } }),
        { id: 'registry', label: 'registry', type: 'registry', column: 1, processMs: GATEWAY_MS, heartbeatMs: heartbeat, ttlMs: ttl, serves: ['orders'] },
        // The registry sits above orders in the same column, so no link has to cross a box.
        service('orders', 1, ['orders-db'], { count: instances }),
        db('orders-db', 2),
      ],
      links: [link('client', 'registry'), link('client', 'orders'), link('orders', 'registry'), link('orders', 'orders-db')],
      requests: Array.from({ length: 10 }, (_, i) => ({ label: 'GET /orders', path: '/orders', to: 'orders', at: 10 + 15 * i })),
      faults: dies > 0 ? [{ kind: 'kill', instance: `orders-${instances}`, at: dies }] : [],
    },
  };
}

export function serviceDiscoverySteps(values: Record<string, string>): Step[] {
  const settings = read(values);
  const options: StepOptions = {
    code: serviceDiscoveryCode,
    lines: {
      register: 'function register(',
      heartbeat: 'function onHeartbeat(',
      evict: 'function evictExpired(',
      lookup: 'function lookup(',
      done: 'const instance = next(',
      handle: 'const instance = next(',
      fault: 'function onHeartbeat(',
    },
    explain: (event) => {
      if (event.kind === 'send') {
        const m = event.message;
        if (m.kind === 'lookup') return { line: 'function lookup(' };
        if (m.from === 'client') return { line: 'const instance = next(', why: `The client takes the next instance from the list the registry just gave it: ${m.to}.` };
        return { line: 'const instance = next(' };
      }
      if (event.kind === 'fault' && event.fault.kind === 'kill' && settings.ok) {
        return { why: `${event.fault.instance} has died and stops sending heartbeats. The registry doesn't know yet: it keeps listing ${event.fault.instance} until its last heartbeat is more than ${settings.value.ttl} ms old.` };
      }
      if (event.kind === 'fail' && event.reason.endsWith('refused the connection') && settings.ok) {
        return { why: `${event.at} is dead, but the registry still listed it when the client looked it up. Until eviction, requests can still be sent to it and fail.` };
      }
      return undefined;
    },
  };
  return scenarioSteps(serviceDiscoveryScenario(values), 'Check the settings', options);
}
