import type { ReactNode } from 'react';

/** A chip that switches something on or off; several can be on at once. Off chips are dashed and faded. */
export function ToggleChip({ pressed, onToggle, children }: { pressed: boolean; onToggle(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 font-mono text-sm transition-colors ${
        pressed ? 'border-border bg-surface' : 'border-dashed border-border text-muted opacity-60'
      }`}
    >
      {children}
    </button>
  );
}
