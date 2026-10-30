import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { sitePages, staticFiles } from './scripts/static-pages';

/** Writes a real page for every address, see scripts/static-pages.ts. */
function staticPages(): Plugin {
  let base = '/';
  return {
    name: 'static-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') throw new Error('static-pages: the build produced no index.html');
      const files = staticFiles(String(index.source), `https://vanmanh49.github.io${base}`, sitePages());
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), staticPages()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // See src/sql/engine.bench.ts: the getter overhead is known and accepted.
    benchmark: { suppressExportGetterWarnings: true },
  },
});
