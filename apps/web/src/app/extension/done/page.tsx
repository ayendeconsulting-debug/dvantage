'use client';

// ---------------------------------------------------------------------------
// D'Vantage — Extension auth done page
//
// URL: /extension/done
//
// This page is the callbackURL after sign-in for the extension auth flow.
// It exists purely as a signal URL — the background service worker monitors
// chrome.tabs.onUpdated for this URL and calls the exchange endpoint directly
// once it fires. This page closes automatically when the SW closes the tab.
//
// The user sees this page briefly (< 2 s) while the SW exchange completes.
// No JavaScript logic needed here — the BG SW does all the work.
// ---------------------------------------------------------------------------

import type { CSSProperties } from 'react';

function DVantageMark() {
  return (
    <svg
      viewBox="0 0 32 24"
      width="40"
      height="30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="D\u2019Vantage"
      style={{ marginBottom: '24px', flexShrink: 0 }}
    >
      <path
        d="M 2 20 L 11 4 L 30 20"
        stroke="var(--vt-brand-500)"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export default function ExtensionDonePage() {
  return (
    <div style={styles.page}>
      <DVantageMark />
      <style>{`@keyframes vt-done-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.spinner} aria-hidden="true" />
      <p style={styles.label}>Connecting your extension\u2026</p>
      <p style={styles.sub}>This tab will close automatically.</p>
    </div>
  );
}

const styles = {
  page: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '40px 24px',
    background:     'var(--vt-surface-0)',
  },
  spinner: {
    width:          '28px',
    height:         '28px',
    borderRadius:   '50%',
    border:         '2.5px solid var(--vt-surface-border)',
    borderTopColor: 'var(--vt-brand-500)',
    animation:      'vt-done-spin 0.8s linear infinite',
    marginBottom:   '20px',
    flexShrink:     0,
  },
  label: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '14px',
    fontWeight: 500,
    color:      'var(--vt-text-body)',
    margin:     '0 0 8px',
    textAlign:  'center',
  },
  sub: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '13px',
    color:      'var(--vt-text-muted)',
    margin:     0,
    textAlign:  'center',
  },
} satisfies Record<string, CSSProperties>;
