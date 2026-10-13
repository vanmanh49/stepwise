import { create } from 'zustand';

type Theme = 'light' | 'dark';

// index.html applies the saved theme before first paint; read it back from the DOM.
const initial: Theme =
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

export const useTheme = create<{ theme: Theme; toggle(): void }>((set, get) => ({
  theme: initial,
  toggle() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('dsa-theme', theme);
    } catch {
      // storage unavailable: the theme still applies for this session
    }
    set({ theme });
  },
}));
