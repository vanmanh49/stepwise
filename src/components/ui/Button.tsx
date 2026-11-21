import { Play, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'default';
  icon?: LucideIcon;
  iconSize?: number;
};

/** The app's button: an optional icon before the text; `type` defaults to "button" so it never submits by accident. */
export function Button({ variant = 'default', icon: Icon, iconSize = 16, type = 'button', className = '', children, ...rest }: ButtonProps) {
  return (
    // oxlint-disable-next-line react/button-has-type -- the type is a prop with a safe default
    <button {...rest} type={type} className={`btn ${variant === 'primary' ? 'btn-primary' : ''} ${className}`}>
      {Icon && <Icon size={iconSize} aria-hidden />}
      {children}
    </button>
  );
}

/** A square button with only an icon; `label` is what screen readers announce. `tooltip` also shows it at once on hover or keyboard focus, below the button. */
export function IconButton({
  icon: Icon,
  label,
  iconSize = 18,
  tooltip = false,
  className = '',
  ...rest
}: Omit<ComponentProps<'button'>, 'children' | 'aria-label' | 'type'> & { icon: LucideIcon; label: string; iconSize?: number; tooltip?: boolean }) {
  return (
    <button {...rest} type="button" className={`btn btn-icon ${tooltip ? 'group relative' : ''} ${className}`} aria-label={label}>
      <Icon size={iconSize} aria-hidden />
      {tooltip && (
        // Right-aligned so it stays on screen at the header's right edge; aria-hidden because aria-label already says it.
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-full z-40 mt-2 hidden whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow group-hover:block group-focus-visible:block"
        >
          {label}
        </span>
      )}
    </button>
  );
}

/** Submits the form it is in. */
export function RunButton({ children = 'Run', ...rest }: Omit<ButtonProps, 'type' | 'variant' | 'icon'>) {
  return (
    <Button {...rest} type="submit" variant="primary" icon={Play}>
      {children}
    </Button>
  );
}
