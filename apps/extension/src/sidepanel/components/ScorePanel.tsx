// ---------------------------------------------------------------------------
// D'Vantage — ScorePanel
//
// Rendered inside the side panel below ProfilePanel when the user is
// authenticated. Displays the job detected by the content script on the
// current job board page, and lets the user score their resume against it.
//
// Data strategy: stale-while-revalidate via chrome.storage.onChanged
//   1. On mount: read ACTIVE_JOB from chrome.storage.local → render if found.
//   2. chrome.storage.onChanged listener: re-renders whenever the content
//      script writes a new ACTIVE_JOB (i.e. user navigates to a new posting).
//   3. Previous score is cleared whenever a new job is detected.
//
// States:
//   idle (no job)   → "Navigate to a job posting" empty state
//   idle (job)      → job header + "Score against my resume" button
//   scoring         → job header + spinner + "Scoring…" label
//   scored          → job header + score ring + keyword/semantic gaps
//                   + "Optimise in D'Vantage" deep link
//   error           → job header + error banner + retry button
//
// D6: REQUEST_SCORE returns a stub result from the background SW (800 ms).
// D9: Background SW replaces stub with POST /v1/extension/score API call.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import type { ExtractedJob, ScoreResult }  from '../../shared/types';
import type { SidepanelToBackground }      from '../../shared/messages';
import { STORAGE_KEYS }                    from '../../shared/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a value from chrome.storage is a usable ExtractedJob.
 * We only require description (needed for scoring) and sourceUrl.
 */
function isValidJob(value: unknown): value is ExtractedJob {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['description'] === 'string' &&
    typeof v['sourceUrl']   === 'string'
  );
}

function isValidScoreResult(value: unknown): value is ScoreResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['score']           === 'number' &&
    Array.isArray(v['keywordGaps']) &&
    Array.isArray(v['semanticGaps']) &&
    typeof v['optimizationUrl'] === 'string'
  );
}

