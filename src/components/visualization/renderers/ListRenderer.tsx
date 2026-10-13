import { ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ListView } from '../../../types/visualization';
import { CELL_WIDTH, PointerChip, ValueBox, spring } from './ValueBox';

export function ListRenderer({ view }: { view: ListView }) {
  const pointersAt = (i: number) =>
    Object.entries(view.pointers ?? {})
      .filter(([, index]) => index === i)
      .map(([name]) => name);

  const Pointers = ({ index }: { index: number }) => (
    <div className="flex min-h-12 flex-col items-center justify-end gap-1 pb-1">
      {pointersAt(index).map((name) => (
        <PointerChip key={name} name={name} />
      ))}
      {pointersAt(index).length > 0 && (
        <span aria-hidden className="text-xs leading-none text-accent">
          ↓
        </span>
      )}
    </div>
  );

  return (
    <div className="flex items-end gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {view.nodes.map((node, i) => (
          <motion.div
            key={node.id}
            layout
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={spring}
            className="flex items-end gap-1.5"
          >
            <div className="flex flex-col items-center">
              <Pointers index={i} />
              <ValueBox cell={node} />
            </div>
            <ArrowRight aria-hidden size={18} className="mb-3.5 text-muted sm:mb-[18px]" />
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.div layout transition={spring} className="flex flex-col items-center">
        <Pointers index={view.nodes.length} />
        <div
          className={`flex h-12 items-center justify-center rounded-xl border-2 border-dashed border-border font-mono text-xs text-muted sm:h-14 ${CELL_WIDTH}`}
        >
          null
        </div>
      </motion.div>
    </div>
  );
}
