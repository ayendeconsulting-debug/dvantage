'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, AlertCircle, Loader, ExternalLink, Play } from 'lucide-react';
import { getJob, listScores, createScore } from '@/lib/api/job';
import { listResumes } from '@/lib/api/resume';
import type { JobDescriptionDetail, AtsScoreListItem, ScoringStatus } from '@/lib/api/job';
import type { ResumeVersionListItem } from '@/lib/api/resume';

const SCORE_STATUS: Record<ScoringStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Queued', color: 'var(--vt-status-info)', bg: 'var(--vt-bg-info)' },
  scoring: { label: 'Scoring…', color: 'var(--vt-status-warning)', bg: 'var(--vt-bg-warning)' },
  complete: { label: 'Complete', color: 'var(--vt-status-success)', bg: 'var(--vt-bg-success)' },
  failed: { label: 'Failed', color: 'var(--vt-status-danger)', bg: 'var(--vt-bg-danger)' },
};

function ScoreBadge({ status }: { status: ScoringStatus }) {
  const s = SCORE_STATUS[status];
  return (
    <span
      style={{
        fontSize: '11px',
        fontFamily: 'var(--vt-font-mono)',
        color: s.color,
        backgroundColor: s.bg,
        padding: '2px 8px',
        borderRadius: '4px',
        letterSpacing: '0.03em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {status === 'scoring' && (
        <Loader size={10} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
      )}
      {s.label}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--vt-status-success)';
  if (score >= 60) return 'var(--vt-brand-400)';
  if (score >= 40) return 'var(--vt-status-warning)';
  return 'var(--vt-status-danger)';
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const router = useRouter();

  const [job, setJob] = useState<JobDescriptionDetail | null>(null);
  const [resumes, setResumes] = useState<ResumeVersionListItem[]>([]);
  const [scores, setScores] = useState<AtsScoreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResume, setSelectedResume] = useState('');
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobData, resumeData, scoresData] = await Promise.all([
        getJob(jobId),
        listResumes(),
        listScores(jobId),
      ]);
      setJob(jobData);
      const complete = resumeData.data.filter((r) => r.parseStatus === 'complete');
      setResumes(complete);
      // Guard: complete[0] may be undefined when the array is empty
      if (complete[0]) setSelectedResume(complete[0].id);
      setScores(scoresData.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRunScore() {
    if (!selectedResume) return;
    setScoring(true);
    setScoreError(null);
    try {
      const res = await createScore(jobId, selectedResume);
      router.push(`/dashboard/jobs/${jobId}/scores/${res.atsScoreId}`);
    } catch (err) {
      setScoreError((err as Error).message);
      setScoring(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Loader
          size={20}
          strokeWidth={1.5}
          style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }}
        />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Link
          href="/dashboard/jobs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--vt-text-muted)',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
            marginBottom: '24px',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to jobs
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: 'var(--vt-bg-danger)',
            border: '1px solid var(--vt-status-danger)',
            borderRadius: '8px',
            color: 'var(--vt-status-danger)',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={15} strokeWidth={1.5} />
          {error ?? 'Job not found.'}
        </div>
      </div>
    );
  }

  const PREVIEW_LEN = 400;
  const preview =
    job.content.length > PREVIEW_LEN ? job.content.slice(0, PREVIEW_LEN) + '…' : job.content;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <Link
        href="/dashboard/jobs"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: 'var(--vt-text-muted)',
          fontFamily: 'var(--vt-font-body)',
          fontSize: '13px',
          marginBottom: '24px',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Back to jobs
      </Link>

      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontFamily: 'var(--vt-font-display)',
            fontSize: '22px',
            fontWeight: 600,
            color: 'var(--vt-text-primary)',
            margin: '0 0 4px',
          }}
        >
          {job.title ?? (
            <span style={{ color: 'var(--vt-text-secondary)', fontStyle: 'italic' }}>
              Untitled role
            </span>
          )}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {job.company && (
            <span
              style={{
                fontFamily: 'var(--vt-font-body)',
                fontSize: '14px',
                color: 'var(--vt-text-secondary)',
              }}
            >
              {job.company}
            </span>
          )}
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'var(--vt-font-body)',
                fontSize: '13px',
                color: 'var(--vt-brand-400)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} strokeWidth={1.5} />
              View posting
            </a>
          )}
          <span
            style={{
              fontFamily: 'var(--vt-font-mono)',
              fontSize: '11px',
              color: 'var(--vt-text-disabled)',
            }}
          >
            {job.content.length.toLocaleString()} chars ·{' '}
            {new Date(job.createdAt).toLocaleDateString('en-CA', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--vt-surface-border)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '28px',
          backgroundColor: 'var(--vt-surface-raised)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13.5px',
            color: 'var(--vt-text-body)',
            lineHeight: 1.7,
            margin: '0 0 8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {expanded ? job.content : preview}
        </p>
        {job.content.length > PREVIEW_LEN && (
          <button
            onClick={() => setExpanded((p) => !p)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vt-brand-400)',
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              padding: 0,
            }}
            type="button"
          >
            {expanded ? 'Show less' : 'Show full description'}
          </button>
        )}
      </div>

      <div
        style={{
          border: '1px solid var(--vt-surface-border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '28px',
          backgroundColor: 'var(--vt-surface-raised)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--vt-font-display)',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--vt-text-primary)',
            margin: '0 0 16px',
          }}
        >
          Run ATS score
        </h2>

        {resumes.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: 0,
            }}
          >
            No parsed resumes found.{' '}
            <Link href="/dashboard/resume/upload" style={{ color: 'var(--vt-brand-400)' }}>
              Upload a resume
            </Link>{' '}
            first.
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--vt-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Select resume
              </label>
              <select
                value={selectedResume}
                onChange={(e) => setSelectedResume(e.target.value)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--vt-surface-overlay)',
                  border: '1px solid var(--vt-surface-border)',
                  borderRadius: '6px',
                  color: 'var(--vt-text-primary)',
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: '13.5px',
                  minWidth: '220px',
                }}
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName} (v{r.versionNumber})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ paddingTop: '18px' }}>
              <button
                onClick={() => void handleRunScore()}
                disabled={scoring || !selectedResume}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '8px 18px',
                  backgroundColor: 'var(--vt-brand-500)',
                  color: '#ffffff',
                  borderRadius: '6px',
                  fontFamily: 'var(--vt-font-body)',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: scoring ? 'not-allowed' : 'pointer',
                  opacity: scoring ? 0.6 : 1,
                }}
                type="button"
              >
                {scoring ? (
                  <>
                    <Loader
                      size={13}
                      strokeWidth={1.5}
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                    Starting…
                  </>
                ) : (
                  <>
                    <Play size={13} strokeWidth={1.5} />
                    Run ATS score
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {scoreError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              backgroundColor: 'var(--vt-bg-danger)',
              border: '1px solid var(--vt-status-danger)',
              borderRadius: '6px',
              color: 'var(--vt-status-danger)',
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              marginTop: '12px',
            }}
          >
            <AlertCircle size={14} strokeWidth={1.5} />
            {scoreError}
          </div>
        )}
      </div>

      {scores.length > 0 && (
        <div>
          <h2
            style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--vt-text-primary)',
              margin: '0 0 12px',
            }}
          >
            Score history
          </h2>
          <div
            style={{
              border: '1px solid var(--vt-surface-border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Resume', 'Score', 'Status', 'Date', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: 'var(--vt-font-body)',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'var(--vt-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '10px 16px',
                        textAlign: 'left',
                        backgroundColor: 'var(--vt-surface-raised)',
                        borderBottom: '1px solid var(--vt-surface-border)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((score) => {
                  const resume = resumes.find((r) => r.id === score.resumeVersionId);
                  return (
                    <tr
                      key={score.id}
                      style={{ borderBottom: '1px solid var(--vt-surface-border)' }}
                    >
                      <td
                        style={{
                          padding: '13px 16px',
                          fontFamily: 'var(--vt-font-body)',
                          fontSize: '13px',
                          color: 'var(--vt-text-secondary)',
                        }}
                      >
                        {resume?.fileName ?? score.resumeVersionId.slice(0, 8) + '…'}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {score.overallScore !== null ? (
                          <span
                            style={{
                              fontFamily: 'var(--vt-font-display)',
                              fontSize: '18px',
                              fontWeight: 600,
                              color: scoreColor(score.overallScore),
                            }}
                          >
                            {score.overallScore}
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--vt-text-muted)',
                                fontFamily: 'var(--vt-font-mono)',
                              }}
                            >
                              /100
                            </span>
                          </span>
                        ) : (
                          <span
                            style={{
                              color: 'var(--vt-text-disabled)',
                              fontFamily: 'var(--vt-font-mono)',
                              fontSize: '12px',
                            }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <ScoreBadge status={score.scoringStatus} />
                      </td>
                      <td
                        style={{
                          padding: '13px 16px',
                          fontFamily: 'var(--vt-font-body)',
                          fontSize: '13px',
                          color: 'var(--vt-text-secondary)',
                        }}
                      >
                        {new Date(score.createdAt).toLocaleDateString('en-CA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                        <Link
                          href={`/dashboard/jobs/${jobId}/scores/${score.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontFamily: 'var(--vt-font-body)',
                            fontSize: '12px',
                            color: 'var(--vt-brand-400)',
                            textDecoration: 'none',
                          }}
                        >
                          View
                          <ChevronRight size={12} strokeWidth={1.5} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