/** Derive a readable hostname label from a URL string. */
function sourceLabel(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Score ring — SVG donut showing ATS score
// ---------------------------------------------------------------------------

interface ScoreRingProps {
  score: number; // 0–100
}

function ScoreRing({ score }: ScoreRingProps) {
  const radius      = 28;
  const stroke      = 5;
  const cx          = 36;
  const cy          = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset    = circumference * (1 - score / 100);

  const color =
    score >= 80 ? 'var(--vt-success, #22c55e)' :
    score >= 60 ? 'var(--vt-brand-500)'         :
                  'var(--vt-warning, #f59e0b)';

  return (
    <div style={ringStyles.wrapper} aria-label={`ATS score: ${score} out of 100`}>
      <svg width={cx * 2} height={cy * 2} viewBox={`0 0 ${cx * 2} ${cy * 2}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="var(--vt-surface-border)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div style={ringStyles.label}>
        <span style={{ ...ringStyles.score, color }}>{score}</span>
        <span style={ringStyles.outOf}>/ 100</span>
      </div>
    </div>
  );
}

const ringStyles = {
  wrapper: {
    position:       'relative' as const,
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
  },
  label: {
    position:  'absolute' as const,
    display:   'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    lineHeight: 1,
  },
  score: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '18px',
    fontWeight:    700,
    letterSpacing: '-0.03em',
  },
  outOf: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '9px',
    fontWeight: 400,
    color:      'var(--vt-text-secondary)',
    marginTop:  '2px',
  },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div style={styles.emptyContainer}>
      {/* Briefcase icon — inline SVG */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--vt-text-disabled)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ marginBottom: '10px', flexShrink: 0 }}
      >
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
      <span style={styles.emptyTitle}>Navigate to a job posting</span>
      <span style={styles.emptyBody}>
        Open a role on LinkedIn, Greenhouse, Lever, Indeed, Ashby, or Workday to score your resume.
      </span>
    </div>
  );
}

interface JobHeaderProps {
  job: ExtractedJob;
}

function JobHeader({ job }: JobHeaderProps) {
  return (
    <div style={styles.jobHeader}>
      {/* Source chip */}
      <span style={styles.sourceChip} aria-label="Detected on">
        {/* Globe icon */}
        <svg
          width="9" height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {sourceLabel(job.sourceUrl)}
      </span>

      {/* Job title */}
      {job.title ? (
        <h2 style={styles.jobTitle} title={job.title}>{job.title}</h2>
      ) : (
        <h2 style={{ ...styles.jobTitle, color: 'var(--vt-text-disabled)' }}>Untitled role</h2>
      )}

      {/* Company + location */}
      {(job.company ?? job.location) && (
        <p style={styles.jobMeta}>
          {[job.company, job.location].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

interface GapListProps {
  label:  string;
  items:  string[];
  accent: string;
}

function GapList({ label, items, accent }: GapListProps) {
  if (items.length === 0) return null;
  return (
    <div style={styles.gapBlock}>
      <span style={{ ...styles.gapLabel, color: accent }}>{label}</span>
      <div style={styles.gapPills}>
        {items.map((item) => (
          <span key={item} style={styles.gapPill}>{item}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScorePanel() {
  const [activeJob,    setActiveJob]    = useState<ExtractedJob | null>(null);
  const [scoreResult,  setScoreResult]  = useState<ScoreResult | null>(null);
  const [scoring,      setScoring]      = useState(false);
  const [scoreError,   setScoreError]   = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // ── Read cached ACTIVE_JOB on mount ────────────────────────────────────
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB], (result) => {
      if (!mountedRef.current) return;
      const job = result[STORAGE_KEYS.ACTIVE_JOB];
      if (isValidJob(job)) {
        setActiveJob(job);
      }
    });

    // ── Listen for ACTIVE_JOB changes (content script found a new job) ─────
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area:    string,
    ): void {
      if (area !== 'local')                         return;
      if (!(STORAGE_KEYS.ACTIVE_JOB in changes))   return;
      if (!mountedRef.current)                      return;

      const newJob = changes[STORAGE_KEYS.ACTIVE_JOB]?.newValue;

      if (isValidJob(newJob)) {
        setActiveJob(newJob);
        setScoreResult(null); // clear previous score on new job navigation
        setScoreError(null);
      } else {
        setActiveJob(null);
        setScoreResult(null);
        setScoreError(null);
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      mountedRef.current = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // ── Score handler ─────────────────────────────────────────────────────────
  function handleScore(): void {
    if (!activeJob || scoring) return;

    setScoring(true);
    setScoreResult(null);
    setScoreError(null);

    const message: SidepanelToBackground = {
      type:    'REQUEST_SCORE',
      payload: { jobDescription: activeJob.description, resumeId: null },
    };

    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (!mountedRef.current) return;
      setScoring(false);

      if (chrome.runtime.lastError) {
        setScoreError('Connection error. Please try again.');
        return;
      }

      if (
        typeof response === 'object' && response !== null &&
        (response as Record<string, unknown>)['ok'] === true
      ) {
        const result = (response as Record<string, unknown>)['result'];
        if (isValidScoreResult(result)) {
          setScoreResult(result);
          return;
        }
      }

      setScoreError('Scoring failed. Please try again.');
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!activeJob) {
    return <EmptyState />;
  }

  return (
    <div style={styles.container}>
      <JobHeader job={activeJob} />

      <div style={styles.body}>
        {/* Score result */}
        {scoreResult && (
          <div style={styles.resultBlock}>
            <div style={styles.resultRow}>
              <ScoreRing score={scoreResult.score} />
              <div style={styles.resultMeta}>
                <span style={styles.atsLabel}>ATS match score</span>
                <span style={styles.atsHint}>
                  {scoreResult.score >= 80
                    ? 'Strong match — ready to apply.'
                    : scoreResult.score >= 60
                    ? 'Good match — a few gaps to close.'
                    : 'Gaps detected — optimise your resume.'}
                </span>
              </div>
            </div>

            <GapList
              label="Keyword gaps"
              items={scoreResult.keywordGaps}
              accent="var(--vt-warning, #f59e0b)"
            />
            <GapList
              label="Experience gaps"
              items={scoreResult.semanticGaps}
              accent="var(--vt-danger, #ef4444)"
            />

            {/* Optimise CTA — deep link to web app */}
            <a
              href={scoreResult.optimizationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.optimiseLink}
              onClick={(e) => {
                e.preventDefault();
                chrome.tabs.create({ url: scoreResult.optimizationUrl });
              }}
            >
              Optimise in D&apos;Vantage
              {/* External link icon */}
              <svg
                width="10" height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}

        {/* Error banner */}
        {scoreError && (
          <p style={styles.errorBanner} role="alert">
            {scoreError}
          </p>
        )}

        {/* Score / Retry button */}
        {!scoreResult && (
          <button
            type="button"
            className="dvantage-btn-primary"
            style={{
              width:   '100%',
              opacity: scoring ? 0.7 : 1,
              cursor:  scoring ? 'not-allowed' : 'pointer',
            }}
            onClick={handleScore}
            disabled={scoring}
            aria-label={scoring ? 'Scoring your resume…' : 'Score this job against your resume'}
          >
            {scoring ? (
              <>
                {/* Spinner — CSS animation on inline SVG */}
                <svg
                  width="14" height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                  style={{ animation: 'dvantage-spin 700ms linear infinite', flexShrink: 0 }}
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Scoring&hellip;
              </>
            ) : (
              scoreError ? 'Retry' : 'Score against my resume'
            )}
          </button>
        )}

        {/* Rescore button shown alongside a result */}
        {scoreResult && (
          <button
            type="button"
            style={styles.rescoreBtn}
            onClick={handleScore}
            disabled={scoring}
          >
            Rescore
          </button>
        )}
      </div>

      {/* Keyframe for spinner — injected once */}
      <style>{`
        @keyframes dvantage-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '0',
  },

  // ── Empty state ────────────────────────────────────────────────────────
  emptyContainer: {
    display:        'flex',
    flexDirection:  'column' as const,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '32px 20px',
    textAlign:      'center' as const,
    gap:            '0',
  },
  emptyTitle: {
    fontFamily:   "'Outfit', sans-serif",
    fontSize:     '13px',
    fontWeight:   600,
    color:        'var(--vt-text-secondary)',
    marginBottom: '6px',
    letterSpacing: '-0.01em',
  },
  emptyBody: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '11.5px',
    fontWeight: 400,
    color:      'var(--vt-text-disabled)',
    lineHeight: 1.55,
    maxWidth:   '220px',
  },

  // ── Job header ─────────────────────────────────────────────────────────
  jobHeader: {
    padding:         '12px 16px 10px',
    borderBottom:    '1px solid var(--vt-surface-border)',
    backgroundColor: 'var(--vt-surface-raised)',
  },
  sourceChip: {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          '4px',
    fontFamily:   "'DM Sans', sans-serif",
    fontSize:     '10px',
    fontWeight:   500,
    color:        'var(--vt-text-disabled)',
    marginBottom: '5px',
    letterSpacing: '0.01em',
  },
  jobTitle: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '14px',
    fontWeight:    700,
    color:         'var(--vt-text-primary)',
    letterSpacing: '-0.02em',
    lineHeight:    1.2,
    margin:        '0 0 4px',
    overflow:      'hidden',
    textOverflow:  'ellipsis',
    whiteSpace:    'nowrap' as const,
  },
  jobMeta: {
    fontFamily:   "'DM Sans', sans-serif",
    fontSize:     '11.5px',
    fontWeight:   400,
    color:        'var(--vt-text-secondary)',
    margin:       0,
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },

  // ── Body ───────────────────────────────────────────────────────────────
  body: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap:     '12px',
  },

  // ── Score result ───────────────────────────────────────────────────────
  resultBlock: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '12px',
  },
  resultRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '14px',
  },
  resultMeta: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '3px',
    flex:          1,
    minWidth:      0,
  },
  atsLabel: {
    fontFamily:    "'Outfit', sans-serif",
    fontSize:      '12px',
    fontWeight:    600,
    color:         'var(--vt-text-primary)',
    letterSpacing: '-0.01em',
  },
  atsHint: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize:   '11px',
    fontWeight: 400,
    color:      'var(--vt-text-secondary)',
    lineHeight: 1.45,
  },

  // ── Gap lists ──────────────────────────────────────────────────────────
  gapBlock: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           '6px',
  },
  gapLabel: {
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '10.5px',
    fontWeight:    500,
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
  },
  gapPills: {
    display:   'flex',
    flexWrap:  'wrap' as const,
    gap:       '4px',
  },
  gapPill: {
    fontFamily:      "'DM Sans', sans-serif",
    fontSize:        '10.5px',
    fontWeight:      400,
    color:           'var(--vt-text-secondary)',
    backgroundColor: 'var(--vt-surface-border)',
    padding:         '2px 8px',
    borderRadius:    '4px',
  },

  // ── Optimise link ──────────────────────────────────────────────────────
  optimiseLink: {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '5px',
    fontFamily:     "'DM Sans', sans-serif",
    fontSize:       '11.5px',
    fontWeight:     500,
    color:          'var(--vt-brand-500)',
    textDecoration: 'none',
    alignSelf:      'flex-start' as const,
    letterSpacing:  '0.01em',
  },

  // ── Error banner ───────────────────────────────────────────────────────
  errorBanner: {
    fontFamily:      "'DM Sans', sans-serif",
    fontSize:        '11.5px',
    fontWeight:      400,
    color:           'var(--vt-danger, #ef4444)',
    backgroundColor: 'color-mix(in srgb, var(--vt-danger, #ef4444) 10%, transparent)',
    padding:         '8px 10px',
    borderRadius:    '6px',
    margin:          0,
  },

  // ── Rescore button ─────────────────────────────────────────────────────
  rescoreBtn: {
    display:       'inline-flex',
    alignItems:    'center',
    padding:       '0',
    border:        'none',
    background:    'transparent',
    fontFamily:    "'DM Sans', sans-serif",
    fontSize:      '11px',
    fontWeight:    400,
    color:         'var(--vt-text-secondary)',
    cursor:        'pointer',
    alignSelf:     'flex-start' as const,
    letterSpacing: '0.01em',
  },
} satisfies Record<string, CSSProperties>;
