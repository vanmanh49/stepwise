import type { Role } from '../../types/visualization';
import { ROLE_META, roleBoxStyle } from './roles';

export function Legend({ roles }: { roles: Role[] }) {
  if (roles.length === 0) return null;
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      {roles.map((role) => (
        <li key={role} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold leading-none"
            style={{ ...roleBoxStyle(role), borderWidth: 2, boxShadow: undefined }}
          >
            {ROLE_META[role].mark}
          </span>
          {ROLE_META[role].label}
        </li>
      ))}
    </ul>
  );
}
