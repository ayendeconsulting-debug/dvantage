'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  Loader,
  Sparkles,
  CheckCircle2,
  XCircle,
  FileText,
  FileType,
  TrendingUp,
} from 'lucide-react';
import { getScore, requestOptimization, getOptimization } from '@/lib/api/job';
import { getResume } from '@/lib/api/resume';
import type {
  AtsScoreDetail,
  OptimizationResult,
  OptimizationChange,
  ResumeData,
  ATSSectionScores,
} from '@/lib/api/job';
import type { ResumeVersionDetail } from '@/lib/api/resume';

const API_BASE =
  (typeof process !== 'undefined' && process.env['NEXT_PUBLIC_API_URL']) ||
  'http://localhost:3001';

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------

async function triggerOptimizedExport(
  jobId: string,
  scoreId: string,
  format: 'pdf' | 'docx',
  contactName: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/v1/jobs/${jobId}/scores/${scoreId}/optimize/export/${format}`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Export failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${contactName.replace(/\s+/g, '-')}-optimized.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--vt-status-success)';
  if (score >= 60) return 'var(--vt-brand-400)';
  if (score >= 40) return 'var(--vt-status-warning)';
  return 'var(--vt-status-danger)';
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'var(--vt-status-success)';
  if (delta < 0) return 'var(--vt-status-danger)';
  return 'var(--vt-text-disabled)';
}

// ---------------------------------------------------------------------------
// Baseline score card Ã¢â‚¬â€ compact, muted Ã¢â‚¬â€ shown PRE-optimization only
// ---------------------------------------------------------------------------

function BaselineScoreCard({ score }: { score: number }) {
  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      gap:             '20px',
      border:          '1px solid var(--vt-surface-border)',
      borderRadius:    '8px',
      padding:         '16px 20px',
      backgroundColor: 'var(--vt-surface-raised)',
      marginBottom:    '16px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--vt-font-display)',
          fontSize:   '32px',
          fontWeight: 700,
          color:      'var(--vt-text-muted)',
          lineHeight: 1,
        }}>
          {score}
        </span>
        <span style={{
          fontFamily: 'var(--vt-font-mono)',
          fontSize:   '10px',
          color:      'var(--vt-text-disabled)',
          marginTop:  '2px',
        }}>
          / 100
        </span>
      </div>
      <div>
        <p style={{
          fontFamily: 'var(--vt-font-body)',
          fontSize:   '13px',
          fontWeight: 500,
          color:      'var(--vt-text-secondary)',
          margin:     '0 0 3px',
        }}>
          Baseline score
        </p>
        <p style={{
          fontFamily: 'var(--vt-font-body)',
          fontSize:   '12px',
          color:      'var(--vt-text-muted)',
          margin:     0,
          lineHeight: 1.5,
        }}>
          Optimize your resume to unlock your real match potential.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score hero Ã¢â‚¬â€ full size, colored Ã¢â‚¬â€ shown POST-optimization only
// ---------------------------------------------------------------------------

interface ScoreHeroProps {
  baseline:  number;
  optimized: number | null;
}

function ScoreHero({ baseline, optimized }: ScoreHeroProps) {
  const isComplete = optimized !== null;
  const delta      = isComplete ? optimized - baseline : 0;

  return (
    <div style={{
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      border:          '1px solid var(--vt-surface-border)',
      borderRadius:    '8px',
      padding:         '28px 16px',
      backgroundColor: 'var(--vt-surface-raised)',
      gap:             '4px',
    }}>
      <span style={{
        fontFamily: 'var(--vt-font-display)',
        fontSize:   '60px',
        fontWeight: 700,
        color:      scoreColor(isComplete ? optimized : baseline),
        lineHeight: 1,
      }}>
        {isComplete ? optimized : baseline}
      </span>
      <span style={{
        fontFamily: 'var(--vt-font-mono)',
        fontSize:   '11px',
        color:      'var(--vt-text-disabled)',
        marginTop:  '2px',
      }}>
        out of 100
      </span>
      <span style={{
        fontFamily: 'var(--vt-font-body)',
        fontSize:   '12px',
        color:      'var(--vt-text-muted)',
        marginTop:  '4px',
      }}>
        {isComplete ? 'Optimized score' : 'Overall match'}
      </span>
      {isComplete && (
        <div style={{
          display:         'flex',
          alignItems:      'center',
          gap:             '8px',
          marginTop:       '10px',
          padding:         '6px 12px',
          backgroundColor: 'var(--vt-surface-overlay)',
          borderRadius:    '6px',
        }}>
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)' }}>
            was {baseline}
          </span>
          <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', fontWeight: 500, color: deltaColor(delta) }}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section bars
// ---------------------------------------------------------------------------

interface SectionBarsProps {
  label:  string;
  before: number;
  after:  number | null;
}

function SectionBars({ label, before, after }: SectionBarsProps) {
  const isComplete = after !== null;
  const delta      = isComplete ? after - before : 0;

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', textTransform: 'capitalize' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isComplete && (
            <span style={{
              fontFamily:      'var(--vt-font-mono)',
              fontSize:        '11px',
              fontWeight:      500,
              color:           deltaColor(delta),
              backgroundColor: delta > 0 ? 'var(--vt-bg-success)' : delta < 0 ? 'var(--vt-bg-danger)' : 'transparent',
              padding:         '1px 6px',
              borderRadius:    '4px',
            }}>
              {delta > 0 ? `+${delta}` : delta === 0 ? '\u2014' : delta}
            </span>
          )}
          <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', color: isComplete ? scoreColor(after) : scoreColor(before), fontWeight: 500 }}>
            {isComplete ? after : before}
          </span>
        </div>
      </div>
      {!isComplete ? (
        <div style={{ height: '5px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${before}%`, backgroundColor: scoreColor(before), borderRadius: '3px', transition: 'width 700ms cubic-bezier(0,0,0.2,1)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: 'var(--vt-text-disabled)', width: '36px', textAlign: 'right', flexShrink: 0 }}>{before}</span>
            <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${before}%`, backgroundColor: 'var(--vt-text-disabled)', borderRadius: '3px', opacity: 0.45 }} />
            </div>
            <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: 'var(--vt-text-disabled)', width: '32px', flexShrink: 0 }}>before</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: scoreColor(after), width: '36px', textAlign: 'right', flexShrink: 0 }}>{after}</span>
            <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${after}%`, backgroundColor: scoreColor(after), borderRadius: '3px', transition: 'width 700ms cubic-bezier(0,0,0.2,1)' }} />
            </div>
            <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '10px', color: scoreColor(after), width: '32px', flexShrink: 0 }}>after</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyword pills
