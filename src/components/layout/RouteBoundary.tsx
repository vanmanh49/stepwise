import { TriangleAlert } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '../ui/Button';

/**
 * Keeps the header on screen when a page can't load or show. A deploy replaces the code files, so a
 * tab opened before it can't fetch pages it hasn't visited yet; only a reload gets the new ones.
 */
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="card mx-auto my-16 flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <TriangleAlert aria-hidden className="text-danger" />
        <p className="font-medium">This page couldn't be loaded.</p>
        <p className="text-sm text-muted">A newer version of Stepwise may be out. Reloading will get it.</p>
        <Button onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    );
  }
}
