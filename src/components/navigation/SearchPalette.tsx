import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { CATEGORY_TITLE } from './CourseSidebar';
import { searchIndex, searchTopics } from './search';

const SUGGESTED = ['binary-search', 'bubble-sort', 'binary-search-tree', 'bfs', 'dijkstra'];

export function SearchPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
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

  const results =
    query.trim() === '' ? searchIndex.filter((item) => SUGGESTED.includes(item.id)) : searchTopics(query, searchIndex);
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

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Search lessons"
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search size={18} aria-hidden className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search lessons, data structures, algorithms…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={selectable[active] ? `search-${selectable[active].id}` : undefined}
          className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
        />
        <kbd className="hidden shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">
          Esc
        </kbd>
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2">
        <p className="eyebrow px-3 py-2">{query.trim() === '' ? 'Popular lessons' : 'Results'}</p>
        {results.length === 0 ? (
          <p className="px-3 pb-4 text-sm text-muted">
            Nothing matches “{query}”. Try a name such as “queue” or a concept such as “pivot”.
          </p>
        ) : (
          <ul id="search-results" role="listbox" aria-label="Search results">
            {results.map((item) => {
              const isActive = item.path !== undefined && selectable[active]?.id === item.id;
              return (
                <li
                  key={item.id}
                  id={`search-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={item.path === undefined}
                  onClick={() => item.path && go(item.path)}
                  onPointerMove={() => item.path && setActive(selectable.indexOf(item))}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 ${
                    item.path === undefined ? 'text-muted' : 'cursor-pointer'
                  } ${isActive ? 'bg-accent-soft' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {CATEGORY_TITLE[item.category]}
                      {item.group && ` · ${item.group}`}
                    </span>
                  </span>
                  {item.path === undefined ? (
                    <span className="shrink-0 text-xs">Coming soon</span>
                  ) : (
                    isActive && <CornerDownLeft size={15} aria-hidden className="shrink-0 text-accent" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
