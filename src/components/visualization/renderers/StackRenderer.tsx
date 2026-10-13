import { AnimatePresence, motion } from 'motion/react';
import type { StackView } from '../../../types/visualization';
import { ValueBox, spring } from './ValueBox';

export function StackRenderer({ view }: { view: StackView }) {
  const top = view.items.length - 1;
  return (
    <div className="flex flex-col items-center">
      <div className="flex min-h-[15rem] flex-col justify-end gap-1.5 border-x-2 border-b-2 border-border px-3 pb-3 pt-6 [border-radius:0_0_18px_18px]">
        <AnimatePresence mode="popLayout" initial={false}>
          {[...view.items].reverse().map((item, i) => {
            const index = view.items.length - 1 - i;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -28 }}
                transition={spring}
                className="relative"
              >
                <ValueBox cell={item} wide />
                {index === top && (
                  <span className="absolute left-full top-1/2 ml-3 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap font-mono text-xs font-semibold text-accent">
                    <span aria-hidden>←</span> TOP
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {view.items.length === 0 && <p className="w-28 pb-2 text-center text-sm text-muted">Empty stack</p>}
      </div>
    </div>
  );
}
