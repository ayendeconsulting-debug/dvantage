'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Download,
  FileText,
  FileType,
  Loader,
  AlertCircle,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  Award,
} from 'lucide-react';
import { getResume, listOptimizationsForResume } from '@/lib/api/resume';
import type { ResumeVersionDetail, ResumeOptimizationItem } from '@/lib/api/resume';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';
const POLL_MS  = 3000;
const TERMINAL = ['complete', 'failed'] as const;

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

async function triggerOriginalExport(
  resumeId: string,
  format: 'pdf' | 'docx',
  baseFileName: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/resumes/${resumeId}/export/${format}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `Export failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${baseFileName.replace(/\.[^.]+$/, '')}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
// Helpers
// ---------------------------------------------------------------------------

function optimizationLabel(opt: ResumeOptimizationItem): string {
  const title   = opt.jobTitle   ?? 'Untitled role';
  const company = opt.jobCompany ?? 'Unknown company';
  const date    = new Date(opt.optimizedAt).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  return `${title} at ${company} \u2014 ${date}`;
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface SectionProps {
  icon:     LucideIcon;
  label:    string;
  children: React.ReactNode;
}

function Section({ icon: Icon, label, children }: SectionProps) {
  return (
    <div style={{ backgroundColor: 'var(--vt-surface-raised)', border: '1px solid var(--vt-surface-border)', borderRadius: '10px', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--vt-surface-border)' }}>
        <Icon size={15} strokeWidth={1.5} style={{ color: 'var(--vt-brand-400)', flexShrink: 0 }} />
        <h2 style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--vt-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</h2>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill category background colours
// ---------------------------------------------------------------------------

const SKILL_BG: Record<string, string> = {
  technical: '#1a2a3a',
  tool:      '#2a1a3a',
  language:  '#1a2e1e',
  soft:      '#2e2a1a',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResumeDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [data,          setData]          = useState<ResumeVersionDetail | null>(null);
  const [optimizations, setOptimizations] = useState<ResumeOptimizationItem[]>([]);
  const [selectedExport, setSelectedExport] = useState<string>('original');
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [exportingPdf,  setExportingPdf]  = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportError,   setExportError]   = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await getResume(id);
      setData(res);
      setError(null);

      if (TERMINAL.includes(res.parseStatus as typeof TERMINAL[number])) {
        stopPolling();
        // Fetch optimizations once parse reaches a terminal state
        if (res.parseStatus === 'complete') {
          const opts = await listOptimizationsForResume(id).catch(() => ({ data: [] as ResumeOptimizationItem[] }));
          setOptimizations(opts.data);
        }
      }
    } catch (err) {
      setError((err as Error).message);
      stopPolling();
    } finally {
      setLoading(false);
    }
  }, [id, stopPolling]);

  useEffect(() => {
    void fetchData();
    pollRef.current = setInterval(() => void fetchData(), POLL_MS);
    return stopPolling;
  }, [fetchData, stopPolling]);

  // ---------------------------------------------------------------------------
  // Export handlers
  // ---------------------------------------------------------------------------

  const handleExportPdf = async () => {
    if (!data) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      if (selectedExport === 'original') {
        await triggerOriginalExport(id, 'pdf', data.fileName);
      } else {
        const opt = optimizations.find(o => o.atsScoreId === selectedExport);
        if (!opt) throw new Error('Selected optimization not found.');
        const contactName = data.structuredData?.contact?.name ?? 'resume';
        await triggerOptimizedExport(opt.jobId, opt.atsScoreId, 'pdf', contactName);
      }
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportDocx = async () => {
    if (!data) return;
    setExportingDocx(true);
    setExportError(null);
    try {
      if (selectedExport === 'original') {
        await triggerOriginalExport(id, 'docx', data.fileName);
      } else {
        const opt = optimizations.find(o => o.atsScoreId === selectedExport);
        if (!opt) throw new Error('Selected optimization not found.');
        const contactName = data.structuredData?.contact?.name ?? 'resume';
        await triggerOptimizedExport(opt.jobId, opt.atsScoreId, 'docx', contactName);
      }
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExportingDocx(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '80px' }}>
      <Loader size={20} strokeWidth={1.5} style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div>
      <Link href="/dashboard/resume" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} strokeWidth={1.5} />Resumes
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
        <AlertCircle size={15} strokeWidth={1.5} />{error}
      </div>
    </div>
  );

  if (!data) return null;

  const sd         = data.structuredData;
  const isComplete = data.parseStatus === 'complete';
  const isFailed   = data.parseStatus === 'failed';
  const isParsing  = !TERMINAL.includes(data.parseStatus as typeof TERMINAL[number]);
  const hasOptimizations = optimizations.length > 0;

  const btnBase: React.CSSProperties = {
    display:     'inline-flex',
    alignItems:  'center',
    gap:         '6px',
    padding:     '7px 13px',
    border:      '1px solid var(--vt-surface-border)',
    borderRadius:'6px',
    color:       'var(--vt-text-secondary)',
    fontFamily:  'var(--vt-font-body)',
    fontSize:    '13px',
    background:  'transparent',
    cursor:      'pointer',
    whiteSpace:  'nowrap',
    flexShrink:  0,
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.45,
    cursor:  'not-allowed',
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <Link href="/dashboard/resume" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} strokeWidth={1.5} />Resumes
      </Link>

      {/* Header + action buttons */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '20px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: '0 0 4px', wordBreak: 'break-all' }}>{data.fileName}</h1>
          <p style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
            v{data.versionNumber} \u00b7 {(data.fileSize / 1024).toFixed(0)} KB \u00b7 {new Date(data.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        </div>

        {/* Action buttons â€” shown when parse is complete */}
        {isComplete && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>

            {/* Original file download â€” always available */}
            {data.downloadUrl && (
              <a href={data.downloadUrl} download={data.fileName} style={btnBase}>
                <Download size={13} strokeWidth={1.5} />
                Original
              </a>
            )}

            {/* Export-version picker â€” only shown when optimizations exist */}
            {hasOptimizations && (
              <select
                value={selectedExport}
                onChange={e => setSelectedExport(e.target.value)}
                style={{
                  padding:         '7px 10px',
                  backgroundColor: 'var(--vt-surface-overlay)',
                  border:          '1px solid var(--vt-surface-border)',
                  borderRadius:    '6px',
                  color:           'var(--vt-text-primary)',
                  fontFamily:      'var(--vt-font-body)',
                  fontSize:        '13px',
                  cursor:          'pointer',
                  maxWidth:        '260px',
                }}
              >
                <option value="original">Original</option>
                {optimizations.map(opt => (
                  <option key={opt.atsScoreId} value={opt.atsScoreId}>
                    {optimizationLabel(opt)}
                  </option>
                ))}
              </select>
            )}

            {/* Export PDF */}
            <button
              style={exportingPdf ? btnDisabled : btnBase}
              disabled={exportingPdf}
              onClick={() => void handleExportPdf()}
              title={selectedExport === 'original' ? 'Download as formatted PDF' : 'Download optimized version as PDF'}
            >
              {exportingPdf
                ? <Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
                : <FileText size={13} strokeWidth={1.5} />}
              Export PDF
            </button>

            {/* Export DOCX */}
            <button
              style={exportingDocx ? btnDisabled : btnBase}
              disabled={exportingDocx}
              onClick={() => void handleExportDocx()}
              title={selectedExport === 'original' ? 'Download as Word document' : 'Download optimized version as Word document'}
            >
              {exportingDocx
                ? <Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
                : <FileType size={13} strokeWidth={1.5} />}
              Export DOCX
            </button>
          </div>
        )}
      </div>

      {/* Export error */}
      {exportError !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginBottom: '16px' }}>
          <AlertCircle size={14} strokeWidth={1.5} />{exportError}
        </div>
      )}

      {isParsing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: '1px solid var(--vt-status-warning)', background: '#3d2e0a', borderRadius: '8px', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-body)', marginBottom: '24px' }}>
          <Loader size={15} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />Analysing your resume \u2014 this usually takes 20\u201340 seconds.
        </div>
      )}

      {isFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: '1px solid var(--vt-status-danger)', background: '#2e0a0a', borderRadius: '8px', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-body)', marginBottom: '24px' }}>
          <AlertCircle size={15} strokeWidth={1.5} />Analysis failed: {data.parseError ?? 'Unknown error.'}
        </div>
      )}

      {isComplete && sd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Section icon={User} label="Contact">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                ['Name',     sd.contact.name],
                ['Email',    sd.contact.email],
                sd.contact.phone    ? ['Phone',    sd.contact.phone]    : null,
                sd.contact.location ? ['Location', sd.contact.location] : null,
                sd.contact.linkedin ? ['LinkedIn', sd.contact.linkedin] : null,
                sd.contact.github   ? ['GitHub',   sd.contact.github]   : null,
              ] as ([string, string] | null)[])
                .filter((item): item is [string, string] => item !== null)
                .map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-muted)', minWidth: '64px', flexShrink: 0 }}>{label}</span>
                    <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-primary)', wordBreak: 'break-all' }}>{val}</span>
                  </div>
                ))}
            </div>
            {sd.summary && (
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-body)', lineHeight: 1.7, margin: '16px 0 0', borderTop: '1px solid var(--vt-surface-border)', paddingTop: '16px' }}>
                {sd.summary}
              </p>
            )}
          </Section>

          {sd.experience.length > 0 && (
            <Section icon={Briefcase} label="Experience">
              {sd.experience.map((exp, i) => (
                <div key={i} style={{ paddingBottom: '20px', marginBottom: '20px', borderBottom: '1px solid var(--vt-surface-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 2px' }}>{exp.title}</p>
                      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', margin: 0 }}>{exp.company}</p>
                    </div>
                    <p style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-muted)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {exp.startDate} \u2014 {exp.current ? 'Present' : exp.endDate ?? ''}
                    </p>
                  </div>
                  {exp.description && (
                    <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', lineHeight: 1.6, margin: '0 0 8px' }}>{exp.description}</p>
                  )}
                  {exp.highlights.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {exp.highlights.map((h, j) => (
                        <li key={j} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', lineHeight: 1.6, marginBottom: '4px' }}>{h}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Section>
          )}

          {sd.education.length > 0 && (
            <Section icon={GraduationCap} label="Education">
              {sd.education.map((edu, i) => (
                <div key={i} style={{ paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--vt-surface-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 2px' }}>{edu.degree} in {edu.field}</p>
                      <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', margin: 0 }}>{edu.institution}</p>
                    </div>
                    <p style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-muted)', margin: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {edu.startDate}{edu.endDate ? ` \u2014 ${edu.endDate}` : ''}{edu.gpa ? ` \u00b7 GPA ${edu.gpa}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {sd.skills.length > 0 && (
            <Section icon={Wrench} label="Skills">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {sd.skills.map((s, i) => (
                  <span key={i} style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-body)', backgroundColor: SKILL_BG[s.category] ?? 'var(--vt-surface-border)', border: '1px solid var(--vt-surface-border)', padding: '3px 10px', borderRadius: '999px' }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {sd.certifications.length > 0 && (
            <Section icon={Award} label="Certifications">
              {sd.certifications.map((c, i) => (
                <div key={i} style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--vt-surface-border)' }}>
                  <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 2px' }}>{c.name}</p>
                  <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)', margin: 0 }}>{c.issuer}{c.date ? ` \u00b7 ${c.date}` : ''}</p>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
