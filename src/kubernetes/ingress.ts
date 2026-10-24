import type { Ingress, IngressPath, RuleTable } from './model';

export interface IngressMatch {
  service: string;
  rule: { ingress: string; host?: string; path: string; pathType: IngressPath['pathType'] } | 'default';
}

/** Prefix matches whole path elements: /api matches /api and /api/cart, not /apiary. */
function pathMatches(p: IngressPath, path: string): boolean {
  if (p.pathType === 'Exact') return p.path === path;
  const want = p.path.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  return want.every((segment, i) => got[i] === segment);
}

/**
 * Where an Ingress controller sends a request: rules for the request's host (or, when none names it, rules with no
 * host); among their paths the longest match, Exact before Prefix at equal length; else the default backend.
 */
export function matchIngress(ingresses: Ingress[], host: string, path: string): IngressMatch | undefined {
  const rules = ingresses.flatMap((ing) => ing.rules.map((r) => ({ ing: ing.name, ...r })));
  const named = rules.filter((r) => r.host === host);
  const candidates = (named.length > 0 ? named : rules.filter((r) => !r.host))
    .flatMap((r) => r.paths.filter((p) => pathMatches(p, path)).map((p) => ({ ingress: r.ing, ...(r.host && { host: r.host }), ...p })))
    .toSorted((a, b) => b.path.length - a.path.length || (a.pathType === b.pathType ? 0 : a.pathType === 'Exact' ? -1 : 1));
  const best = candidates[0];
  if (best) return { service: best.service, rule: { ingress: best.ingress, ...(best.host && { host: best.host }), path: best.path, pathType: best.pathType } };
  const fallback = ingresses.find((i) => i.defaultBackend)?.defaultBackend;
  return fallback ? { service: fallback, rule: 'default' } : undefined;
}

/** Every Ingress rule as a table row, with the one that matched marked. */
export function ingressRows(ingresses: Ingress[], match: IngressMatch | undefined): RuleTable {
  const rows: RuleTable['rows'] = [];
  for (const ing of ingresses) {
    for (const r of ing.rules) {
      for (const p of r.paths) {
        const hit = match && match.rule !== 'default' && match.rule.ingress === ing.name && match.rule.host === r.host && match.rule.path === p.path && match.rule.pathType === p.pathType;
        rows.push({ cells: [r.host ?? '*', p.path, p.pathType, p.service], ...(hit && { mark: 'match' as const }) });
      }
    }
    if (ing.defaultBackend) rows.push({ cells: ['(default)', '', '', ing.defaultBackend], ...(match?.rule === 'default' && { mark: 'match' as const }) });
  }
  return { title: 'Ingress rules', columns: ['Host', 'Path', 'Type', 'Service'], rows };
}
