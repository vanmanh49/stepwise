import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { SPEEDS } from '../../engine/player';
import type { Player } from '../../engine/usePlayer';

export function Controls({ player }: { player: Player }) {
  const { index, total, playing, speed } = player;
  const atStart = index === 0;
  const atEnd = index >= total - 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-icon" onClick={player.restart} disabled={atStart} aria-label="Restart">
            <RotateCcw size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={player.prev}
            disabled={atStart}
            aria-label="Previous step"
          >
            <SkipBack size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-primary min-w-28"
            onClick={player.toggle}
            disabled={total <= 1}
            aria-label={playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}
          >
            {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            {playing ? 'Pause' : atEnd && total > 1 ? 'Replay' : 'Play'}
          </button>
          <button type="button" className="btn btn-icon" onClick={player.next} disabled={atEnd} aria-label="Next step">
            <SkipForward size={18} aria-hidden />
          </button>
        </div>

        <div role="group" aria-label="Playback speed" className="flex rounded-[10px] border border-border bg-surface p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => player.setSpeed(s)}
              aria-pressed={speed === s}
              className={`min-h-10 rounded-lg px-2.5 font-mono text-xs font-semibold transition-colors ${
                speed === s ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        <p className="ml-auto font-mono text-sm tabular-nums text-muted">
          Step <span className="font-semibold text-text">{total === 0 ? 0 : index + 1}</span> / {total}
        </p>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={index}
        onChange={(e) => player.seek(Number(e.target.value))}
        disabled={total <= 1}
        aria-label="Timeline"
        aria-valuetext={`Step ${index + 1} of ${total}`}
        className="h-6 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}