// ---------------------------------------------------------------------------

function Pill({ text, variant }: { text: string; variant: 'gap' | 'match' }) {
  const s = variant === 'gap'
    ? { color: 'var(--vt-status-danger)',  bg: 'var(--vt-bg-danger)' }
    : { color: 'var(--vt-status-success)', bg: 'var(--vt-bg-success)' };
  return (
    <span style={{
      display:         'inline-block',
      padding:         '3px 10px',
      backgroundColor: s.bg,
      color:           s.color,
      borderRadius:    '999px',
      fontFamily:      'var(--vt-font-mono)',
      fontSize:        '11px',
      margin:          '3px',
    }}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared: keywords grid
// ---------------------------------------------------------------------------

function KeywordsSection({
  keywordGaps,
  matchedKeywords,
}: {
  keywordGaps:     string[] | null;
  matchedKeywords: string[] | null;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
      <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--vt-surface-raised)' }}>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', fontWeight: 500, color: 'var(--vt-text-secondary)', margin: '0 0 10px' }}>
          Keyword gaps <span style={{ color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-mono)' }}>{keywordGaps?.length ?? 0}</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {keywordGaps?.length
            ? keywordGaps.map(k => <Pill key={k} text={k} variant="gap" />)
            : <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-disabled)' }}>None — excellent coverage!</span>
          }
        </div>
      </div>
      <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--vt-surface-raised)' }}>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', fontWeight: 500, color: 'var(--vt-text-secondary)', margin: '0 0 10px' }}>
          Matched keywords <span style={{ color: 'var(--vt-status-success)', fontFamily: 'var(--vt-font-mono)' }}>{matchedKeywords?.length ?? 0}</span>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {matchedKeywords?.length
            ? matchedKeywords.map(k => <Pill key={k} text={k} variant="match" />)
            : <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-disabled)' }}>No keywords matched.</span>
          }
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: recommendations
// ---------------------------------------------------------------------------

