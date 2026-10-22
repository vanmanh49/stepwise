import type { ReactNode } from 'react';
import { Button } from './Button';

/** "Try:" chips that load an example. `leading` (usually the Run button) comes first, set apart by a divider. */
export function PresetRow({ presets, leading }: { presets: readonly { label: string; onSelect(): void }[]; leading?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      {presets.length > 0 && (
        <>
          {leading && <span aria-hidden className="mx-1 h-6 w-px bg-border" />}
          <span className="text-sm text-muted">Try:</span>
          {presets.map((preset) => (
            <Button key={preset.label} onClick={preset.onSelect}>
              {preset.label}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
