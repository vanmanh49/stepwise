import { useId, useMemo, useState } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type GraphConfig = Extract<VisualizationConfig, { kind: 'graph' }>;

// Graphs are predefined for now. An editor would only need to produce a Graph
// object and pass it to config.generate, exactly like the selection below.
export function GraphInput({ config, code, onStep }: { config: GraphConfig; code: string; onStep?: StepListener }) {
  const id = useId();
  const [graphId, setGraphId] = useState(config.graphs[0]!.id);
  const graph = config.graphs.find((g) => g.id === graphId) ?? config.graphs[0]!;
  const [start, setStart] = useState(graph.nodes[0]!.id);
  const [goal, setGoal] = useState(graph.nodes[graph.nodes.length - 1]!.id);
  const [ran, setRan] = useState(false);
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
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-graph`} className="eyebrow">
              Example graph
            </label>
            <select
              id={`${id}-graph`}
              className="field"
              value={graph.id}
              onChange={(e) => {
                const next = config.graphs.find((g) => g.id === e.target.value)!;
                setGraphId(next.id);
                setStart(next.nodes[0]!.id);
                setGoal(next.nodes[next.nodes.length - 1]!.id);
                setRan(true);
              }}
            >
              {config.graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {config.needsStart && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-start`} className="eyebrow">
                Start node
              </label>
              <select
                id={`${id}-start`}
                className="field"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setRan(true);
                }}
              >
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {config.needsGoal && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-goal`} className="eyebrow">
                Goal node
              </label>
              <select
                id={`${id}-goal`}
                className="field"
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  setRan(true);
                }}
              >
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      }
    />
  );
}
