import { Info } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { usePlayer } from '../../engine/usePlayer';
import type { Step } from '../../types/visualization';
import { CodePanel } from '../code/CodePanel';
import { Controls } from './Controls';
import { Explanation } from './Explanation';
import { Legend } from './Legend';
import { StepView } from './renderers';
import { rolesInRun } from './roles';

export { VisualizationBoundary } from './ErrorBoundary';

interface VisualizerProps {
  steps: Step[];
  /** Source shown beside the explanation; Step.codeLine highlights a line in it. */
  code?: string;
  /** Input controls rendered above the stage. */
  toolbar?: ReactNode;
  notice?: string;
  autoPlay?: boolean;
  loop?: boolean;
  onStep?: (step: Step, index: number, total: number) => void;
}

/**
 * Plays any Step[]: stage, legend, transport controls, timeline, explanation
 * and synced code. It knows nothing about specific algorithms.
 *
 * The stage is keyed by run: element ids are only stable within one Step[], so
 * a new run must not animate from the previous run's elements.
 */
export function Visualizer({ steps, code, toolbar, notice, autoPlay, loop, onStep }: VisualizerProps) {
  const player = usePlayer(steps, { autoPlay, loop });
  const { step, index, total } = player;
  const legend = useMemo(() => rolesInRun(steps.map((s) => s.view)), [steps]);

  useEffect(() => {
    if (step) onStep?.(step, index, total);
  }, [step, index, total, onStep]);

  const onKeyDown = (event: KeyboardEvent) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight') player.next();
    else if (event.key === 'ArrowLeft') player.prev();
    else if (event.key === ' ' && tag !== 'BUTTON') player.toggle();
    else return;
    event.preventDefault();
  };

  return (
    <MotionConfig reducedMotion="user">
      <section aria-label="Interactive visualization" className="card overflow-hidden" onKeyDown={onKeyDown}>
        {toolbar && <div className="border-b border-border p-4 sm:p-5">{toolbar}</div>}
        {notice && (
          <p className="flex items-center gap-2 border-b border-border bg-accent-soft px-5 py-2.5 text-sm">
            <Info size={15} aria-hidden className="shrink-0 text-accent" />
            {notice}
          </p>
        )}

        <div className="overflow-x-auto bg-surface-2/40">
          <div className="mx-auto flex min-h-[17rem] w-max max-w-full items-center px-6 py-10 sm:px-10">
            {step ? <StepView key={player.runId} view={step.view} /> : <p className="text-sm text-muted">Nothing to show yet.</p>}
          </div>
        </div>

        <div className="space-y-4 border-t border-border p-4 sm:p-5">
          <Legend roles={legend} />
          <Controls player={player} />
        </div>

        {step && (
          <div className={`grid gap-5 border-t border-border p-4 sm:p-5 ${code ? 'lg:grid-cols-2' : ''}`}>
            <Explanation step={step} index={index} total={total} />
            {code && <CodePanel code={code} activeLine={step.codeLine} />}
          </div>
        )}
      </section>
    </MotionConfig>
  );
}
