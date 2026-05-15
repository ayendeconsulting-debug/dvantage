'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  Target,
  Briefcase,
  Zap,
  AlertCircle,
  Loader2,
  ChevronRight,
  Plus,
  Upload,
} from 'lucide-react';
import { getDashboard } from '@/lib/api/dashboard';
import type { DashboardData } from '@/lib/api/dashboard';
import { useSession } from '@/lib/auth-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(n: number): string {
  if (n >= 75) return 'var(--vt-status-success)';
  if (n >= 50) return 'var(--vt-status-warning)';
  return 'var(--vt-status-danger)';
}

function getGreeting(name?: string): string {
  const h    = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = name?.split(' ')[0];
  return `Good ${time}${first ? `, ${first}` : ''}`;
}

function formatDateLabel(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86_400_000)  return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseStatusConfig(s: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    complete:   { label: 'Ready',      color: 'var(--vt-status-success)' },
    processing: { label: 'Processing', color: 'var(--vt-status-warning)' },
    uploaded:   { label: 'Uploading',  color: 'var(--vt-status-warning)' },
    failed:     { label: 'Failed',     color: 'var(--vt-status-danger)'  },
    pending:    { label: 'Pending',    color: 'var(--vt-text-muted)'     },
  };
  return map[s] ?? { label: s, color: 'var(--vt-text-muted)' };
}

// ---------------------------------------------------------------------------
// Activity feed — merged + sorted timeline
// ---------------------------------------------------------------------------

type FeedKind = 'resume' | 'score';

interface FeedItem {
  id:        string;
  kind:      FeedKind;
  title:     string;
  sub:       string | null;
  dateLabel: string;
  rawDate:   string;
  score?:    number;
  status:    string;
  href:      string;
}

function buildFeed(data: DashboardData): FeedItem[] {
  const resumes: FeedItem[] = data.recentResumes.map(r => ({
    id:        r.id,
    kind:      'resume' as const,
    title:     r.fileName,
    sub:       null,
    dateLabel: formatDateLabel(r.createdAt),
    rawDate:   r.createdAt,
    status:    r.parseStatus,
    href:      `/dashboard/resume/${r.id}`,
  }));

  const scores: FeedItem[] = data.recentScores.map(s => ({
    id:        s.scoreId,
    kind:      'score' as const,
    title:     s.jobTitle ?? 'Untitled role',
    sub:       s.company,
    dateLabel: formatDateLabel(s.createdAt),
    rawDate:   s.createdAt,
    score:     s.overallScore,
    status:    s.scoringStatus,
    href:      `/dashboard/jobs/${s.jobDescriptionId}/scores/${s.scoreId}`,
  }));

  return [...resumes, ...scores]
    .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())
    .slice(0, 6);
}

// ---------------------------------------------------------------------------
// Score ring SVG
// ---------------------------------------------------------------------------

