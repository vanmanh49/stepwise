import type { FormField } from '../../../types/lesson';

/** Phone keyboard for a form field. Numeric keypads may lack a comma or space, so lists use text. */
export function inputModeFor(type: Exclude<FormField['type'], 'choice'>): 'numeric' | 'text' {
  return type === 'number' ? 'numeric' : 'text';
}
