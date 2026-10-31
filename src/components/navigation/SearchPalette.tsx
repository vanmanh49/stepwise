import { ArrowDown, ArrowUp, Boxes, Brain, Container, CornerDownLeft, Database, Globe, Network, Search, Shield, Workflow, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CATEGORY_TITLE } from '../../lessons/labels';
import { searchIndex, searchTopics } from './search';
import type { Category } from '../../types/lesson';

const CATEGORY_ICON: Record<Category, typeof Boxes> = { 'data-structures': Boxes, algorithms: Workflow, sql: Database, microservices: Network, kubernetes: Container, ai: Brain, security: Shield, networking: Globe };

const SUGGESTED = ['binary-search', 'bubble-sort', 'binary-search-tree', 'bfs', 'dijkstra'];

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery('');
      setActive(0);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  const hasQuery = query.trim() !== '';
  const results = hasQuery ? searchTopics(query, searchIndex) : searchIndex.filter((item) => SUGGESTED.includes(item.id));
  const selectable = results.filter((item) => item.path !== undefined);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = selectable.length;
      if (count > 0) setActive((active + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      const target = selectable[active];
      if (target?.path) go(target.path);
    }
  };

  const clear = () => {
    setQuery('');
    setActive(0);
    input.current?.focus();
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Search lessons"
      className="mx-auto mt-[12vh] w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Search size={18} aria-hidden className="shrink-0 text-accent" />
        <input
          ref={input}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search lessons and concepts"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={selectable[active] ? `search-${selectable[active].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          // The dialog itself shows that search is active; a ring around the whole field adds noise.
          className="no-focus-ring h-full min-w-0 flex-1 bg-transparent text-[1.0625rem] placeholder:text-muted"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      <div className="max-h-[min(24rem,52vh)] overflow-y-auto p-2 [scrollbar-width:thin]">
        <p className="eyebrow px-2.5 pb-1.5 pt-2">{hasQuery ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Popular lessons'}</p>
        {results.length === 0 ? (
          <div className="px-4 pb-8 pt-6 text-center">
            <p className="font-medium">No matches for “{query.trim()}”</p>
            <p className="mt-1 text-sm text-muted">Try a name such as “queue”, or a concept such as “pivot” or “fifo”.</p>
          </div>
        ) : (
          <ul id="search-results" role="listbox" aria-label="Search results" className="space-y-0.5">
            {results.map((item) => {
              const live = item.path !== undefined;
              const isActive = live && selectable[active]?.id === item.id;
              const Icon = CATEGORY_ICON[item.category];
              return (
                <li
                  key={item.id}
                  id={`search-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={!live}
                  onClick={() => item.path && go(item.path)}
                  onPointerMove={() => live && setActive(selectable.indexOf(item))}
                  className={`flex min-h-[3.25rem] items-center gap-3 rounded-xl px-2.5 transition-colors ${
                    live ? 'cursor-pointer' : 'opacity-60'
                  } ${isActive ? 'bg-accent-soft' : ''}`}
                >
                  <span
                    aria-hidden
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      isActive ? 'border-transparent bg-accent text-accent-fg' : 'border-border bg-surface-2 text-muted'
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium leading-tight">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {CATEGORY_TITLE[item.category]}
                      {item.group && ` · ${item.group}`}
                    </span>
                  </span>
                  {live ? (
                    isActive && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-accent">
                        Open <CornerDownLeft size={14} aria-hidden />
                      </span>
                    )
                  ) : (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
                      Coming soon
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-border bg-surface-2/60 px-4 py-2.5 text-xs text-muted sm:flex">
        <span className="flex items-center gap-1.5">
          <Key>
            <ArrowUp size={11} aria-label="Up arrow" />
          </Key>
          <Key>
            <ArrowDown size={11} aria-label="Down arrow" />
          </Key>
          to move
        </span>
        <span className="flex items-center gap-1.5">
          <Key>
            <CornerDownLeft size={11} aria-label="Enter" />
          </Key>
          to open
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Key>Esc</Key>
          to close
        </span>
      </div>
    </dialog>
  );
}
