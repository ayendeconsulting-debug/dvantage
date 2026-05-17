'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Briefcase,
  LayoutDashboard,
  SendHorizontal,
  Settings,
  LogOut,
} from 'lucide-react';
import { DVantageLogo } from '@/components/logo/dvantage-logo';
import { signOut }      from '@/lib/auth-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE          = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.dvantage.ca';
const REVOKE_SESSION_URL = `${API_BASE}/v1/extension/auth/revoke-session`;

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    // Fire-and-forget: revoke all extension tokens for this user.
    // Non-blocking — signOut() proceeds even if the network call fails.
    // The extension token expires naturally after 30 days in the worst case.
    void fetch(REVOKE_SESSION_URL, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        '{}',
    }).catch(() => {
      // Intentionally swallowed — sign-out must never be blocked by this call.
    });

    await signOut();
    router.push('/auth/sign-in');
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logoArea}>
        <Link href="/dashboard" aria-label="D'Vantage dashboard">
          <DVantageLogo width={120} />
        </Link>
      </div>

      <nav style={styles.nav} aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          if (!item.enabled) {
            return (
              <div key={item.label} style={styles.navItemDisabled} title="Coming soon" aria-disabled="true">
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
              style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon size={16} strokeWidth={1.5} />
              <span style={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={styles.bottom}>
        <Link href="/dashboard/settings" style={styles.navItem}>
          <Settings size={16} strokeWidth={1.5} />
          <span style={styles.navLabel}>Settings</span>
        </Link>
        <button onClick={() => void handleSignOut()} style={styles.signOutBtn} type="button">
          <LogOut size={16} strokeWidth={1.5} />
          <span style={styles.navLabel}>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  sidebar: {
    width: '220px', flexShrink: 0, height: '100vh', position: 'sticky' as const, top: 0,
    display: 'flex', flexDirection: 'column' as const,
    backgroundColor: 'var(--vt-surface-raised)', borderRight: '1px solid var(--vt-surface-border)',
    padding: '20px 12px', gap: '4px',
  },
  logoArea: { padding: '4px 8px 20px', borderBottom: '1px solid var(--vt-surface-border)', marginBottom: '8px' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px',
    color: 'var(--vt-text-secondary)', textDecoration: 'none', fontFamily: 'var(--vt-font-body)',
    fontSize: '13.5px', fontWeight: 400, transition: 'background 120ms, color 120ms',
    cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'left' as const,
  },
  navItemActive: { backgroundColor: 'var(--vt-surface-hover)', color: 'var(--vt-text-primary)' },
  navItemDisabled: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px',
    color: 'var(--vt-text-disabled)', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', cursor: 'not-allowed',
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
    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px',
    color: 'var(--vt-text-secondary)', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px',
    cursor: 'pointer', border: 'none', background: 'transparent', width: '100%', textAlign: 'left' as const,
    transition: 'background 120ms, color 120ms',
  },
} as const;
