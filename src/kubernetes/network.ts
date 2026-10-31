import type { NetworkPolicy, Pod, RuleTable } from './model';
import { formatSelector, matches } from './selector';

type Verdict = { ok: true; allowedBy: string[] } | { ok: false; stage: 'dns' | 'egress' | 'ingress'; policies: string[] };

const selecting = (policies: NetworkPolicy[], type: 'Ingress' | 'Egress', pod: Pod) => policies.filter((p) => p.policyTypes.includes(type) && matches(p.podSelector, pod.labels));

/** The traffic check alone, before any endpoint is picked: a source isolated for egress needs a rule that allows DNS. */
export function dnsAllowed(policies: NetworkPolicy[], from: Pod): { ok: true } | { ok: false; policies: string[] } {
  const egress = selecting(policies, 'Egress', from);
  return egress.length === 0 || egress.some((p) => (p.egress ?? []).some((r) => r.dns)) ? { ok: true } : { ok: false, policies: egress.map((p) => p.name) };
}

/**
 * Whether NetworkPolicies let `from` reach `to`. A pod no policy selects (for that direction) is open; once selected it
 * accepts only what some selecting policy's rules allow, and rules add up across policies.
 */
export function checkTraffic(policies: NetworkPolicy[], from: Pod, to: Pod): Verdict {
  const dns = dnsAllowed(policies, from);
  if (!dns.ok) return { ok: false, stage: 'dns', policies: dns.policies };
  const allowedBy: string[] = [];
  const egress = selecting(policies, 'Egress', from);
  if (egress.length > 0) {
    const allowing = egress.filter((p) => (p.egress ?? []).some((r) => r.to.some((s) => matches(s, to.labels))));
    if (allowing.length === 0) return { ok: false, stage: 'egress', policies: egress.map((p) => p.name) };
    allowedBy.push(...allowing.map((p) => p.name));
  }
  const ingress = selecting(policies, 'Ingress', to);
  if (ingress.length > 0) {
    const allowing = ingress.filter((p) => (p.ingress ?? []).some((r) => r.from.some((s) => matches(s, from.labels))));
    if (allowing.length === 0) return { ok: false, stage: 'ingress', policies: ingress.map((p) => p.name) };
    allowedBy.push(...allowing.map((p) => p.name));
  }
  return { ok: true, allowedBy };
}

const selectorText = (s: Parameters<typeof formatSelector>[0]) => (s.length === 0 ? 'all pods' : formatSelector(s));

/** Every policy as a table row: what it selects and what it allows, with the deciding policies marked. */
export function policyRows(policies: NetworkPolicy[], verdict?: Verdict): RuleTable {
  const rows = policies.map((p) => {
    const allows = [
      ...(p.ingress ?? []).flatMap((r) => r.from.map((s) => `from ${selectorText(s)}`)),
      ...(p.egress ?? []).flatMap((r) => [...r.to.map((s) => `to ${selectorText(s)}`), ...(r.dns ? ['DNS'] : [])]),
    ];
    const mark: RuleTable['rows'][number]['mark'] = !verdict ? undefined : verdict.ok ? (verdict.allowedBy.includes(p.name) ? 'match' : undefined) : verdict.policies.includes(p.name) ? 'deny' : undefined;
    return { cells: [p.name, selectorText(p.podSelector), p.policyTypes.join(', '), allows.join('; ') || 'nothing'], ...(mark && { mark }) };
  });
  return { title: 'NetworkPolicies', columns: ['Policy', 'Selects', 'Types', 'Allows'], rows };
}
