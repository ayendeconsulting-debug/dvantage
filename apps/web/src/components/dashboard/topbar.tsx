'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Sun, Moon } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Breadcrumb config — maps path segments to display labels
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  resume:       'Resumes',
  upload:       'Upload',
  jobs:         'Jobs',
  scores:       'Scores',
  optimize:     'Optimize',
  applications: 'Applications',
  settings:     'Settings',
  billing:      'Billing',
};

function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((seg, i) => ({
    label: LABELS[seg] ?? seg,
    href:  '/' + segments.slice(0, i + 1).join('/'),
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBar() {
  const pathname       = usePathname();
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const crumbs         = buildBreadcrumbs(pathname);
  const user           = (session as { user?: { name?: string } } | null)?.user;

  return (
    <header style={styles.topbar}>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={styles.breadcrumb}>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb.href} style={styles.crumbGroup}>
              {i > 0 && (
                <ChevronRight
                  size={13}
                  strokeWidth={1.5}
                  style={{ color: 'var(--vt-text-disabled)' }}
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span style={styles.crumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} style={styles.crumbLink}>
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Right side — theme toggle + user pill */}
      <div style={styles.rightGroup}>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={styles.themeBtn}
          type="button"
        >
          {theme === 'dark' ? (
            <Sun size={15} strokeWidth={1.5} />
          ) : (
            <Moon size={15} strokeWidth={1.5} />
          )}
        </button>

        {/* User pill */}
        {user && (
          <div style={styles.userPill}>
            <div style={styles.avatar} aria-hidden="true">
              {user.name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <span style={styles.userName}>{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  topbar: {
    height:          '52px',
    borderBottom:    '1px solid var(--vt-surface-border)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '0 24px',
    backgroundColor: 'var(--vt-surface-raised)',
    flexShrink:      0,
    transition:      'background-color 320ms cubic-bezier(0.4,0,0.2,1)',
  },
  breadcrumb: {
    display:    'flex',
    alignItems: 'center',
    gap:        '4px',
  },
  crumbGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        '4px',
  },
  crumbLink: {
    fontFamily:     'var(--vt-font-body)',
    fontSize:       '13px',
    color:          'var(--vt-text-secondary)',
    textDecoration: 'none',
  },
  crumbCurrent: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '13px',
    color:      'var(--vt-text-primary)',
    fontWeight: 500,
  },
  rightGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
  },
  themeBtn: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    width:           '32px',
    height:          '32px',
    borderRadius:    '8px',
    border:          '1px solid var(--vt-surface-border)',
    background:      'transparent',
    color:           'var(--vt-text-muted)',
    cursor:          'pointer',
    transition:      'background 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  userPill: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  avatar: {
    width:           '28px',
    height:          '28px',
    borderRadius:    '50%',
    backgroundColor: 'var(--vt-brand-600)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      'var(--vt-font-body)',
    fontSize:        '12px',
    fontWeight:      500,
    color:           '#ffffff',
    flexShrink:      0,
  },
  userName: {
    fontFamily: 'var(--vt-font-body)',
    fontSize:   '13px',
    color:      'var(--vt-text-secondary)',
  },
} as const;