function RecommendationsSection({ recommendations }: { recommendations: string[] | null }) {
  if (!recommendations?.length) return null;
  return (
    <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '16px', backgroundColor: 'var(--vt-surface-raised)', marginBottom: '28px' }}>
      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', fontWeight: 500, color: 'var(--vt-text-secondary)', margin: '0 0 12px' }}>Recommendations</p>
      <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {recommendations.map((r, i) => (
          <li key={i} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-body)', lineHeight: 1.6 }}>{r}</li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffView (unchanged)
// ---------------------------------------------------------------------------

function DiffView({
  original,
  optimized,
  changeLog,
}: {
  original:  ResumeData;
  optimized: ResumeData;
  changeLog: OptimizationChange[];
}) {
  const changedSections = new Set(changeLog.map(c => c.section));

  function isChanged(section: string): boolean {
    return changeLog.some(c => c.section === section || c.section.startsWith(section));
  }

  const highlightStyle: React.CSSProperties = {
    backgroundColor: 'var(--vt-bg-diff-added)',
    borderLeft:      '2px solid var(--vt-status-success)',
    paddingLeft:     '8px',
    borderRadius:    '0 4px 4px 0',
  };

  const sectionHeader: React.CSSProperties = {
    fontFamily:    'var(--vt-font-display)',
    fontSize:      '14px',
    fontWeight:    600,
    color:         'var(--vt-text-primary)',
    margin:        '0 0 12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div>
      {(original.summary || optimized.summary) && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={sectionHeader}>Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '6px' }}>
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-body)', lineHeight: 1.7, margin: 0 }}>{original.summary || '\u2014'}</p>
            </div>
            <div style={{ padding: '12px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '6px', ...(isChanged('summary') ? highlightStyle : {}) }}>
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-body)', lineHeight: 1.7, margin: 0 }}>{optimized.summary || '\u2014'}</p>
            </div>
          </div>
        </div>
      )}

      {original.experience.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={sectionHeader}>Experience</h3>
          {original.experience.map((exp, ei) => {
            const optExp = optimized.experience[ei];
            if (!optExp) return null;
            return (
              <div key={ei} style={{ marginBottom: '16px' }}>
                <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', fontWeight: 500, color: 'var(--vt-text-secondary)', margin: '0 0 8px' }}>
                  {exp.title} · {exp.company}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {exp.highlights.map((h, hi) => (
                      <li key={hi} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', color: 'var(--vt-text-body)', lineHeight: 1.6, padding: '6px 8px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '4px' }}>\u2022 {h}</li>
                    ))}
                  </ul>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(optExp.highlights ?? []).map((h, hi) => {
                      const changed = changedSections.has(`experience[${ei}].highlights[${hi}]`);
                      return (
                        <li key={hi} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', color: 'var(--vt-text-body)', lineHeight: 1.6, padding: '6px 8px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '4px', ...(changed ? highlightStyle : {}) }}>\u2022 {h}</li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h3 style={sectionHeader}>Skills</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '6px' }}>
            {original.skills.map(s => (
              <span key={s.name} style={{ display: 'inline-block', margin: '2px', padding: '2px 8px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '4px', fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-secondary)' }}>{s.name}</span>
            ))}
          </div>
          <div style={{ padding: '12px', backgroundColor: 'var(--vt-surface-overlay)', borderRadius: '6px', ...(isChanged('skills') ? highlightStyle : {}) }}>
            {optimized.skills.map(s => (
              <span key={s.name} style={{ display: 'inline-block', margin: '2px', padding: '2px 8px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '4px', fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-secondary)' }}>{s.name}</span>
            ))}
          </div>
        </div>
      </div>

      {changeLog.length > 0 && (
        <div>
          <h3 style={sectionHeader}>
            Change log{' '}
            <span style={{ color: 'var(--vt-text-disabled)', fontFamily: 'var(--vt-font-mono)', fontSize: '12px', textTransform: 'none', letterSpacing: 0 }}>
              {changeLog.length} change{changeLog.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Section', 'Was', 'Now', 'Reason'].map(h => (
                    <th key={h} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '11px', fontWeight: 500, color: 'var(--vt-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', textAlign: 'left', backgroundColor: 'var(--vt-surface-raised)', borderBottom: '1px solid var(--vt-surface-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changeLog.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--vt-surface-border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-disabled)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{c.section}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-secondary)', lineHeight: 1.5, verticalAlign: 'top', maxWidth: '200px' }}>{c.original}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-status-success)', lineHeight: 1.5, verticalAlign: 'top', maxWidth: '200px' }}>{c.optimized}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)', lineHeight: 1.5, verticalAlign: 'top' }}>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScoreDetailPage() {
  const params  = useParams<{ id: string; scoreId: string }>();
  const jobId   = params.id;
  const scoreId = params.scoreId;

  const [score,         setScore]        = useState<AtsScoreDetail | null>(null);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);
  const [origResume,    setOrigResume]   = useState<ResumeVersionDetail | null>(null);
  const [optimization,  setOptimization] = useState<OptimizationResult | null>(null);
  const [optLoading,    setOptLoading]   = useState(false);
  const [optError,      setOptError]     = useState<string | null>(null);
  const [exportingPdf,  setExportingPdf]  = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportError,   setExportError]   = useState<string | null>(null);

  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pollOptimization = useCallback(async () => {
    try {
      const data = await getOptimization(jobId, scoreId);
      setOptimization(data);
      if (data.optimizationStatus === 'pending' || data.optimizationStatus === 'optimizing') {
        optTimerRef.current = setTimeout(() => { void pollOptimization(); }, 5000);
      } else {
        setOptLoading(false);
        const fresh = await getScore(jobId, scoreId).catch(() => null);
        if (fresh) setScore(fresh);
      }
    } catch (err) {
      setOptError((err as Error).message);
      setOptLoading(false);
    }
  }, [jobId, scoreId]);

  const pollScore = useCallback(async () => {
    try {
      const data = await getScore(jobId, scoreId);
      setScore(data);
      setLoading(false);

      if (data.scoringStatus === 'pending' || data.scoringStatus === 'scoring') {
        scoreTimerRef.current = setTimeout(() => { void pollScore(); }, 3000);
      } else if (data.scoringStatus === 'complete') {
        const resume = await getResume(data.resumeVersionId).catch(() => null);
        setOrigResume(resume);
        if (data.optimizationStatus === 'complete' || data.optimizationStatus === 'failed') {
          const opt = await getOptimization(jobId, scoreId).catch(() => null);
          setOptimization(opt);
        } else if (data.optimizationStatus === 'pending' || data.optimizationStatus === 'optimizing') {
          setOptLoading(true);
          void pollOptimization();
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [jobId, scoreId, pollOptimization]);

  useEffect(() => {
    void pollScore();
    return () => {
      if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
      if (optTimerRef.current)   clearTimeout(optTimerRef.current);
    };
  }, [pollScore]);

  async function handleOptimize() {
    setOptLoading(true); setOptError(null);
    try {
      await requestOptimization(jobId, scoreId);
      void pollOptimization();
    } catch (err) {
      setOptError((err as Error).message);
      setOptLoading(false);
    }
  }

  async function handleExportPdf() {
    if (!optimization?.optimizedData) return;
    setExportingPdf(true); setExportError(null);
    try {
      await triggerOptimizedExport(jobId, scoreId, 'pdf', optimization.optimizedData.contact?.name ?? 'resume');
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportDocx() {
    if (!optimization?.optimizedData) return;
    setExportingDocx(true); setExportError(null);
    try {
      await triggerOptimizedExport(jobId, scoreId, 'docx', optimization.optimizedData.contact?.name ?? 'resume');
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExportingDocx(false);
    }
  }

  // Derived state
  const optimizationComplete = score?.optimizationStatus === 'complete';
  const optimizedOverall     = optimizationComplete ? (score.optimizedOverallScore ?? null) : null;
  const optimizedSections    = optimizationComplete ? (score.optimizedSectionScores ?? null) : null;

  const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '6px 12px', border: '1px solid var(--vt-surface-border)',
    borderRadius: '6px', color: 'var(--vt-text-secondary)',
    fontFamily: 'var(--vt-font-body)', fontSize: '12px',
    background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
  };
  const btnDisabled: React.CSSProperties = { ...btnBase, opacity: 0.45, cursor: 'not-allowed' };

  // Optimization action controls Ã¢â‚¬â€ shared between pre and post layouts.
  // Contains no hooks; safe to use as a JSX variable.
  const OptimizeControls = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
      {(!score?.optimizationStatus || score.optimizationStatus === 'none') && !optLoading && (
        <button
          onClick={() => void handleOptimize()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 18px', backgroundColor: 'var(--vt-brand-500)', color: '#ffffff', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          type="button"
        >
          <Sparkles size={14} strokeWidth={1.5} />Optimize resume
        </button>
      )}
      {(score?.optimizationStatus === 'pending' || score?.optimizationStatus === 'optimizing' || optLoading) && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--vt-status-warning)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
          <Loader size={14} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />Rewriting resume\u2026
        </div>
      )}
      {optimizationComplete && !optLoading && (
        <>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vt-status-success)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
            <CheckCircle2 size={14} strokeWidth={1.5} />Optimization complete
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={exportingPdf ? btnDisabled : btnBase} disabled={exportingPdf} onClick={() => void handleExportPdf()} type="button" title="Download optimized resume as PDF">
              {exportingPdf ? <Loader size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={12} strokeWidth={1.5} />}
              Export PDF
            </button>
            <button style={exportingDocx ? btnDisabled : btnBase} disabled={exportingDocx} onClick={() => void handleExportDocx()} type="button" title="Download optimized resume as Word document">
              {exportingDocx ? <Loader size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} /> : <FileType size={12} strokeWidth={1.5} />}
              Export DOCX
            </button>
          </div>
        </>
      )}
      {score?.optimizationStatus === 'failed' && !optLoading && (
        <button
          onClick={() => void handleOptimize()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 18px', backgroundColor: 'var(--vt-surface-overlay)', color: 'var(--vt-text-secondary)', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', border: '1px solid var(--vt-surface-border)', cursor: 'pointer' }}
          type="button"
        >
          Retry optimization
        </button>
      )}
    </div>
  );

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <Link
        href={`/dashboard/jobs/${jobId}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vt-text-muted)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginBottom: '24px', textDecoration: 'none' }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />Back to job
      </Link>

      <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: '0 0 24px' }}>
        ATS Score
      </h1>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--vt-bg-danger)', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginBottom: '20px' }}>
          <AlertCircle size={15} strokeWidth={1.5} />{error}
        </div>
      )}

      {/* Scoring in progress */}
      {(loading || score?.scoringStatus === 'pending' || score?.scoringStatus === 'scoring') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', paddingTop: '60px' }}>
          <Loader size={28} strokeWidth={1.5} style={{ color: 'var(--vt-brand-400)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: 'var(--vt-font-display)', fontSize: '16px', color: 'var(--vt-text-secondary)', margin: 0 }}>Analyzing your resume\u2026</p>
          <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: 0 }}>This usually takes 20–45 seconds.</p>
        </div>
      )}

      {/* Scoring failed */}
      {score?.scoringStatus === 'failed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--vt-bg-danger)', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
          <XCircle size={15} strokeWidth={1.5} />Scoring failed: {score.scoreError ?? 'Unknown error.'}
        </div>
      )}

      {/* Scoring complete */}
      {score?.scoringStatus === 'complete' && score.overallScore !== null && (
        <>
          {/* Ã¢â€â‚¬Ã¢â€â‚¬ PRE-OPTIMIZATION LAYOUT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
              Covers optimizationStatus: 'none' | 'pending' | 'optimizing' | 'failed'
              Optimize CTA is the primary action Ã¢â‚¬â€ shown at top.
              Score is compact and muted Ã¢â‚¬â€ it is not the result, it is the baseline.
          Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {!optimizationComplete && (
            <>
              {/* Compact baseline card */}
              <BaselineScoreCard score={score.overallScore} />

              {/* Optimization panel Ã¢â‚¬â€ primary action */}
              <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: '0 0 4px' }}>
                      AI Resume Optimization
                    </h2>
                    <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: 0 }}>
                      Rewrite your resume to close keyword gaps — without fabricating anything.
                    </p>
                  </div>
                  {OptimizeControls}
                </div>
                {optError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--vt-bg-danger)', border: '1px solid var(--vt-status-danger)', borderRadius: '6px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginTop: '12px' }}>
                    <AlertCircle size={14} strokeWidth={1.5} />{optError}
                  </div>
                )}
              </div>

              {/* Section bars Ã¢â‚¬â€ baseline context (single bar, no before/after) */}
              {score.sectionScores && (
                <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)', marginBottom: '24px' }}>
                  {(['skills', 'experience', 'education', 'keywords'] as const).map(key => (
                    <SectionBars key={key} label={key} before={score.sectionScores![key]} after={null} />
                  ))}
                </div>
              )}

              {/* Keywords */}
              <KeywordsSection keywordGaps={score.keywordGaps} matchedKeywords={score.matchedKeywords} />

              {/* Recommendations */}
              <RecommendationsSection recommendations={score.recommendations} />
            </>
          )}

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ POST-OPTIMIZATION LAYOUT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
              optimizationStatus: 'complete'
              Full score hero with delta is shown Ã¢â‚¬â€ this is the result.
              Optimization panel moves to bottom showing complete state + diff.
          Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {optimizationComplete && (
            <>
              {/* Full score hero + section bars with before/after */}
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '20px', marginBottom: '24px' }}>
                <ScoreHero baseline={score.overallScore} optimized={optimizedOverall} />
                <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)' }}>
                  {score.sectionScores && (
                    <>
                      {optimizedSections && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                          <TrendingUp size={14} strokeWidth={1.5} style={{ color: 'var(--vt-status-success)' }} />
                          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)' }}>
                            Section scores — before &amp; after optimization
                          </span>
                        </div>
                      )}
                      {(['skills', 'experience', 'education', 'keywords'] as const).map(key => (
                        <SectionBars
                          key={key}
                          label={key}
                          before={score.sectionScores![key]}
                          after={optimizedSections ? optimizedSections[key] : null}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Keywords */}
              <KeywordsSection keywordGaps={score.keywordGaps} matchedKeywords={score.matchedKeywords} />

              {/* Recommendations */}
              <RecommendationsSection recommendations={score.recommendations} />

              {/* Optimization panel Ã¢â‚¬â€ complete state with exports and diff view */}
              <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '8px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)', marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: '0 0 4px' }}>
                      AI Resume Optimization
                    </h2>
                    <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: 0 }}>
                      Rewrite your resume to close keyword gaps — without fabricating anything.
                    </p>
                  </div>
                  {OptimizeControls}
                </div>

                {exportError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--vt-bg-danger)', border: '1px solid var(--vt-status-danger)', borderRadius: '6px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginBottom: '12px' }}>
                    <AlertCircle size={14} strokeWidth={1.5} />{exportError}
                  </div>
                )}

                {optimization?.optimizedData && origResume?.structuredData && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '16px' }}>
                      {['Original', 'Optimized'].map(label => (
                        <div key={label} style={{ textAlign: 'center', fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0', borderBottom: '1px solid var(--vt-surface-border)' }}>{label}</div>
                      ))}
                    </div>
                    <DiffView
                      original={origResume.structuredData as unknown as ResumeData}
                      optimized={optimization.optimizedData}
                      changeLog={optimization.changeLog ?? []}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}



