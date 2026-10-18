'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Briefcase, AlertCircle, Loader, X, ChevronRight } from 'lucide-react';
import { listJobs, createJob, deleteJob } from '@/lib/api/job';
import type { JobDescriptionListItem } from '@/lib/api/job';

export default function JobsPage() {
  const [items, setItems] = useState<JobDescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listJobs();
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

  function resetForm() {
    setContent('');
    setTitle('');
    setCompany('');
    setUrl('');
    setFormError(null);
    setShowForm(false);
  }

  async function handleCreate() {
    if (content.trim().length < 50) {
      setFormError('Job description must be at least 50 characters.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const job = await createJob({
        content: content.trim(),
        // exactOptionalPropertyTypes: only spread when the value is non-empty
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(company.trim() ? { company: company.trim() } : {}),
        ...(url.trim() ? { url: url.trim() } : {}),
      });
      setItems((prev) => [
        {
          id: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          contentLength: job.content.length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
        ...prev,
      ]);
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"? This will also delete all associated ATS scores.`)) return;
    setDeleting(id);
    try {
      await deleteJob(id);
      setItems((prev) => prev.filter((j) => j.id !== id));
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
            Jobs
          </h1>
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: '4px 0 0',
            }}
          >
            {loading ? '' : `${items.length} saved job description${items.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={btnPrimary} type="button">
            <Plus size={15} strokeWidth={1.5} />
            Add job
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showForm && (
        <div
          style={{
            border: '1px solid var(--vt-surface-border)',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
            backgroundColor: 'var(--vt-surface-raised)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--vt-font-display)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--vt-text-primary)',
              }}
            >
              Add job description
            </span>
            <button
              onClick={resetForm}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--vt-text-muted)',
                padding: '4px',
              }}
              type="button"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            {(
              [
                {
                  label: 'Role title',
                  value: title,
                  set: setTitle,
                  placeholder: 'Senior Backend Engineer',
                },
                { label: 'Company', value: company, set: setCompany, placeholder: 'Stripe' },
                { label: 'Job URL', value: url, set: setUrl, placeholder: 'https://...' },
              ] as const
            ).map(({ label, value, set, placeholder }) => (
              <div key={label}>
                <label style={labelStyle}>
                  {label} <span style={{ color: 'var(--vt-text-disabled)' }}>optional</span>
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              Job description <span style={{ color: 'var(--vt-status-danger)' }}>*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={10}
              style={{
                ...inputStyle,
                resize: 'vertical',
                lineHeight: 1.6,
                fontFamily: 'var(--vt-font-body)',
              }}
            />
            <div
              style={{
                fontFamily: 'var(--vt-font-mono)',
                fontSize: '11px',
                color: 'var(--vt-text-disabled)',
                marginTop: '4px',
              }}
            >
              {content.length} characters{' '}
              {content.length < 50 && content.length > 0 ? '— minimum 50' : ''}
            </div>
          </div>

          {formError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: '#2e0a0a',
                border: '1px solid var(--vt-status-danger)',
                borderRadius: '6px',
                color: 'var(--vt-status-danger)',
                fontFamily: 'var(--vt-font-body)',
                fontSize: '13px',
                marginBottom: '12px',
              }}
            >
              <AlertCircle size={14} strokeWidth={1.5} />
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => void handleCreate()}
              disabled={submitting}
              style={{
                ...btnPrimary,
                opacity: submitting ? 0.6 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
              type="button"
            >
              {submitting && (
                <Loader
                  size={13}
                  strokeWidth={1.5}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
              )}
              {submitting ? 'Saving…' : 'Save job'}
            </button>
            <button
              onClick={resetForm}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: '1px solid var(--vt-surface-border)',
                borderRadius: '6px',
                color: 'var(--vt-text-secondary)',
                fontFamily: 'var(--vt-font-body)',
                fontSize: '13.5px',
                cursor: 'pointer',
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

      {!loading && !error && items.length === 0 && !showForm && (
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
          <Briefcase size={32} strokeWidth={1} style={{ color: 'var(--vt-text-disabled)' }} />
          <p
            style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--vt-text-secondary)',
              margin: 0,
            }}
          >
            No jobs yet.
          </p>
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: 0,
            }}
          >
            Paste a job description to start scoring your resume against it.
          </p>
          <button onClick={() => setShowForm(true)} style={btnPrimary} type="button">
            <Plus size={15} strokeWidth={1.5} />
            Add job
          </button>
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
                {['Role', 'Company', 'Length', 'Saved', ''].map((h) => (
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
                  <td style={{ padding: '13px 16px' }}>
                    <Link
                      href={`/dashboard/jobs/${item.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: 'var(--vt-text-primary)',
                        textDecoration: 'none',
                        fontFamily: 'var(--vt-font-body)',
                        fontSize: '13.5px',
                        fontWeight: 500,
                      }}
                    >
                      <Briefcase size={14} strokeWidth={1.5} />
                      {item.title ?? (
                        <span style={{ color: 'var(--vt-text-disabled)', fontStyle: 'italic' }}>
                          Untitled
                        </span>
                      )}
                      <ChevronRight
                        size={13}
                        strokeWidth={1.5}
                        style={{ color: 'var(--vt-text-disabled)', marginLeft: 'auto' }}
                      />
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-body)',
                      fontSize: '13px',
                      color: 'var(--vt-text-secondary)',
                    }}
                  >
                    {item.company ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-mono)',
                      fontSize: '12px',
                      color: 'var(--vt-text-muted)',
                    }}
                  >
                    {item.contentLength.toLocaleString()} chars
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      fontFamily: 'var(--vt-font-body)',
                      fontSize: '13px',
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
                      onClick={() => void handleDelete(item.id, item.title ?? 'this job')}
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

const btnPrimary: React.CSSProperties = {
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
  border: 'none',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--vt-font-body)',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--vt-text-secondary)',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  backgroundColor: 'var(--vt-surface-overlay)',
  border: '1px solid var(--vt-surface-border)',
  borderRadius: '6px',
  color: 'var(--vt-text-primary)',
  fontFamily: 'var(--vt-font-body)',
  fontSize: '13.5px',
  outline: 'none',
};
