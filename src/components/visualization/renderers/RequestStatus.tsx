import type { Role } from '../../../types/visualization';
import { roleFill, roleText } from '../roles';

const STATUS: Record<'pending' | 'ok' | 'failed', { text: string; role: Role }> = {
  pending: { text: 'in progress', role: 'frontier' },
  ok: { text: 'ok', role: 'found' },
  failed: { text: 'failed', role: 'discarded' },
};

/** A request's status as a role-coloured chip. */
export function RequestStatus({ status }: { status: keyof typeof STATUS }) {
  const { text, role } = STATUS[status];
  return (
    <span className="rounded px-1.5 py-0.5" style={{ background: roleFill(role), color: roleText(role) }}>
      {text}
    </span>
  );
}
