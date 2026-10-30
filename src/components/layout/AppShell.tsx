import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SearchPalette } from '../navigation/SearchPalette';
import { Header } from './Header';
import { RouteBoundary } from './RouteBoundary';

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the point is to run on every navigation
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
        <Suspense fallback={<p className="px-6 py-24 text-center text-muted">Loading…</p>}>
          {/* The key clears a failure once the visitor moves to another page. */}
          <RouteBoundary key={pathname}>
            <Outlet />
          </RouteBoundary>
        </Suspense>
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        Stepwise — learn by seeing, not just reading.
      </footer>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
