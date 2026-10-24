import type { ReactNode } from 'react';
import type { ClusterView, Role } from '../../../types/visualization';
import { ROLE_META, roleBoxStyle } from '../roles';
import { Meter, ScoringTable, TrafficStrip } from './ClusterParts';
import { EventLog } from './EventLog';
import { RequestStatus } from './RequestStatus';

type NodeBoxView = ClusterView['nodes'][number];
type PodView = NodeBoxView['pods'][number];

/** A role-styled chip: the role's mark first, so states never depend on colour alone. */
function Chip({ role, children, title }: { role: Role; children: ReactNode; title?: string }) {
  const mark = ROLE_META[role].mark;
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-tight" style={roleBoxStyle(role)}>
      {mark && <span aria-hidden="true">{mark}</span>}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

function ControlPlane({ components }: { components: ClusterView['controlPlane'] }) {
  if (components.length === 0) return null;
  return (
    <section aria-label="Control plane" className="rounded-lg border border-border p-2">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Control plane</h3>
      <ul className="flex flex-wrap gap-1.5">
        {components.map((c) => (
          <li key={c.id}>
            <Chip role={c.role}>
              {c.label}
              {c.badge && <strong className="ml-1">· {c.badge}</strong>}
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PodChip({ pod }: { pod: PodView }) {
  return (
    <li>
      <Chip role={pod.role} title={`${pod.name}: ${pod.phase}${pod.ready ? ', ready' : ''}`}>
        {pod.name}
        <span className="block text-[10px] opacity-80">
          {pod.phase}
          {pod.ready ? ' · ready' : ''}
          {pod.badge && ` · ${pod.badge}`}
          {pod.qos && ` · ${pod.qos}`}
        </span>
        {pod.note && <strong className="block text-[10px]">{pod.note}</strong>}
        {pod.cpu && (
          <Meter
            label={`${pod.name} CPU use`}
            used={pod.cpu.used}
            max={Math.max(pod.cpu.limit ?? 0, pod.cpu.request ?? 0, pod.cpu.used, 1)}
            limit={pod.cpu.limit}
            text={`${pod.cpu.used}m${pod.cpu.request !== undefined ? `/${pod.cpu.request}m` : ''}`}
          />
        )}
      </Chip>
    </li>
  );
}

function NodeBox({ node }: { node: NodeBoxView }) {
  const status = node.booting ? '… booting' : !node.ready ? '✕ NotReady' : node.offline ? '… no heartbeats' : node.cordoned ? 'Ready · cordoned' : 'Ready';
  const badges = [...(node.labels ?? []), ...(node.taints ?? [])];
  return (
    <section aria-label={`${node.name}, ${status}`} className="flex min-w-0 flex-col gap-2 rounded-lg border-2 p-2" style={roleBoxStyle(node.role)}>
      <header className="flex items-baseline justify-between gap-2 font-mono text-xs">
        <span className="font-semibold">{node.name}</span>
        <span className="text-[11px]">{status}</span>
      </header>
      {badges.length > 0 && (
        <ul aria-label={`${node.name} labels and taints`} className="flex flex-wrap gap-1 font-mono text-[10px]">
          {badges.map((b) => (
            <li key={b} className="rounded border border-current px-1 opacity-80">
              {b}
            </li>
          ))}
        </ul>
      )}
      {node.pods.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {node.pods.map((pod) => (
            <PodChip key={pod.name} pod={pod} />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] opacity-70">No pods</p>
      )}
      <div className="mt-auto flex flex-col gap-1">
        <Meter label={`${node.name} CPU requested`} used={node.cpu.used} max={node.cpu.capacity} text={`${node.cpu.used}/${node.cpu.capacity} CPU`} />
        {node.memory && <Meter label={`${node.name} memory used`} used={node.memory.used} max={node.memory.capacity} text={`${node.memory.used}/${node.memory.capacity} MiB`} />}
      </div>
    </section>
  );
}

function PendingTray({ pods }: { pods: ClusterView['pending'] }) {
  if (pods.length === 0) return null;
  return (
    <section aria-label="Pending pods" className="rounded-lg border border-dashed border-border p-2">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Not on a node yet</h3>
      <ul className="flex flex-wrap gap-1">
        {pods.map((pod) => (
          <li key={pod.name}>
            <Chip role={pod.role}>
              {pod.name}
              <span className="block text-[10px] opacity-80">
                Pending{pod.badge && ` · ${pod.badge}`}
                {pod.reason && ` · ${pod.reason}`}
              </span>
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ObjectsTable({ objects }: { objects: ClusterView['objects'] }) {
  if (objects.length === 0) return null;
  const cell = 'py-1 pr-2';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-collapse text-left font-mono text-xs">
        <caption className="sr-only">Each object: how many pods it wants, has and has ready</caption>
        <thead>
          <tr className="text-muted">
            {['Kind', 'Name', 'Desired', 'Current', 'Ready', 'Note'].map((h) => (
              <th key={h} scope="col" className="pb-1 pr-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {objects.map((o) => (
            <tr key={`${o.kind}/${o.name}`} className="border-t border-border">
              <td className={cell}>{o.kind}</td>
              <td className={`${cell} whitespace-nowrap`}>
                <Chip role={o.role}>{o.name}</Chip>
              </td>
              <td className={cell}>{o.desired ?? ''}</td>
              <td className={cell}>{o.current ?? ''}</td>
              <td className={cell}>{o.ready ?? ''}</td>
              <td className={`${cell} whitespace-nowrap text-muted`}>{o.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestList({ requests }: { requests: NonNullable<ClusterView['requests']> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse text-left font-mono text-xs">
        <caption className="sr-only">Each request, the pod kube-proxy sent it to, and its status</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pb-1 pr-2 font-semibold">#</th>
            <th scope="col" className="pb-1 pr-2 font-semibold">Request</th>
            <th scope="col" className="pb-1 pr-2 font-semibold">Pod</th>
            <th scope="col" className="pb-1 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="py-1 pr-2">{r.id}</td>
              <td className="whitespace-nowrap py-1 pr-2">{r.label}</td>
              <td className="break-all py-1 pr-2 text-muted">{r.endpoint ?? '—'}</td>
              <td className="py-1">
                <RequestStatus status={r.status} />
                {r.reason && <div className="mt-0.5 font-sans text-[11px] text-muted">{r.reason}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The control plane, worker nodes with their pods, pods waiting for a node, the objects being reconciled, requests and a short log. */
export function ClusterRenderer({ view }: { view: ClusterView }) {
  return (
    <div className="flex w-full max-w-full flex-col gap-3">
      <ControlPlane components={view.controlPlane} />
      {view.traffic && <TrafficStrip traffic={view.traffic} />}
      {view.nodes.length > 0 && (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
          {view.nodes.map((node) => (
            <NodeBox key={node.name} node={node} />
          ))}
        </div>
      )}
      <PendingTray pods={view.pending} />
      {view.scoring && <ScoringTable scoring={view.scoring} />}
      <ObjectsTable objects={view.objects} />
      {view.requests && <RequestList requests={view.requests} />}
      <EventLog lines={view.log} />
    </div>
  );
}
