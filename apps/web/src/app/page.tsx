import Link from 'next/link';
import { DVantageLogo } from '../components/logo/dvantage-logo';

export default function HomePage() {
  return (
    <main style={styles.main}>
      <div style={styles.content}>
        <DVantageLogo width={200} />

        <p style={styles.tagline}>From applied to interview.</p>

        <p style={styles.sub}>
          AI-powered resume scoring, optimization, and job application tracking — built for serious candidates.
        </p>

        <div style={styles.cta}>
          <Link href="/auth/sign-up" style={styles.btnPrimary}>
            Get started free
          </Link>
          <Link href="/auth/sign-in" style={styles.btnGhost}>
            Sign in
          </Link>
        </div>
      </div>

      <div style={styles.grid} aria-hidden="true" />
    </main>
  );
}

const styles = {
  main: {
    position:        'relative' as const,
    minHeight:       '100vh',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'var(--vt-surface-base)',
    overflow:        'hidden',
  },
  content: {
    position:      'relative' as const,
    zIndex:        1,
    display:       'flex',
    flexDirection: 'column' as const,
    alignItems:    'center',
    gap:           'var(--vt-space-5)',
    textAlign:     'center' as const,
    maxWidth:      '520px',
    padding:       '0 24px',
  },
  tagline: {
    fontFamily:    'var(--vt-font-body)',
    fontSize:      'var(--vt-text-lg)',
    color:         'var(--vt-text-secondary)',
    letterSpacing: '0.01em',
    margin:        0,
  },
  sub: {
    fontFamily:  'var(--vt-font-body)',
    fontSize:    'var(--vt-text-base)',
    color:       'var(--vt-text-muted)',
    lineHeight:  1.6,
    margin:      0,
  },
  cta: {
    marginTop:      'var(--vt-space-3)',
    display:        'flex',
    alignItems:     'center',
    gap:            '14px',
    flexWrap:       'wrap' as const,
    justifyContent: 'center',
  },
  btnPrimary: {
    display:         'inline-flex',
    alignItems:      'center',
    padding:         '11px 28px',
    backgroundColor: 'var(--vt-brand-500)',
    color:           '#ffffff',
    borderRadius:    '8px',
    fontFamily:      'var(--vt-font-body)',
    fontSize:        'var(--vt-text-base)',
    fontWeight:      500,
    textDecoration:  'none',
    letterSpacing:   '0.01em',
    transition:      'background 120ms',
  },
  btnGhost: {
    display:        'inline-flex',
    alignItems:     'center',
    padding:        '11px 24px',
    backgroundColor:'transparent',
    color:          'var(--vt-text-secondary)',
    border:         '1px solid var(--vt-surface-border)',
    borderRadius:   '8px',
    fontFamily:     'var(--vt-font-body)',
    fontSize:       'var(--vt-text-base)',
    fontWeight:     500,
    textDecoration: 'none',
    transition:     'border-color 120ms',
  },
  grid: {
    position:   'absolute' as const,
    inset:      0,
    zIndex:     0,
    backgroundImage: `
      linear-gradient(var(--vt-surface-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--vt-surface-border) 1px, transparent 1px)
    `,
    backgroundSize:    '48px 48px',
    opacity:           0.4,
    maskImage:         'radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent)',
    WebkitMaskImage:   'radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent)',
  },
} as const;
