import type { ClusterView } from '../../../types/visualization';
import { ROLE_META, roleBoxStyle } from '../roles';

/** Rules that decided a step (Ingress paths, NetworkPolicies): one row each, the deciding row in its role's colours and mark. */
export function RuleTable({ rules }: { rules: NonNullable<ClusterView['rules']> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] border-collapse text-left font-mono text-xs">
        <caption className="mb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{rules.title}</caption>
        <thead>
          <tr className="text-muted">
            {rules.columns.map((c) => (
              <th key={c} scope="col" className="pb-1 pr-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.rows.map((r) => (
            <tr key={r.cells.join('|')} className="border-t border-border align-top" style={r.role === 'default' ? undefined : roleBoxStyle(r.role)}>
              {r.cells.map((cell, i) => (
                <td key={i} className="py-1 pr-2 [overflow-wrap:anywhere]">
                  {i === 0 && ROLE_META[r.role].mark && <span aria-hidden="true">{ROLE_META[r.role].mark} </span>}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
