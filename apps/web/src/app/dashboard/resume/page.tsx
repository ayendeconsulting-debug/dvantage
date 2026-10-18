'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Upload, FileText, AlertCircle, Loader } from 'lucide-react';
import { listResumes, deleteResume } from '@/lib/api/resume';
import type { ResumeVersionListItem, ParseStatus } from '@/lib/api/resume';

const STATUS_STYLES: Record<ParseStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'var(--vt-text-muted)', bg: 'var(--vt-surface-border)' },
  uploading: { label: 'Uploading', color: 'var(--vt-text-muted)', bg: 'var(--vt-surface-border)' },
  uploaded: { label: 'Queued', color: 'var(--vt-status-info)', bg: '#1e3a5f' },
  parsing: { label: 'Parsing…', color: 'var(--vt-status-warning)', bg: '#3d2e0a' },
  complete: { label: 'Complete', color: 'var(--vt-status-success)', bg: '#0a2e1e' },
  failed: { label: 'Failed', color: 'var(--vt-status-danger)', bg: '#2e0a0a' },
};

function StatusBadge({ status }: { status: ParseStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
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
        gap: status === 'parsing' ? '4px' : '0',
      }}
    >
      {status === 'parsing' && (
        <Loader size={10} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
      )}
      {s.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function ResumeListPage() {
  const [items, setItems] = useState<ResumeVersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listResumes();
      setItems(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string, fileName: string) {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteResume(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--vt-text-primary)',
              margin: 0,
            }}
          >
            Resumes
          </h1>
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: '4px 0 0',
            }}
          >
            {loading ? '' : `${items.length} version${items.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/dashboard/resume/upload"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '8px 16px',
            backgroundColor: 'var(--vt-brand-500)',
            color: '#ffffff',
            borderRadius: '6px',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13.5px',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          <Upload size={15} strokeWidth={1.5} />
          Upload resume
        </Link>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
          <Loader
            size={20}
            strokeWidth={1.5}
            style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }}
          />
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#2e0a0a',
            border: '1px solid var(--vt-status-danger)',
            borderRadius: '8px',
            color: 'var(--vt-status-danger)',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={15} strokeWidth={1.5} />
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            paddingTop: '72px',
            textAlign: 'center',
          }}
        >
          <FileText size={32} strokeWidth={1} style={{ color: 'var(--vt-text-disabled)' }} />
          <p
            style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--vt-text-secondary)',
              margin: 0,
            }}
          >
            No resumes yet.
          </p>
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: 0,
            }}
          >
            Upload your first resume to get started.
          </p>
          <Link
            href="/dashboard/resume/upload"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '8px 16px',
              backgroundColor: 'var(--vt-brand-500)',
              color: '#ffffff',
              borderRadius: '6px',
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13.5px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <Upload size={15} strokeWidth={1.5} />
            Upload resume
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
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
                {['File', 'Version', 'Size', 'Status', 'Uploaded', ''].map((h) => (
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
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--vt-surface-border)' }}>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-body)',
                      fontSize: '13.5px',
                      color: 'var(--vt-text-primary)',
                    }}
                  >
                    <Link
                      href={`/dashboard/resume/${item.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'var(--vt-text-primary)',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      <FileText size={14} strokeWidth={1.5} />
                      {item.fileName}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-mono)',
                      fontSize: '12px',
                      color: 'var(--vt-text-secondary)',
                    }}
                  >
                    v{item.versionNumber}
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-mono)',
                      fontSize: '12px',
                      color: 'var(--vt-text-secondary)',
                    }}
                  >
                    {formatBytes(item.fileSize)}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <StatusBadge status={item.parseStatus} />
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-body)',
                      fontSize: '13.5px',
                      color: 'var(--vt-text-secondary)',
                    }}
                  >
                    {new Date(item.createdAt).toLocaleDateString('en-CA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => void handleDelete(item.id, item.fileName)}
                      disabled={deleting === item.id}
                      style={{
                        fontFamily: 'var(--vt-font-body)',
                        fontSize: '12px',
                        color: 'var(--vt-text-muted)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                      }}
                      type="button"
                    >
                      {deleting === item.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
