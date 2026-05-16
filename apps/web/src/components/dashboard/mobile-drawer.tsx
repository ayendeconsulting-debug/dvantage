'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { X, FileText, Briefcase, LayoutDashboard, SendHorizontal, Settings, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DVantageLogo } from '@/components/logo/dvantage-logo';
import { signOut } from '@/lib/auth-client';

interface NavItem {
  label:   string;
  href:    string;
  icon:    LucideIcon;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',     href: '/dashboard',              icon: LayoutDashboard, enabled: true },
  { label: 'Resumes',      href: '/dashboard/resume',       icon: FileText,        enabled: true },
  { label: 'Jobs',         href: '/dashboard/jobs',         icon: Briefcase,       enabled: true },
  { label: 'Applications', href: '/dashboard/applications', icon: SendHorizontal,  enabled: true },
];

interface MobileDrawerProps {
  open:    boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/auth/sign-in');
  }

  function handleNavClick() {
    onClose();
  }

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position:         'fixed',
          inset:            0,
          backgroundColor:  'rgba(0, 0, 0, 0.55)',
          zIndex:           40,
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? 'auto' : 'none',
          transition:       'opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Drawer panel */}
      <aside
        aria-label="Mobile navigation"
        aria-modal="true"
        role="dialog"
        style={{
          position:        'fixed',
          top:             0,
          left:            0,
          bottom:          0,
          width:           '260px',
          zIndex:          50,
          display:         'flex',
          flexDirection:   'column',
          backgroundColor: 'var(--vt-surface-raised)',
          borderRight:     '1px solid var(--vt-surface-border)',
          padding:         '20px 12px',
          gap:             '4px',
          transform:       open ? 'translateX(0)' : 'translateX(-100%)',
          transition:      'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          willChange:      'transform',
        }}
      >
        {/* Logo row + close button */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '4px 8px 20px',
          borderBottom:   '1px solid var(--vt-surface-border)',
          marginBottom:   '8px',
        }}>
          <Link href="/dashboard" aria-label="D'Vantage dashboard" onClick={handleNavClick}>
            <DVantageLogo width={110} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            type="button"
            style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              width:           '32px',
              height:          '32px',
              borderRadius:    '6px',
              border:          '1px solid var(--vt-surface-border)',
              background:      'transparent',
              color:           'var(--vt-text-muted)',
              cursor:          'pointer',
              flexShrink:      0,
            }}
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }} aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            if (!item.enabled) {
              return (
                <div
                  key={item.label}
                  style={styles.navItemDisabled}
                  title="Coming soon"
                  aria-disabled="true"
                >
                  <item.icon size={16} strokeWidth={1.5} />
                  <span style={styles.navLabel}>{item.label}</span>
                  <span style={styles.comingSoonBadge}>Soon</span>
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={handleNavClick}
                style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon size={16} strokeWidth={1.5} />
                <span style={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom — settings + sign out */}
        <div style={styles.bottom}>
          <Link href="/dashboard/settings" style={styles.navItem} onClick={handleNavClick}>
            <Settings size={16} strokeWidth={1.5} />
            <span style={styles.navLabel}>Settings</span>
          </Link>
          <button
            onClick={() => void handleSignOut()}
            style={styles.signOutBtn}
            type="button"
          >
            <LogOut size={16} strokeWidth={1.5} />
            <span style={styles.navLabel}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

const styles = {
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '6px',
    color: 'var(--vt-text-secondary)', textDecoration: 'none', fontFamily: 'var(--vt-font-body)',
    fontSize: '14px', fontWeight: 400, cursor: 'pointer', border: 'none',
    background: 'transparent', width: '100%', textAlign: 'left' as const,
    transition: 'background 120ms, color 120ms',
  },
  navItemActive: { backgroundColor: 'var(--vt-surface-hover)', color: 'var(--vt-text-primary)' },
  navItemDisabled: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '6px',
    color: 'var(--vt-text-disabled)', fontFamily: 'var(--vt-font-body)', fontSize: '14px', cursor: 'not-allowed',
  },
  navLabel: { flex: 1 },
  comingSoonBadge: {
    fontSize: '10px', fontFamily: 'var(--vt-font-mono)', color: 'var(--vt-text-disabled)',
    backgroundColor: 'var(--vt-surface-border)', padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.03em',
  },
  bottom: {
    display: 'flex', flexDirection: 'column' as const, gap: '2px',
    borderTop: '1px solid var(--vt-surface-border)', paddingTop: '12px', marginTop: '8px',
  },
  signOutBtn: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '6px',
    color: 'var(--vt-text-secondary)', fontFamily: 'var(--vt-font-body)', fontSize: '14px',
    cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'left' as const,
    transition: 'background 120ms, color 120ms',
  },
} as const;
