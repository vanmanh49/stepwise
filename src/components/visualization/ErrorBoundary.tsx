import { TriangleAlert } from 'lucide-react';
import { Component, type ReactNode } from 'react';

/** Keeps a failing visualization from taking the rest of the page down with it. */
export class VisualizationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="card flex flex-col items-center gap-3 p-10 text-center">
        <TriangleAlert aria-hidden className="text-danger" />
        <p className="font-medium">Something went wrong while running this visualization.</p>
        <button type="button" className="btn" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    );
  }
}
