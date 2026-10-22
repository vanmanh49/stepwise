import type { ComponentProps } from 'react';
import { useFieldControl } from './fieldControl';
import { isRunShortcut } from './runShortcut';

/** A multi-line code field. `onRunShortcut` runs on Ctrl+Enter (⌘+Enter on macOS). */
export function TextArea({
  value,
  onChange,
  onRunShortcut,
  id,
  describedBy,
  invalid,
  className = '',
  ...rest
}: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onChange(value: string): void;
  onRunShortcut?(): void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const control = useFieldControl({ id, describedBy, invalid });
  return (
    <textarea
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      {...rest}
      {...control}
      className={`field w-full resize-y py-2 font-mono text-sm leading-relaxed ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (!onRunShortcut || !isRunShortcut(e)) return;
        e.preventDefault();
        onRunShortcut();
      }}
    />
  );
}
