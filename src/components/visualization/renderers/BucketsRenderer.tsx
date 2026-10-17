import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { BucketsView, Cell } from '../../../types/visualization';
import { ValueBox, spring } from './ValueBox';

function Moving({ cell }: { cell: Cell }) {
  // layoutId lets a value glide between the input row and its bucket.
  return (
    <motion.div layoutId={cell.id} transition={spring}>
      <ValueBox cell={cell} />
    </motion.div>
  );
}

export function BucketsRenderer({ view }: { view: BucketsView }) {
  const groupId = useId();
  return (
    <LayoutGroup id={groupId}>
      <div className="flex flex-col items-center gap-6">
        {view.input && (
          <div className="flex flex-col items-center gap-2">
            <span className="eyebrow">{view.input.label}</span>
            <div className="flex min-h-[3.5rem] gap-2">
              {view.input.cells.map((cell) => (
                <Moving key={cell.id} cell={cell} />
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-center gap-2">
          {view.buckets.map((bucket) => (
            <div key={bucket.label} className="flex flex-col items-center gap-1.5">
              <div className="flex min-h-[8rem] min-w-[3.75rem] flex-col-reverse items-center gap-1.5 rounded-xl border-2 border-dashed border-border p-1.5">
                {bucket.cells.map((cell) => (
                  <Moving key={cell.id} cell={cell} />
                ))}
              </div>
              <span className="font-mono text-xs text-muted">{bucket.label}</span>
            </div>
          ))}
        </div>
      </div>
    </LayoutGroup>
  );
}
