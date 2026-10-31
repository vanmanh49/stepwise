import type { CSSProperties } from 'react';
import type { Role, View } from '../../types/visualization';

type Cue = 'solid' | 'dashed' | 'double' | 'ring';

/**
 * The single source of role styling. Every role has a colour (CSS tokens),
 * a border cue and usually a mark, so states never depend on colour alone.
 */
export const ROLE_META: Record<Role, { label: string; cue: Cue; mark?: string }> = {
  default: { label: 'Untouched', cue: 'solid' },
  active: { label: 'Current', cue: 'ring', mark: '▸' },
  compare: { label: 'Comparing', cue: 'dashed', mark: '?' },
  swap: { label: 'Moving', cue: 'double', mark: '⇄' },
  sorted: { label: 'Sorted', cue: 'solid', mark: '✓' },
  found: { label: 'Found / placed', cue: 'double', mark: '★' },
  visited: { label: 'Visited', cue: 'solid', mark: '•' },
  frontier: { label: 'Waiting', cue: 'dashed', mark: '…' },
  discarded: { label: 'Ruled out', cue: 'dashed', mark: '×' },
  pivot: { label: 'Pivot', cue: 'ring', mark: 'P' },
};

export const roleFill = (role: Role) => `var(--role-${role})`;
export const roleText = (role: Role) => `var(--role-${role}-fg)`;
/** A border that stays visible against the fill in both themes. */
export const roleBorder = (role: Role) =>
  role === 'default' ? 'var(--border)' : `color-mix(in oklab, var(--role-${role}) 62%, var(--text))`;

export function roleBoxStyle(role: Role): CSSProperties {
  const { cue } = ROLE_META[role];
  return {
    background: roleFill(role),
    color: roleText(role),
    borderColor: roleBorder(role),
    borderStyle: cue === 'dashed' ? 'dashed' : cue === 'double' ? 'double' : 'solid',
    borderWidth: cue === 'double' ? 4 : 2,
    ...(cue === 'ring' && { boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${roleFill(role)}` }),
  };
}

const ORDER = Object.keys(ROLE_META) as Role[];

export function rolesInView(view: View): Role[] {
  switch (view.kind) {
    case 'array':
      return [...view.cells, ...(view.aux?.cells ?? [])].map((c) => c.role);
    case 'linked-list':
      return view.nodes.map((c) => c.role);
    case 'stack':
    case 'queue':
    case 'heap':
      return view.items.map((c) => c.role);
    case 'tree':
      return view.nodes.map((n) => n.role);
    case 'graph':
      return [...view.nodes.map((n) => n.role), ...view.edges.map((e) => e.role)];
    case 'table':
      return [...view.tables.flatMap((t) => t.rows.map((r) => r.role)), ...(view.index ? rolesInView(view.index) : [])];
    case 'btree':
      return view.nodes.flatMap((n) => [n.role, ...(n.matched.length > 0 ? ['found' as const] : [])]);
    case 'sessions':
      return view.tables.flatMap((t) => t.rows.map((r) => r.role));
    case 'grid':
      return view.rows.flatMap((r) => r.cells.flatMap((c) => (c ? [c.role] : [])));
    case 'calls':
      return view.frames.map((f) => f.role);
    case 'trie':
      return view.nodes.map((n) => n.role);
    case 'buckets':
      return [...(view.input?.cells ?? []), ...view.buckets.flatMap((b) => b.cells)].map((c) => c.role);
    case 'services':
      return [
        ...view.nodes.flatMap((n) => [n.role, ...(n.instances ?? []).map((i) => i.role)]),
        ...view.links.map((l) => l.role),
        ...view.messages.map((m) => m.role),
        ...view.requests.flatMap((r): Role[] => (r.status === 'ok' ? ['found'] : r.status === 'failed' ? ['discarded'] : [])),
        ...(view.spans?.rows.map((r) => r.role) ?? []),
      ];
    case 'cluster':
      return [
        ...view.controlPlane.map((c) => c.role),
        ...view.nodes.flatMap((n) => [n.role, ...n.pods.map((p) => p.role)]),
        ...view.pending.map((p) => p.role),
        ...view.objects.map((o) => o.role),
        ...(view.requests ?? []).flatMap((r): Role[] => (r.status === 'ok' ? ['found'] : r.status === 'failed' ? ['discarded'] : [])),
        ...(view.scoring?.rows.map((r) => r.role) ?? []),
        ...(view.rules?.rows.map((r) => r.role) ?? []),
      ];
    case 'distribution':
      return view.bars.map((b) => b.role);
    case 'ladder':
      return view.rows.map((r) => r.role);
    case 'chart':
      return view.lines.map((l) => l.role);
    case 'panels':
      return view.panels.flatMap((p) => rolesInView(p.view));
  }
}

/** Roles used anywhere in a run, in a stable order, without the default role. */
export function rolesInRun(views: View[]): Role[] {
  const used = new Set(views.flatMap(rolesInView));
  return ORDER.filter((role) => role !== 'default' && used.has(role));
}
