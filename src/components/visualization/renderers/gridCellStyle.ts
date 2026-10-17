import type { CSSProperties } from 'react';
import type { Role } from '../../../types/visualization';
import { roleBoxStyle } from '../roles';

/**
 * Role styling for cells rendered as motion elements. Motion keeps the last value of a
 * style key that disappears, so boxShadow is always set, or an old ring would stick.
 */
export function gridCellStyle(role: Role): CSSProperties {
  return { boxShadow: 'none', ...roleBoxStyle(role) };
}
