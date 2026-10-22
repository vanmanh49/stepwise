import type { ReactNode } from 'react';

/** An even grid of Fields: every control fills its cell and starts at the same height, whatever help text sits below. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] items-start gap-x-4 gap-y-3">{children}</div>;
}
