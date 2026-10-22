import { useId, useMemo, type ReactNode } from 'react';
import { FieldContext } from './fieldControl';
import { FormMessage } from './FormMessage';

/**
 * A labelled control with optional help or error text below it. The control (Select, TextInput…)
 * is the child; the Field gives it its id and describes it with the message.
 */
export function Field({
  label,
  help,
  error,
  describedBy,
  invalid,
  wide,
  compact,
  className = '',
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  /** A message shown elsewhere (for example under the whole form) that describes this control. */
  describedBy?: string;
  invalid?: boolean;
  /** Spans two columns of a FieldGrid on wider screens: for lists and free text. */
  wide?: boolean;
  /** Tighter spacing, for fields inside a small inline form. */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const messageId = help !== undefined || error !== undefined ? `${id}-message` : undefined;
  const control = useMemo(
    () => ({ id, describedBy: messageId ?? describedBy, invalid: error !== undefined || Boolean(invalid) }),
    [id, messageId, describedBy, error, invalid],
  );
  return (
    <div className={`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${wide ? 'sm:col-span-2' : ''} ${className}`}>
      <label htmlFor={id} className={`eyebrow truncate ${compact ? 'px-1' : ''}`} title={typeof label === 'string' ? label : undefined}>
        {label}
      </label>
      <FieldContext value={control}>{children}</FieldContext>
      {messageId && (
        <FormMessage id={messageId} error={error} size="xs">
          {help}
        </FormMessage>
      )}
    </div>
  );
}
