import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { SPEEDS } from '../../engine/player';
import type { Player } from '../../engine/usePlayer';
import { Button, IconButton } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Slider } from '../ui/Slider';

export function Controls({ player }: { player: Player }) {
  const { index, total, playing, speed } = player;
  const atStart = index === 0;
  const atEnd = index >= total - 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1.5">
          <IconButton icon={RotateCcw} label="Restart" onClick={player.restart} disabled={atStart} />
          <IconButton icon={SkipBack} label="Previous step" onClick={player.prev} disabled={atStart} />
          <Button
            variant="primary"
            icon={playing ? Pause : Play}
            iconSize={18}
            className="min-w-28"
            onClick={player.toggle}
            disabled={total <= 1}
            aria-label={playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}
          >
            {playing ? 'Pause' : atEnd && total > 1 ? 'Replay' : 'Play'}
          </Button>
          <IconButton icon={SkipForward} label="Next step" onClick={player.next} disabled={atEnd} />
        </div>

        <SegmentedControl label="Playback speed" options={SPEEDS} value={speed} onChange={player.setSpeed} format={(s) => `${s}x`} />

        <p className="ml-auto font-mono text-sm tabular-nums text-muted">
          Step <span className="font-semibold text-text">{total === 0 ? 0 : index + 1}</span> / {total}
        </p>
      </div>

      <Slider
        min={0}
        max={Math.max(0, total - 1)}
        value={index}
        onChange={player.seek}
        disabled={total <= 1}
        aria-label="Timeline"
        aria-valuetext={`Step ${index + 1} of ${total}`}
      />
    </div>
  );
}
