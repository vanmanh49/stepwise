import { createContext, use, useId } from 'react';

export interface FieldControl {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export const FieldContext = createContext<FieldControl | null>(null);

/**
 * The id and aria attributes a control needs. Inside a Field they come from the Field;
 * the control's own props win, and outside a Field they are all there is.
 */
export function useFieldControl(own: { id?: string; describedBy?: string; invalid?: boolean }) {
  const field = use(FieldContext);
  const fallback = useId();
  return {
    id: own.id ?? field?.id ?? fallback,
    'aria-describedby': own.describedBy ?? field?.describedBy,
    'aria-invalid': (own.invalid ?? field?.invalid) || undefined,
  };
}
