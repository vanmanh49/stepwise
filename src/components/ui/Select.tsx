import type { ComponentProps } from 'react';
import { useFieldControl } from './fieldControl';

type Option<T extends string> = T | { value: T; label: string };

const valueOf = <T extends string>(option: Option<T>) => (typeof option === 'string' ? option : option.value);
const labelOf = <T extends string>(option: Option<T>) => (typeof option === 'string' ? option : option.label);

/** A select box with the app's field style and arrow. Options are plain values, or values with labels. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  describedBy,
  invalid,
  className = '',
  ...rest
}: Omit<ComponentProps<'select'>, 'value' | 'onChange' | 'children'> & {
  value: T;
  onChange(value: T): void;
  options: readonly Option<T>[];
  describedBy?: string;
  invalid?: boolean;
}) {
  const control = useFieldControl({ id, describedBy, invalid });
  return (
    <select {...rest} {...control} className={`field w-full ${className}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((option) => (
        <option key={valueOf(option)} value={valueOf(option)}>
          {labelOf(option)}
        </option>
      ))}
    </select>
  );
}