function ScoreRing({
  score,
  size = 120,
}: {
  score?: number;
  size?: number;
}) {
  const r    = size * 0.42;
  const circ = 2 * Math.PI * r;
  const sw   = size * 0.058;
  const hasScore = score !== undefined;
  const color    = hasScore ? scoreColor(score) : 'var(--vt-surface-hover)';
  const offset   = hasScore ? circ * (1 - score / 100) : circ;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--vt-surface-border)"
        strokeWidth={sw}
        {...(!hasScore ? { strokeDasharray: '4 5' } : {})}
      />
      {/* Fill */}
      {hasScore && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon:  LucideIcon;
  label: string;
  used:  number;
  limit: number | null;
}) {
  const pct  = limit !== null ? Math.min((used / limit) * 100, 100) : 100;
  const warn = limit !== null && pct >= 80;

  return (
    <div style={{
      background:   'var(--vt-surface-raised)',
      border:       '1px solid var(--vt-surface-border)',
      borderRadius: '12px',
      padding:      '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon size={13} strokeWidth={1.5} color="var(--vt-text-muted)" />
        <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11px', color: 'var(--vt-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--vt-font-display)', fontSize: '26px', fontWeight: 600, color: 'var(--vt-text-primary)', letterSpacing: '-0.025em', lineHeight: 1 }}>
          {used}
        </span>
        {limit !== null ? (
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)' }}>/ {limit}</span>
        ) : (
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11px', color: 'var(--vt-brand-400)' }}>unlimited</span>
        )}
      </div>

      <div style={{ height: 3, background: 'var(--vt-surface-border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height:     '100%',
          width:      `${pct}%`,
          borderRadius: 2,
          background: warn ? 'var(--vt-status-warning)' : 'var(--vt-brand-500)',
          transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const QUICK_ACTIONS: ReadonlyArray<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/dashboard/resume/upload', icon: Upload,    label: 'Upload resume' },
  { href: '/dashboard/jobs',          icon: Plus,      label: 'Add job'       },
  { href: '/dashboard/applications',  icon: Briefcase, label: 'Track app'     },
];

export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const { data: session } = useSession();
  const userName = (session as { user?: { name?: string } } | null)?.user?.name;

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // -- Loading ---------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
        <style>{`@keyframes vt-spin{to{transform:rotate(360deg)}}`}</style>
        <Loader2 size={22} strokeWidth={1.5} style={{ color: 'var(--vt-text-muted)', animation: 'vt-spin 1s linear infinite' }} />
        <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)' }}>Loading dashboard…</span>
      </div>
    );
  }

  // -- Error -----------------------------------------------------------------
  if (error !== null || data === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 8, color: 'var(--vt-status-danger)' }}>
        <AlertCircle size={22} strokeWidth={1.5} />
        <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>{error ?? 'Failed to load dashboard'}</span>
      </div>
    );
  }

  // -- Derived data ----------------------------------------------------------
  const latestScore = data.recentScores[0];
  const isPremium   = data.plan === 'premium';
  const feed        = buildFeed(data);
  const showOptCta  = latestScore && latestScore.overallScore < 80 && latestScore.scoringStatus === 'complete';

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>

      {/* Responsive styles injected once per render */}
      <style>{`
        @keyframes vt-spin { to { transform: rotate(360deg); } }

        .vt-hero-grid {
          display: grid;
          grid-template-columns: 230px 1fr;
          gap: 16px;
          align-items: start;
          margin-bottom: 16px;
        }
        .vt-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .vt-quick-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding-top: 16px;
          border-top: 1px solid var(--vt-surface-border);
        }

        /* ── Mobile ≤ 640px ── */
        @media (max-width: 640px) {
          .vt-hero-grid {
            grid-template-columns: 1fr;
          }
          .vt-ring-panel-inner {
            flex-direction: row !important;
            text-align: left !important;
            gap: 20px !important;
          }
          .vt-ring-label {
            display: none !important;
          }
          .vt-stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .vt-cta-card {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }

        /* ── Theme-aware hover on feed rows ── */
        .vt-feed-row:hover {
          background: var(--vt-surface-hover) !important;
        }
        .vt-theme-btn:hover {
          background: var(--vt-surface-hover) !important;
          color: var(--vt-text-primary) !important;
          border-color: var(--vt-surface-hover) !important;
        }
        .vt-quick-link:hover {
          background: var(--vt-surface-hover) !important;
          border-color: var(--vt-surface-hover) !important;
          color: var(--vt-text-primary) !important;
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: 'clamp(20px,3vw,26px)', fontWeight: 600, color: 'var(--vt-text-primary)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.2 }}>
            {getGreeting(userName)}<span style={{ color: 'var(--vt-brand-500)' }}>.</span>
          </h1>
          <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: '4px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {!isPremium && (
          <Link
            href="/dashboard/settings/billing"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, color: 'var(--vt-brand-400)', fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}
          >
            <Zap size={12} strokeWidth={2} />
            Upgrade to Premium
          </Link>
        )}
      </div>

      {/* ── Hero: score ring + activity feed ── */}
      <div className="vt-hero-grid">

        {/* Score ring panel */}
        <div style={{ background: 'var(--vt-surface-raised)', border: '1px solid var(--vt-surface-border)', borderRadius: 14, padding: '20px 16px', position: 'relative' }}>

          <span
            className="vt-ring-label"
            style={{ position: 'absolute', top: 12, left: 14, fontFamily: 'var(--vt-font-mono)', fontSize: '9px', color: 'var(--vt-text-disabled)', letterSpacing: '0.07em', textTransform: 'uppercase' }}
          >
            Latest ATS Score
          </span>

          <div
            className="vt-ring-panel-inner"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 12 }}
          >
            {/* Ring + number overlay */}
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ScoreRing score={latestScore?.overallScore} size={116} />
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {latestScore ? (
                  <>
                    <span style={{ fontFamily: 'var(--vt-font-display)', fontSize: '32px', fontWeight: 700, color: scoreColor(latestScore.overallScore), lineHeight: 1, letterSpacing: '-0.03em' }}>
                      {latestScore.overallScore}
                    </span>
                    <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '9px', color: 'var(--vt-text-muted)', marginTop: 1 }}>/100</span>
                  </>
                ) : (
                  <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '20px', color: 'var(--vt-text-disabled)' }}>—</span>
                )}
              </div>
            </div>

            {/* Job info or empty CTA */}
            {latestScore ? (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 2px' }}>
                  {latestScore.jobTitle ?? 'Untitled role'}
                </p>
                {latestScore.company && (
                  <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
                    {latestScore.company}
                  </p>
                )}
                <Link
                  href={`/dashboard/jobs/${latestScore.jobDescriptionId}/scores/${latestScore.scoreId}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 12, fontFamily: 'var(--vt-font-body)', fontSize: '11.5px', color: 'var(--vt-brand-400)', textDecoration: 'none' }}
                >
                  Full report <ChevronRight size={11} strokeWidth={2} />
                </Link>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: '0 0 12px' }}>No scores yet</p>
                <Link
                  href="/dashboard/jobs"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'var(--vt-brand-500)', borderRadius: 7, fontFamily: 'var(--vt-font-body)', fontSize: '12px', fontWeight: 500, color: '#fff', textDecoration: 'none' }}
                >
                  <Target size={12} strokeWidth={2} /> Score resume
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div style={{ background: 'var(--vt-surface-raised)', border: '1px solid var(--vt-surface-border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--vt-surface-border)' }}>
            <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--vt-text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Recent activity
            </span>
          </div>

          {feed.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)' }}>
              Upload a resume to get started.
            </div>
          ) : (
            feed.map((item, idx) => {
              const isLast = idx === feed.length - 1;
              const cfg    = item.kind === 'resume' ? parseStatusConfig(item.status) : null;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="vt-feed-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: isLast ? 'none' : '1px solid var(--vt-surface-border)', textDecoration: 'none', transition: 'background 120ms ease' }}
                >
                  {/* Icon / score badge */}
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--vt-surface-overlay)', border: '1px solid var(--vt-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.kind === 'score' && item.score !== undefined ? (
                      <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', fontWeight: 700, color: scoreColor(item.score) }}>
                        {item.score}
                      </span>
                    ) : (
                      <FileText size={13} strokeWidth={1.5} color="var(--vt-text-muted)" />
                    )}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--vt-text-body)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </p>
                    {item.sub && (
                      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11px', color: 'var(--vt-text-muted)', margin: '1px 0 0' }}>
                        {item.sub}
                      </p>
                    )}
                  </div>

                  {/* Date + status */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: 'var(--vt-text-muted)' }}>
                      {item.dateLabel}
                    </span>
                    {cfg && (
                      <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '9px', color: cfg.color }}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="vt-stats-grid">
        <StatCard icon={Target}    label="ATS Scores"    used={data.usage.atsScores.used}     limit={data.usage.atsScores.limit}     />
        <StatCard icon={Zap}       label="Optimisations" used={data.usage.optimizations.used} limit={data.usage.optimizations.limit} />
        <StatCard icon={Briefcase} label="Jobs Created"  used={data.usage.jobsCreated.used}   limit={data.usage.jobsCreated.limit}   />
      </div>

      {/* ── Contextual CTA ── */}
      {showOptCta && (
        <div
          className="vt-cta-card"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', background: 'linear-gradient(135deg, var(--vt-surface-overlay) 0%, var(--vt-surface-raised) 100%)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, marginBottom: 16 }}
        >
          <div>
            <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 3px' }}>
              Your score can reach higher
            </p>
            <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
              AI optimisation closes keyword gaps — without fabricating experience
            </p>
          </div>
          <Link
            href={`/dashboard/jobs/${latestScore.jobDescriptionId}/scores/${latestScore.scoreId}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: 'var(--vt-brand-500)', borderRadius: 8, fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: '#ffffff', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Zap size={13} strokeWidth={2} />
            Optimise resume
          </Link>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div className="vt-quick-row">
        <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: 'var(--vt-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 4 }}>
          Quick actions
        </span>
        {QUICK_ACTIONS.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="vt-quick-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: 'var(--vt-surface-raised)', border: '1px solid var(--vt-surface-border)', borderRadius: 7, fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', color: 'var(--vt-text-secondary)', textDecoration: 'none', transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease' }}
          >
            <Icon size={12} strokeWidth={1.5} />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
