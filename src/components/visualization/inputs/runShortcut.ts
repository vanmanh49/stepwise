import type { KeyboardEvent } from 'react';

/** True for Ctrl+Enter or Cmd+Enter, the usual "run" shortcut in SQL editors. */
export const isRunShortcut = (event: KeyboardEvent) => event.key === 'Enter' && (event.ctrlKey || event.metaKey);
