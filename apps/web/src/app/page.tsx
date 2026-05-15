import { DVantageLogo } from '../components/logo/dvantage-logo';

export default function HomePage() {
  return (
    <main style={styles.main}>
      <div style={styles.content}>
        <DVantageLogo width={200} />
        <p style={styles.tagline}>From applied to interview.</p>
        <div style={styles.statusPill}>
          <span style={styles.statusDot} />
          <span style={styles.statusText}>Milestone 1 · Auth</span>
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
  },
  tagline: {
    fontFamily:    'var(--vt-font-body)',
    fontSize:      'var(--vt-text-lg)',
    color:         'var(--vt-text-secondary)',
    letterSpacing: '0.01em',
    margin:        0,
  },
  statusPill: {
    marginTop:       'var(--vt-space-7)',
    display:         'inline-flex',
    alignItems:      'center',
    gap:             'var(--vt-space-2)',
    padding:         '6px 14px',
    borderRadius:    'var(--vt-radius-full)',
    border:          '1px solid var(--vt-surface-border)',
    backgroundColor: 'var(--vt-surface-raised)',
  },
  statusDot: {
    width:           '6px',
    height:          '6px',
    borderRadius:    '50%',
    backgroundColor: 'var(--vt-status-success)',
    boxShadow:       '0 0 6px var(--vt-status-success)',
  },
  statusText: {
    fontFamily:    'var(--vt-font-mono)',
    fontSize:      'var(--vt-text-xs)',
    color:         'var(--vt-text-muted)',
    letterSpacing: '0.05em',
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
