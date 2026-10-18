'use client';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// AuthCard
//
// Background, border, border-radius and padding removed.
// The auth layout's right panel provides containment and spacing.
// All other auth pages (forgot-password, reset, verify, MFA) are unaffected
// because they also render inside the same layout.
// ---------------------------------------------------------------------------

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div style={card}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={heading}>{title}</h1>
        {subtitle && <p style={sub}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthField
// ---------------------------------------------------------------------------

export function AuthField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        style={inputStyle}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--vt-brand-500)';
          e.target.style.outline = 'none';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--vt-surface-border)';
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthButton
// ---------------------------------------------------------------------------

export function AuthButton({
  children,
  loading,
  type = 'submit',
  onClick,
  variant = 'primary',
}: {
  children: ReactNode;
  loading?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
}) {
  const base = variant === 'primary' ? buttonPrimary : buttonGhost;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      style={{ ...base, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------

export function AuthError({ message }: { message: string }) {
  return (
    <p style={errorStyle} role="alert">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// AuthSuccess
// ---------------------------------------------------------------------------

export function AuthSuccess({ message }: { message: string }) {
  return (
    <p style={successStyle} role="status">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// AuthDivider
// ---------------------------------------------------------------------------

export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div style={dividerWrapper}>
      <div style={dividerLine} />
      <span style={dividerLabel}>{label}</span>
      <div style={dividerLine} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthLink (footer copy)
// ---------------------------------------------------------------------------

export function AuthLink({ children }: { children: ReactNode }) {
  return <p style={authLinkStyle}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  width: '100%',
  // background, border, borderRadius and padding intentionally omitted —
  // the split-canvas auth layout provides containment and spacing.
};

const heading: React.CSSProperties = {
  fontFamily: 'var(--vt-font-display)',
  fontSize: 'var(--vt-text-2xl)',
  fontWeight: 700,
  color: 'var(--vt-text-primary)',
  letterSpacing: '-0.02em',
  margin: '0 0 4px',
};

const sub: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-base)',
  color: 'var(--vt-text-muted)',
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-sm)',
  fontWeight: 500,
  color: 'var(--vt-text-secondary)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--vt-surface-overlay)',
  border: '1px solid var(--vt-surface-border)',
  borderRadius: '8px',
  color: 'var(--vt-text-primary)',
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-base)',
  padding: '10px 12px',
  outline: 'none',
  transition: 'border-color 120ms',
  boxSizing: 'border-box',
};

const buttonPrimary: React.CSSProperties = {
  width: '100%',
  background: 'var(--vt-brand-500)',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-base)',
  fontWeight: 500,
  padding: '11px 16px',
  transition: 'background 120ms',
};

const buttonGhost: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  color: 'var(--vt-text-secondary)',
  border: '1px solid var(--vt-surface-border)',
  borderRadius: '8px',
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-base)',
  fontWeight: 500,
  padding: '11px 16px',
  transition: 'border-color 120ms',
};

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-sm)',
  color: 'var(--vt-status-danger)',
  margin: 0,
  padding: '10px 12px',
  background: 'rgba(239,68,68,0.08)',
  borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.2)',
};

const successStyle: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-sm)',
  color: 'var(--vt-status-success)',
  margin: 0,
  padding: '10px 12px',
  background: 'rgba(16,185,129,0.08)',
  borderRadius: '6px',
  border: '1px solid rgba(16,185,129,0.2)',
};

const dividerWrapper: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const dividerLine: React.CSSProperties = {
  flex: 1,
  height: '1px',
  background: 'var(--vt-surface-border)',
};

const dividerLabel: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-xs)',
  color: 'var(--vt-text-disabled)',
  whiteSpace: 'nowrap',
};

const authLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--vt-font-body)',
  fontSize: 'var(--vt-text-sm)',
  color: 'var(--vt-text-muted)',
  margin: 0,
  textAlign: 'center',
};
