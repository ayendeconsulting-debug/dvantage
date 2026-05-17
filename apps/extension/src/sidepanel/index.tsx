// ---------------------------------------------------------------------------
// D'Vantage — Side Panel entry point
//
// Import order matters for Vite CSS bundling and cascade specificity:
//   1. Fontsource weight sheets (Outfit: 300/400/600/900, DM Sans: 400/500)
//   2. Atlas tokens + base reset (tokens.css)
//   3. React bootstrap
// ---------------------------------------------------------------------------

// ── Fonts ────────────────────────────────────────────────────────────────
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/900.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';

// ── Atlas tokens + base reset ─────────────────────────────────────────────
import './tokens.css';

// ── React bootstrap ───────────────────────────────────────────────────────
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('[DVantage] Root element #root not found.');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
