import { Pause, Play } from 'lucide-react';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../engine/usePlayer';
import type { Step } from '../../types/visualization';
import { StepView } from './renderers';

/** A compact, looping preview that runs on the same engine as the full Visualizer. */
export function MiniPlayer({ steps, label }: { steps: Step[]; label: string }) {
  // People who ask for reduced motion get a paused preview they can start themselves.
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);
  const [tabShown, setTabShown] = useState(() => document.visibilityState !== 'hidden');
  const offscreen = !inView || !tabShown;
  // No looping while nobody can see it, or the loop would restart it in the background.
  const player = usePlayer(steps, { autoPlay: !reduced, loop: !reduced && !offscreen });
  const { step, index, total, playing, play, pause } = player;

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    // A batch can hold several changes; the last one is where the preview is now.
    const observer = new IntersectionObserver((entries) => setInView(entries.at(-1)!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setTabShown(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Pause while scrolled away or in a background tab; resume only if it was playing, so a
  // preview the visitor paused stays paused.
  const resume = useRef(false);
  useEffect(() => {
    if (offscreen) {
      if (playing) {
        resume.current = true;
        pause();
      }
    } else if (resume.current) {
      resume.current = false;
      play();
    }
  }, [offscreen, playing, pause, play]);

  if (!step) return null;

  return (
    <MotionConfig reducedMotion="user">
      <section ref={section} aria-label={label} className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="eyebrow">{label}</span>
          <button
            type="button"
            className="btn btn-icon -my-1.5 border-transparent"
            onClick={player.toggle}
            aria-label={player.playing ? 'Pause preview' : 'Play preview'}
          >
            {player.playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          </button>
        </div>
        <div className="overflow-x-auto bg-surface-2/40">
          <div className="mx-auto flex min-h-[11rem] w-max max-w-full items-center px-6 py-8">
            <StepView key={player.runId} view={step.view} />
          </div>
        </div>
        <div className="min-h-[7.5rem] border-t border-border p-4">
          <p className="font-semibold leading-snug">{step.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{step.why}</p>
        </div>
        <div
          className="h-1 bg-accent transition-[width] duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
          aria-hidden
        />
      </section>
    </MotionConfig>
  );
}
