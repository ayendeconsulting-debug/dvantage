// ---------------------------------------------------------------------------
// D'Vantage — ScorePanel (Direction 2: Warm Depth)
//
// Visual redesign. Two-zone layout: content zone + persistent footer CTA.
// The footer CTA is ALWAYS rendered so the user understands what the panel
// does before they navigate to a job posting.
//
// Layout:
//   container
//   ├── content zone (variable height)
//   │   ├── [no job]       EmptyContent — branded icon + explanatory text
//   │   └── [job detected] JobHeader card + optional result card
//   └── footer (fixed at bottom of content)
//       ├── [no job]    ghost button — disabled hint
//       ├── [job, idle] primary button — "Score against my resume"
//       ├── [scoring]   primary button — spinner + "Scoring…"
//       └── [scored]    rescore text link
//
// Score cache (D9):
//   On mount, reads ACTIVE_JOB + CACHED_SCORE in one storage call.
//   If CACHED_SCORE.sourceUrl === ACTIVE_JOB.sourceUrl, the result is
//   restored immediately — no API call, no token consumption.
//   Cache is written by message-router after every successful score.
//   Cache is invalidated automatically when ACTIVE_JOB.sourceUrl changes
//   (i.e. user navigates to a different job posting).
//
// Token usage: Atlas primitives (--vt-surface-*, --vt-border-*, --vt-text-*)
// Imports: ../../shared/* (ScorePanel lives in sidepanel/components/)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { ExtractedJob, ScoreResult } from '../../shared/types';
import type { SidepanelToBackground } from '../../shared/messages';
import { STORAGE_KEYS } from '../../shared/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidJob(value: unknown): value is ExtractedJob {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['description'] === 'string' && typeof v['sourceUrl'] === 'string';
}

