import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';

/** A link that looks like a Button, for navigation (a button would break opening it in a new tab). */
export function ButtonLink({
  variant = 'default',
  icon: Icon,
  className = '',
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: 'primary' | 'default'; icon?: LucideIcon }) {
  return (
    <Link {...rest} className={`btn ${variant === 'primary' ? 'btn-primary' : ''} ${className}`}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </Link>
  );
}
