import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from './Header';

export function AppShell() {
  const [, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <Header onSearch={() => setSearchOpen(true)} />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        Stepwise — learn by seeing, not just reading.
      </footer>
    </div>
  );
}
