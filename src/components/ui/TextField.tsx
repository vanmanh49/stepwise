import type { ComponentProps } from 'react';
import { useFieldControl } from './fieldControl';

/** Named widths instead of one-off classes: narrow fields also get less padding. */
const WIDTH = {
  xs: 'w-16 px-2',
  sm: 'w-24 px-2',
  md: 'w-28',
  full: 'w-full',
  /** Fills a flex row beside buttons, wrapping below 14rem. */
  grow: 'min-w-0 flex-1 basis-56',
} as const;

/** A one-line text field. Values in this app are data (numbers, words, lists), so it is monospaced by default. */
export function TextField({
  value,
  onChange,
  width = 'full',
  mono = true,
  id,
  describedBy,
  invalid,
  className = '',
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'width'> & {
  value: string;
  onChange(value: string): void;
  width?: keyof typeof WIDTH;
  mono?: boolean;
  describedBy?: string;
  invalid?: boolean;
}) {
  const control = useFieldControl({ id, describedBy, invalid });
  return (
    <input
      autoComplete="off"
      spellCheck={false}
      {...rest}
      {...control}
      className={`field ${WIDTH[width]} ${mono ? 'font-mono' : ''} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
