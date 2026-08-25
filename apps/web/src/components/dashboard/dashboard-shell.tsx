'use client';

import { useState, useCallback } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { MobileDrawer } from './mobile-drawer';

interface DashboardShellProps {
  children: React.ReactNode;
}

/**
 * DashboardShell — owns the mobile drawer open/close state.
 *
 * Desktop (≥768px): permanent sidebar, no drawer.
 * Mobile  (<768px): sidebar hidden via CSS, burger in TopBar opens MobileDrawer.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      {/* Inject responsive CSS — sidebar visibility + burger visibility */}
      <style>{`
        .vt-sidebar         { display: flex; }
        .vt-burger-btn      { display: none; }
        @media (max-width: 767px) {
          .vt-sidebar        { display: none !important; }
          .vt-burger-btn     { display: flex !important; }
          .vt-page-content   { padding: 20px 16px !important; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          backgroundColor: 'var(--vt-surface-base)',
        }}
      >
        {/* Desktop sidebar — hidden on mobile via .vt-sidebar class */}
        <div className="vt-sidebar">
          <Sidebar />
        </div>

        {/* Mobile drawer — rendered in portal-like fixed position */}
        <MobileDrawer open={drawerOpen} onClose={closeDrawer} />

        {/* Main content area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <TopBar onBurgerClick={openDrawer} />
          <div className="vt-page-content" style={{ flex: 1, padding: '32px 32px' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
