import type { ReactNode } from 'react';
import type { PanelsView, View } from '../../../types/visualization';

/** Stacks several views in one step. StepView passes itself in as renderView, avoiding a circular import. */
export function PanelsRenderer({ view, renderView }: { view: PanelsView; renderView: (view: View) => ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-8">
      {view.panels.map((panel, i) => (
        <div key={i} className="flex flex-col items-center gap-3">
          {panel.label && <span className="eyebrow">{panel.label}</span>}
          {renderView(panel.view)}
        </div>
      ))}
    </div>
  );
}
