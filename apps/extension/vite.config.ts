// ---------------------------------------------------------------------------
// D'Vantage Chrome Extension — Vite config
//
// Package versions confirmed via Rule 4a (16 May 2026):
//   @crxjs/vite-plugin  2.0.0-beta.33  →  crx(), defineManifest()
//   @vitejs/plugin-react 4.7.0         →  react() (default export)
//   vite                 5.4.21        →  defineConfig()
//
// crxjs reads src/manifest.ts and:
//   - Bundles src/background/index.ts  → service worker
//   - Bundles src/content/index.ts     → content script
//   - Builds sidepanel.html            → side panel React app
//   - Writes a valid manifest.json to dist/
// ---------------------------------------------------------------------------

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
