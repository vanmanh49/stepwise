import type { Cell } from '../../../types/visualization';
import { ROLE_META, roleBoxStyle } from '../roles';

export const CELL_WIDTH = 'w-12 sm:w-14';

export function ValueBox({ cell, wide = false }: { cell: Cell; wide?: boolean }) {
  const meta = ROLE_META[cell.role];
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl font-mono text-sm font-semibold transition-colors duration-200 sm:text-base ${
        wide ? 'h-11 w-28' : `h-12 sm:h-14 ${CELL_WIDTH}`
      }`}
      style={roleBoxStyle(cell.role)}
    >
      {cell.value}
      {meta.mark && (
        <span
          aria-hidden
          className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-border bg-surface px-0.5 text-[10px] leading-none text-text"
        >
          {meta.mark}
        </span>
      )}
      {cell.role !== 'default' && <span className="sr-only"> ({meta.label})</span>}
    </div>
  );
}

export function PointerChip({ name }: { name: string }) {
  return (
    <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-accent">
      {name}
    </span>
  );
}
