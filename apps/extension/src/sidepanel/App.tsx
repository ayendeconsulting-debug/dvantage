// ---------------------------------------------------------------------------
// D'Vantage — Side Panel App (D2)
//
// Fonts + Atlas tokens are loaded in index.tsx before this module executes.
// All colour values reference CSS custom properties — no inline hex literals.
//
// Structure:
//   App
//   └── AuthGate          (unauthenticated → sign-in screen)
//       └── ReadyState    (authenticated placeholder — replaced in D5 with
//                          the real profile + job-detection panel)
//
// D1 hello-world scaffold is fully removed.
// ---------------------------------------------------------------------------

import type { CSSProperties } from 'react';
import AuthGate from './AuthGate';

// ── ReadyState ─────────────────────────────────────────────────────────────
// Minimal "Connected" chip shown once the user is authenticated.
// D5 replaces this with ProfilePanel + JobDetectionPanel.

function ReadyState() {
  return (
    <div style={styles.container}>
      <div style={styles.chip}>
        <span style={styles.dot} aria-hidden="true" />
        Connected
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthGate>
      <ReadyState />
    </AuthGate>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  container: {
    backgroundColor: 'var(--vt-surface-0)',
    minHeight:       '100vh',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px 24px',
  },
  chip: {
    display:         'inline-flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '6px 14px',
    backgroundColor: 'var(--vt-surface-2)',
    border:          '1px solid var(--vt-border-1)',
    borderRadius:    '20px',
    fontFamily:      "'DM Sans', sans-serif",
    fontSize:        '12px',
    fontWeight:      500,
    color:           'var(--vt-text-3)',
    letterSpacing:   '0.01em',
  },
  dot: {
    width:           '6px',
    height:          '6px',
    borderRadius:    '50%',
    backgroundColor: 'var(--vt-success)',
    flexShrink:      0,
  },
} satisfies Record<string, CSSProperties>;
