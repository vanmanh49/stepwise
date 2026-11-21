import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

export const NEXT_THEME: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };

const media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)');

function saved(): ThemeMode {
  try {
    const t = localStorage.getItem('dsa-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

// index.html applies the same rule before first paint; this keeps it in step afterwards.
function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark' || (mode === 'system' && !!media?.matches));
}

export const useTheme = create<{ mode: ThemeMode; cycle(): void }>((set, get) => ({
  mode: typeof document === 'undefined' ? 'system' : saved(),
  cycle() {
    const mode = NEXT_THEME[get().mode];
    apply(mode);
    try {
      // No saved value means "follow the system", which index.html already understands.
      if (mode === 'system') localStorage.removeItem('dsa-theme');
      else localStorage.setItem('dsa-theme', mode);
    } catch {
      // storage unavailable: the theme still applies for this session
    }
    set({ mode });
  },
}));

media?.addEventListener('change', () => {
  if (useTheme.getState().mode === 'system') apply('system');
});
