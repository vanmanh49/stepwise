import { LayoutGroup, motion } from 'motion/react';
import { useId } from 'react';
import type { ArrayView, Cell } from '../../../types/visualization';
import { CELL_WIDTH, PointerChip, ValueBox, spring } from './ValueBox';

function Cells({ cells }: { cells: Cell[] }) {
  return (
    <div className="flex gap-2">
      {cells.map((cell) => (
        // layoutId lets a cell glide to its new slot, including between the main and auxiliary rows.
        <motion.div key={cell.id} layoutId={cell.id} transition={spring}>
          <ValueBox cell={cell} />
        </motion.div>
      ))}
    </div>
  );
}

export function ArrayRenderer({ view, showIndices = true }: { view: ArrayView; showIndices?: boolean }) {
  const groupId = useId();
  const pointersAt = (i: number) =>
    Object.entries(view.pointers ?? {})
      .filter(([, index]) => index === i)
      .map(([name]) => name);
  const hasPointers = view.pointers !== undefined;

  return (
    <LayoutGroup id={groupId}>
      <div className="flex flex-col items-center gap-5">
        <div>
          {view.cells.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-border px-6 py-3 text-sm text-muted">Empty array</p>
          ) : (
            <Cells cells={view.cells} />
          )}
          {showIndices && (
            <div className="mt-1.5 flex gap-2" aria-hidden={!hasPointers}>
              {view.cells.map((_, i) => (
                <div key={i} className={`flex flex-col items-center gap-1 ${CELL_WIDTH}`}>
                  <span className="font-mono text-[11px] text-muted">{i}</span>
                  {pointersAt(i).map((name) => (
                    <PointerChip key={name} name={name} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {view.aux && (
          <div className="flex flex-col items-center gap-2">
            <span className="eyebrow">{view.aux.label}</span>
            <div className="flex min-h-[4.25rem] min-w-40 items-center justify-center rounded-2xl border-2 border-dashed border-border p-2">
              <Cells cells={view.aux.cells} />
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}
