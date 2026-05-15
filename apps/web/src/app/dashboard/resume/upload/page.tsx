'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { uploadResume } from '@/lib/api/resume';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function UploadPage() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file,     setFile]     = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state,    setState]    = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState<string | null>(null);

  function validateFile(f: File): string | null {
    if (!(ALLOWED_TYPES as readonly string[]).includes(f.type)) {
      return 'Unsupported file type. Please upload a PDF, DOCX, or TXT file.';
    }
    if (f.size > MAX_SIZE_BYTES) {
      return `File too large. Maximum size is ${MAX_SIZE_BYTES / 1024 / 1024} MB.`;
    }
    return null;
  }

  function selectFile(f: File) {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f); setError(null); setState('idle'); setProgress(0);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    if (!file) return;
    setError(null); setProgress(0); setState('uploading');
    try {
      // Single API call — browser → API → R2 (no direct browser-to-R2 CORS issue)
      const { resumeVersionId } = await uploadResume(file, setProgress);
      setState('done');
      router.push(`/dashboard/resume/${resumeVersionId}`);
    } catch (err) {
      setState('error');
      setError((err as Error).message);
    }
  }

  const isLoading = state === 'uploading' || state === 'done';

  const statusLabel =
    state === 'uploading' ? `Uploading… ${progress}%` :
    state === 'done'      ? 'Done — redirecting…'     : '';

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: '0 0 8px' }}>Upload resume</h1>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-secondary)', margin: 0, lineHeight: 1.6 }}>PDF, DOCX, or plain text · Max 10 MB. D&apos;Vantage extracts and structures your resume automatically.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', backgroundColor: 'var(--vt-surface-raised)', border: '1px solid var(--vt-surface-border)', borderRadius: '12px' }}>
        <div
          role="button" tabIndex={0}
          style={{ border: `1.5px dashed ${dragOver ? 'var(--vt-brand-500)' : 'var(--vt-surface-border)'}`, borderRadius: '8px', padding: file ? '16px 20px' : '32px 24px', cursor: isLoading ? 'default' : 'pointer', backgroundColor: dragOver ? '#1a2a3a' : 'transparent', transition: 'border-color 120ms, background 120ms', outline: 'none' }}
          onClick={() => !isLoading && inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f); }}
            style={{ display: 'none' }}
          />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <FileText size={28} strokeWidth={1} style={{ color: 'var(--vt-brand-400)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--vt-text-primary)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', color: 'var(--vt-text-muted)', margin: 0 }}>{(file.size / 1024).toFixed(0)} KB · {file.type.split('/')[1]?.toUpperCase()}</p>
              </div>
              {!isLoading && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setState('idle'); setError(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vt-text-muted)', padding: '4px', borderRadius: '4px', display: 'flex' }}
                  type="button"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center' }}>
              <Upload size={28} strokeWidth={1} style={{ color: 'var(--vt-text-muted)' }} />
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '14px', color: 'var(--vt-text-secondary)', fontWeight: 500, margin: 0 }}>Drop your resume here</p>
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12.5px', color: 'var(--vt-text-muted)', margin: 0 }}>or click to browse · .pdf, .docx, .txt</p>
            </div>
          )}
        </div>

        {state === 'uploading' && (
          <div style={{ height: '3px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '2px', overflow: 'hidden' }} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ height: '100%', backgroundColor: 'var(--vt-brand-500)', borderRadius: '2px', width: `${progress}%`, transition: 'width 200ms ease' }} />
          </div>
        )}

        {isLoading && statusLabel && (
          <p style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0, textAlign: 'center' }}>{statusLabel}</p>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '6px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
            <AlertCircle size={14} strokeWidth={1.5} />{error}
          </div>
        )}

        <button
          onClick={() => void handleUpload()}
          disabled={!file || isLoading}
          style={{ padding: '10px 20px', backgroundColor: (!file || isLoading) ? 'var(--vt-surface-border)' : 'var(--vt-brand-500)', color: (!file || isLoading) ? 'var(--vt-text-disabled)' : '#ffffff', border: 'none', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, cursor: (!file || isLoading) ? 'not-allowed' : 'pointer', width: '100%', transition: 'background 120ms' }}
          type="button"
        >
          {isLoading ? statusLabel : 'Analyse resume'}
        </button>
      </div>
    </div>
  );
}
