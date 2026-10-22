import type { ComponentProps } from 'react';

/** A full-width range slider in the accent colour. */
export function Slider({ value, onChange, className = '', ...rest }: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & { value: number; onChange(value: number): void }) {
  return (
    <input
      {...rest}
      type="range"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-6 w-full cursor-pointer accent-[var(--accent)] ${className}`}
    />
  );
}
