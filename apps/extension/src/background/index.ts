// ---------------------------------------------------------------------------
// D'Vantage — Service Worker (Manifest V3)
//
// Sets sidePanel open-on-action-click behavior so clicking the toolbar
// icon always opens the side panel (no popup fallback).
//
// Full auth token management and message routing implemented in D3–4.
// ---------------------------------------------------------------------------

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => {
    console.error('[DVantage SW] sidePanel.setPanelBehavior failed:', err);
  });

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    '[DVantage SW] Installed — reason:',
    details.reason,
    '| version:',
    chrome.runtime.getManifest().version,
  );
});

console.log('[DVantage SW] Service worker ready');
