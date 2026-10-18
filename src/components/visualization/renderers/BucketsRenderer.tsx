import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { BucketsView, Cell } from '../../../types/visualization';
import { ValueBox } from './ValueBox';
import { spring } from './spring';

function Moving({ cell, wide = false }: { cell: Cell; wide?: boolean }) {
  // layoutId lets a value glide between the input row and its bucket.
  return (
    <motion.div layoutId={cell.id} transition={spring}>
      <ValueBox cell={cell} wide={wide} />
    </motion.div>
  );
}

export function BucketsRenderer({ view }: { view: BucketsView }) {
  const groupId = useId();
  const chain = view.direction === 'down';
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
              <div
                className={`flex min-w-[3.75rem] items-center gap-1.5 rounded-xl border-2 border-dashed border-border p-1.5 ${
                  chain ? 'min-h-[3.5rem] flex-col' : 'min-h-[8rem] flex-col-reverse'
                }`}
              >
                {bucket.cells.map((cell) => (
                  <Moving key={cell.id} cell={cell} wide={chain} />
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
