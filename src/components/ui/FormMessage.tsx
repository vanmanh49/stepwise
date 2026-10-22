import type { ReactNode } from 'react';

/** Help text under a field or form, replaced by the error (announced to screen readers) when there is one. */
export function FormMessage({ id, error, size = 'sm', children }: { id: string; error?: string; size?: 'sm' | 'xs'; children?: ReactNode }) {
  const text = size === 'xs' ? 'text-xs leading-snug' : 'text-sm';
  if (error) {
    return (
      <p id={id} role="alert" className={`${text} font-medium text-danger`}>
        {error}
      </p>
    );
  }
  if (children === undefined) return null;
  return (
    <p id={id} className={`${text} text-muted`}>
      {children}
    </p>
  );
}
