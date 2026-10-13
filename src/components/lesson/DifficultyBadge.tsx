import type { Difficulty } from '../../types/lesson';

const LEVEL: Record<Difficulty, { label: string; bars: number }> = {
  beginner: { label: 'Beginner', bars: 1 },
  intermediate: { label: 'Intermediate', bars: 2 },
  advanced: { label: 'Advanced', bars: 3 },
};

/** Difficulty as text plus a bar count, so it reads without colour. */
export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { label, bars } = LEVEL[difficulty];
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
      {label}
    </span>
  );
}

export const difficultyLabel = (difficulty: Difficulty) => LEVEL[difficulty].label;
