'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, User } from 'lucide-react';

// ---------------------------------------------------------------------------
// Settings nav items
// ---------------------------------------------------------------------------

const SETTINGS_NAV = [
  {
    label:       'Profile',
    href:        '/dashboard/settings/profile',
    icon:        User,
    description: 'Phone number and LinkedIn URL for autofill',
    disabled:    false,
  },
  {
    label:       'Billing',
    href:        '/dashboard/settings/billing',
    icon:        CreditCard,
    description: 'Manage your plan and usage',
    disabled:    false,
  },
];

export default function SettingsPage() {
  const pathname = usePathname();

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: 0 }}>Settings</h1>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: '4px 0 0' }}>Manage your account and subscription.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {SETTINGS_NAV.map((item) => {
          const isActive = pathname.startsWith(item.href);
          if (item.disabled) {
            return (
              <div
                key={item.label}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: '1px solid var(--vt-surface-border)', borderRadius: '8px', backgroundColor: 'var(--vt-surface-raised)', opacity: 0.5, cursor: 'not-allowed' }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--vt-surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <item.icon size={16} strokeWidth={1.5} style={{ color: 'var(--vt-text-disabled)' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-secondary)' }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-disabled)', marginTop: '2px' }}>{item.description}</div>
                </div>
              </div>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: `1px solid ${isActive ? 'var(--vt-brand-600)' : 'var(--vt-surface-border)'}`, borderRadius: '8px', backgroundColor: 'var(--vt-surface-raised)', textDecoration: 'none', transition: 'border-color 120ms' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: isActive ? '#1e3a5f' : 'var(--vt-surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <item.icon size={16} strokeWidth={1.5} style={{ color: isActive ? 'var(--vt-brand-400)' : 'var(--vt-text-secondary)' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)' }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-secondary)', marginTop: '2px' }}>{item.description}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
