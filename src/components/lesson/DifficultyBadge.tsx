import { difficultyLabel } from '../../lessons/labels';
import type { Difficulty } from '../../types/lesson';

const BARS: Record<Difficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Difficulty as text plus a bar count, so it reads without colour. */
export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const bars = BARS[difficulty];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted">
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-[3px] rounded-sm ${n <= bars ? 'bg-accent' : 'bg-border'}`}
            style={{ height: 4 + n * 3 }}
          />
        ))}
      </span>
      {difficultyLabel(difficulty)}
    </span>
  );
}
