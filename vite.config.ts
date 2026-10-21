import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // See src/sql/engine.bench.ts: the getter overhead is known and accepted.
    benchmark: { suppressExportGetterWarnings: true },
  },
});
