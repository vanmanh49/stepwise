import { Moon, Search, Sun } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { useTheme } from '../../store/theme';
import { Button, IconButton } from '../ui/Button';

const links = [
  { to: '/data-structures', label: 'Data Structures' },
  { to: '/algorithms', label: 'Algorithms' },
  { to: '/sql', label: 'SQL' },
  { to: '/microservices', label: 'Microservices' },
  { to: '/kubernetes', label: 'Kubernetes' },
  { to: '/ai', label: 'AI' },
  { to: '/big-o', label: 'Big O' },
  { to: '/dashboard', label: 'Progress' },
];

export function Header({ onSearch }: { onSearch(): void }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-2 px-4 sm:px-6">
        <Link to="/" className="mr-2 flex items-center gap-2.5 font-semibold tracking-tight">
          <span aria-hidden className="flex h-8 w-8 items-end justify-center gap-[3px] rounded-lg bg-accent p-[7px]">
            <span className="h-[40%] w-[4px] rounded-sm bg-accent-fg" />
            <span className="h-[70%] w-[4px] rounded-sm bg-accent-fg" />
            <span className="h-full w-[4px] rounded-sm bg-accent-fg" />
          </span>
          Stepwise
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2 ${
                  isActive ? 'text-text' : 'text-muted'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button icon={Search} onClick={onSearch} className="text-muted sm:w-56 sm:justify-start lg:w-36 xl:w-56" aria-label="Search lessons" aria-keyshortcuts="Control+K">
            <span className="hidden sm:inline">Search</span>
            <kbd className="ml-auto hidden rounded border border-border bg-surface-2 px-1.5 font-mono text-[11px] sm:inline">
              Ctrl K
            </kbd>
          </Button>
          <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} />
        </div>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-t border-border px-3 [scrollbar-width:none] lg:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `flex min-h-11 shrink-0 items-center px-3 text-sm font-medium ${isActive ? 'text-text' : 'text-muted'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
