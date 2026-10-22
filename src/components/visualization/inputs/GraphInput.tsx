import { useMemo, useState } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { Field } from '../../ui/Field';
import { FieldGrid } from '../../ui/FieldGrid';
import { Select } from '../../ui/Select';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type GraphConfig = Extract<VisualizationConfig, { kind: 'graph' }>;

// Graphs are predefined for now. An editor would only need to produce a Graph
// object and pass it to config.generate, exactly like the selection below.
export function GraphInput({ config, code, onStep }: { config: GraphConfig; code: string; onStep?: StepListener }) {
  const [graphId, setGraphId] = useState(config.graphs[0]!.id);
  const graph = config.graphs.find((g) => g.id === graphId) ?? config.graphs[0]!;
  const [start, setStart] = useState(graph.nodes[0]!.id);
  const [goal, setGoal] = useState(graph.nodes[graph.nodes.length - 1]!.id);
  const [ran, setRan] = useState(false);
  const nodeOptions = graph.nodes.map((n) => ({ value: n.id, label: n.label }));
  const steps = useMemo(
    () => (config.needsGoal ? config.generate(graph, start, goal) : config.generate(graph, start)),
    [config, graph, start, goal],
  );

  return (
    <Visualizer
      steps={steps}
      code={code}
      autoPlay={ran}
      onStep={onStep}
      toolbar={
        <FieldGrid>
          <Field label="Example graph">
            <Select
              value={graph.id}
              options={config.graphs.map((g) => ({ value: g.id, label: g.name }))}
              onChange={(next) => {
                const picked = config.graphs.find((g) => g.id === next)!;
                setGraphId(picked.id);
                setStart(picked.nodes[0]!.id);
                setGoal(picked.nodes[picked.nodes.length - 1]!.id);
                setRan(true);
              }}
            />
          </Field>
          {config.needsStart && (
            <Field label="Start node">
              <Select
                value={start}
                options={nodeOptions}
                onChange={(next) => {
                  setStart(next);
                  setRan(true);
                }}
              />
            </Field>
          )}
          {config.needsGoal && (
            <Field label="Goal node">
              <Select
                value={goal}
                options={nodeOptions}
                onChange={(next) => {
                  setGoal(next);
                  setRan(true);
                }}
              />
            </Field>
          )}
        </FieldGrid>
      }
    />
  );
}