function isValidScoreResult(value: unknown): value is ScoreResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['score'] === 'number' &&
    Array.isArray(v['keywordGaps']) &&
    Array.isArray(v['semanticGaps']) &&
    typeof v['optimizationUrl'] === 'string'
  );
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const stroke = 5;
  const cx = 36;
  const cy = 36;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - score / 100);

  // RAG scale: Green = Excellent (75–100), Amber = Good (50–74), Red = Poor (0–49)
  const color =
    score >= 75 ? 'var(--vt-success)' : score >= 50 ? 'var(--vt-warning)' : 'var(--vt-danger)';

  return (
    <div style={ringStyles.wrapper} aria-label={`ATS score: ${score} out of 100`}>
      <svg width={cx * 2} height={cy * 2} viewBox={`0 0 ${cx * 2} ${cy * 2}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--vt-surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
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
    position: 'relative' as const,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    lineHeight: 1,
  },
  score: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
  },
  outOf: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '9px',
    fontWeight: 400,
    color: 'var(--vt-text-5)',
    marginTop: '2px',
  },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function EmptyContent() {
  return (
    <div style={styles.emptyContent}>
      {/* Branded icon wrap */}
      <div style={styles.emptyIconWrap} aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vt-brand-400)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      </div>
      <span style={styles.emptyTitle}>Navigate to a job posting</span>
      <span style={styles.emptyBody}>
        Open a role on LinkedIn, Greenhouse, Lever, Indeed, Ashby, or Workday.
      </span>
    </div>
  );
}

function JobHeader({ job }: { job: ExtractedJob }) {
  return (
    <div style={styles.jobCard}>
      <span style={styles.sourceChip} aria-label="Source">
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {sourceLabel(job.sourceUrl)}
      </span>

      {job.title ? (
        <h2 style={styles.jobTitle} title={job.title}>
          {job.title}
        </h2>
      ) : (
        <h2 style={{ ...styles.jobTitle, color: 'var(--vt-text-5)' }}>Untitled role</h2>
      )}

      {(job.company ?? job.location) && (
        <p style={styles.jobMeta}>{[job.company, job.location].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  );
}

function GapList({ label, items, accent }: { label: string; items: string[]; accent: string }) {
  if (items.length === 0) return null;
  return (
    <div style={styles.gapBlock}>
      <span style={{ ...styles.gapLabel, color: accent }}>{label}</span>
      <div style={styles.gapPills}>
        {items.map((item) => (
          <span key={item} style={styles.gapPill}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreResultCard({ result }: { result: ScoreResult }) {
  return (
    <div style={styles.resultCard}>
      <div style={styles.resultRow}>
        <ScoreRing score={result.score} />
        <div style={styles.resultMeta}>
          <span style={styles.atsLabel}>ATS match score</span>
          <span style={styles.atsHint}>
            {result.score >= 75
              ? 'Excellent match — ready to apply.'
              : result.score >= 50
                ? 'Good match — a few gaps to close.'
                : 'Poor match — optimise your resume first.'}
          </span>
          <a
            href={result.optimizationUrl}
            style={styles.optimiseLink}
            onClick={(e) => {
              e.preventDefault();
              chrome.tabs.create({ url: result.optimizationUrl });
            }}
          >
            Optimise in D&apos;Vantage
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
      <GapList label="Keyword gaps" items={result.keywordGaps} accent="var(--vt-warning)" />
      <GapList label="Experience gaps" items={result.semanticGaps} accent="var(--vt-danger)" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScorePanel() {
  const [activeJob, setActiveJob] = useState<ExtractedJob | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  /**
   * Tracks the sourceUrl of the currently displayed job.
   * Used inside handleStorageChange to distinguish between:
   *   (a) same job re-detected after a page refresh → keep score
   *   (b) navigation to a different posting → clear score
   * A ref is required because the closure over `activeJob` state would
   * capture a stale value from the time the effect ran.
   */
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    // Read ACTIVE_JOB and CACHED_SCORE in a single storage call.
    // If the cached score belongs to the current job (sourceUrl match),
    // restore it immediately — no API call, no token consumption.
    chrome.storage.local.get([STORAGE_KEYS.ACTIVE_JOB, STORAGE_KEYS.CACHED_SCORE], (stored) => {
      if (!mountedRef.current) return;

      const job = stored[STORAGE_KEYS.ACTIVE_JOB];
      const cached = stored[STORAGE_KEYS.CACHED_SCORE];

      if (!isValidJob(job)) return;

      activeUrlRef.current = job.sourceUrl;
      setActiveJob(job);

      // Cache hit: restore score instantly without an API call.
      if (
        typeof cached === 'object' &&
        cached !== null &&
        (cached as Record<string, unknown>)['sourceUrl'] === job.sourceUrl
      ) {
        const cachedResult = (cached as Record<string, unknown>)['result'];
        if (isValidScoreResult(cachedResult)) {
          setScoreResult(cachedResult);
        }
      }
    });

    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void {
      if (area !== 'local') return;
      if (!(STORAGE_KEYS.ACTIVE_JOB in changes)) return;
      if (!mountedRef.current) return;

      const newJob = changes[STORAGE_KEYS.ACTIVE_JOB]?.newValue;
      if (isValidJob(newJob)) {
        const isSameJob = newJob.sourceUrl === activeUrlRef.current;
        activeUrlRef.current = newJob.sourceUrl;
        setActiveJob(newJob);

        if (!isSameJob) {
          // Navigated to a different posting — clear score and error.
          // Same job re-detected (page refresh) keeps the existing result.
          setScoreResult(null);
          setScoreError(null);
        }
      } else {
        activeUrlRef.current = null;
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

  function handleScore(): void {
    if (!activeJob || scoring) return;

    setScoring(true);
    setScoreResult(null);
    setScoreError(null);

    const message: SidepanelToBackground = {
      type: 'REQUEST_SCORE',
      payload: { jobDescription: activeJob.description, resumeId: null },
    };

    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (!mountedRef.current) return;
      setScoring(false);

      if (chrome.runtime.lastError) {
        setScoreError('Connection error — try again.');
        return;
      }

      if (
        typeof response === 'object' &&
        response !== null &&
        (response as Record<string, unknown>)['ok'] === true
      ) {
        const result = (response as Record<string, unknown>)['result'];
        if (isValidScoreResult(result)) {
          setScoreResult(result);
          return;
        }
      }

      setScoreError('Scoring failed — try again.');
    });
  }

  // —— Spinner SVG ———————————————————————————————————————————————————————————
  const spinner = (
    <svg
      width="13"
      height="13"
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
  );

  return (
    <div style={styles.container}>
      {/* —— Content zone ————————————————————————————————————————————————————— */}
      {!activeJob ? (
        <EmptyContent />
      ) : (
        <div style={styles.jobZone}>
          <JobHeader job={activeJob} />
          {scoreResult && <ScoreResultCard result={scoreResult} />}
          {scoreError && (
            <p style={styles.errorBanner} role="alert">
              {scoreError}
            </p>
          )}
        </div>
      )}

      {/* —— Persistent footer CTA ———————————————————————————————————————————— */}
      <div style={styles.footer}>
        {scoreResult ? (
          /* Scored — rescore as a quiet text link */
          <button type="button" style={styles.rescoreBtn} onClick={handleScore} disabled={scoring}>
            {scoring ? 'Rescoring…' : 'Rescore'}
          </button>
        ) : activeJob ? (
          /* Job detected — primary CTA */
          <button
            type="button"
            className="dvantage-btn-primary"
            style={{ maxWidth: 'none', opacity: scoring ? 0.7 : 1 }}
            onClick={handleScore}
            disabled={scoring}
          >
            {scoring ? <>{spinner} Scoring&hellip;</> : 'Score against my resume'}
          </button>
        ) : (
          /* No job — ghost hint (disabled) */
          <button type="button" className="dvantage-btn-ghost" disabled>
            Score against my resume
          </button>
        )}
      </div>

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
// Styles — Direction 2: Warm Depth
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
  },

  /* —— Empty state ———————————————————————————————————————————————————————————*/
  emptyContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '28px 20px 16px',
    textAlign: 'center' as const,
    gap: '8px',
  },
  emptyIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    backgroundColor: 'color-mix(in srgb, var(--vt-brand-500) 8%, transparent)',
    border: '0.5px solid color-mix(in srgb, var(--vt-brand-500) 20%, transparent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
    flexShrink: 0,
  },
  emptyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--vt-text-2)',
    letterSpacing: '-0.01em',
  },
  emptyBody: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11.5px',
    fontWeight: 400,
    color: 'var(--vt-text-5)',
    lineHeight: 1.6,
    maxWidth: '200px',
  },

  /* —— Job zone ——————————————————————————————————————————————————————————————*/
  jobZone: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px 14px 4px',
  },

  /* Job header card */
  jobCard: {
    backgroundColor: 'var(--vt-surface-1)',
    border: '0.5px solid var(--vt-border-2)',
    borderRadius: '10px',
    padding: '11px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
  },
  sourceChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--vt-text-5)',
    marginBottom: '3px',
  },
  jobTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--vt-text-1)',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  jobMeta: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11.5px',
    fontWeight: 400,
    color: 'var(--vt-text-4)',
    margin: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  /* —— Score result card ——————————————————————————————————————————————————— */
  resultCard: {
    backgroundColor: 'var(--vt-surface-1)',
    border: '0.5px solid var(--vt-border-2)',
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  resultMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  atsLabel: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--vt-text-2)',
    letterSpacing: '-0.01em',
  },
  atsHint: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11px',
    fontWeight: 400,
    color: 'var(--vt-text-4)',
    lineHeight: 1.45,
  },
  optimiseLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--vt-brand-400)',
    textDecoration: 'none',
    marginTop: '3px',
  },

  /* Gap lists */
  gapBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  gapLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  gapPills: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
  },
  gapPill: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '10.5px',
    fontWeight: 400,
    color: 'var(--vt-text-3)',
    backgroundColor: 'var(--vt-surface-3)',
    padding: '2px 8px',
    borderRadius: '4px',
  },

  /* —— Error ————————————————————————————————————————————————————————————————*/
  errorBanner: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11.5px',
    fontWeight: 400,
    color: 'var(--vt-danger)',
    backgroundColor: 'color-mix(in srgb, var(--vt-danger) 10%, transparent)',
    padding: '8px 10px',
    borderRadius: '6px',
    margin: '0',
  },

  /* —— Persistent footer ———————————————————————————————————————————————————*/
  footer: {
    padding: '10px 14px 14px',
  },
  rescoreBtn: {
    display: 'inline-flex',
    padding: '0',
    border: 'none',
    background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '11px',
    fontWeight: 400,
    color: 'var(--vt-text-5)',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;
