import { AnimatePresence, motion } from 'motion/react';
import type { QueueView } from '../../../types/visualization';
import { ValueBox, spring } from './ValueBox';

export function QueueRenderer({ view }: { view: QueueView }) {
  const last = view.items.length - 1;
  if (view.items.length === 0) {
    return <p className="rounded-xl border-2 border-dashed border-border px-6 py-3 text-sm text-muted">Empty queue</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="font-mono text-xs text-muted">
        out ←
      </span>
      <div className="flex gap-2 border-y-2 border-border px-3 py-9">
        <AnimatePresence mode="popLayout" initial={false}>
          {view.items.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={spring}
              className="relative"
            >
              {i === 0 && (
                <span className="absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 flex-col items-center font-mono text-xs font-semibold leading-tight text-accent">
                  FRONT <span aria-hidden>↓</span>
                </span>
              )}
              <ValueBox cell={item} />
              {i === last && (
                <span className="absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 flex-col items-center font-mono text-xs font-semibold leading-tight text-accent">
                  <span aria-hidden>↑</span> REAR
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <span aria-hidden className="font-mono text-xs text-muted">
        ← in
      </span>
    </div>
  );
}
