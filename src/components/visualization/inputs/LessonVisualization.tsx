import type { VisualizationConfig } from '../../../types/lesson';
import type { Step } from '../../../types/visualization';
import { VisualizationBoundary } from '../ErrorBoundary';
import { GraphInput } from './GraphInput';
import { SearchInput } from './SearchInput';
import { SortInput } from './SortInput';
import { StructureInput } from './StructureInput';

export type StepListener = (step: Step, index: number, total: number) => void;

function Inputs({ config, code, onStep }: { config: VisualizationConfig; code: string; onStep?: StepListener }) {
  switch (config.kind) {
    case 'sort':
      return <SortInput config={config} code={code} onStep={onStep} />;
    case 'search':
      return <SearchInput config={config} code={code} onStep={onStep} />;
    case 'structure':
      return <StructureInput config={config} code={code} onStep={onStep} />;
    case 'graph':
      return <GraphInput config={config} code={code} onStep={onStep} />;
  }
}

/** Wires a lesson's visualization config to the right inputs and the shared Visualizer. */
export function LessonVisualization(props: { config: VisualizationConfig; code: string; onStep?: StepListener }) {
  return (
    <VisualizationBoundary>
      <Inputs {...props} />
    </VisualizationBoundary>
  );
}
