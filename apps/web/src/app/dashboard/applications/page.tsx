'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LayoutList, Columns3, Plus, X, Loader, AlertCircle, Trash2, Pencil } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from '@/lib/api/application';
import type { Application, ApplicationStatus, CreateApplicationInput } from '@/lib/api/application';

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  applied: { label: 'Applied', color: 'var(--vt-brand-400)', bg: 'rgba(59,130,246,0.12)' },
  screening: { label: 'Screening', color: 'var(--vt-status-warning)', bg: 'rgba(245,158,11,0.12)' },
  interview: { label: 'Interview', color: 'var(--vt-brand-500)', bg: 'rgba(59,130,246,0.18)' },
  offer: { label: 'Offer', color: 'var(--vt-status-success)', bg: 'rgba(16,185,129,0.12)' },
  rejected: { label: 'Rejected', color: 'var(--vt-status-danger)', bg: 'rgba(239,68,68,0.12)' },
  withdrawn: { label: 'Withdrawn', color: 'var(--vt-text-muted)', bg: 'rgba(113,113,122,0.12)' },
};

const ALL_STATUSES: ApplicationStatus[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

function today(): string {
  return new Date().toISOString().split('T')[0] as string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontFamily: 'var(--vt-font-mono)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: cfg.color,
        backgroundColor: cfg.bg,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit form
// ---------------------------------------------------------------------------

interface FormState {
  company: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  appliedDate: string;
  notes: string;
}

const DEFAULT_FORM: FormState = {
  company: '',
  role: '',
  location: '',
  status: 'applied',
  appliedDate: today(),
  notes: '',
};

function ApplicationForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  initial: FormState;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function field(name: keyof FormState) {
    return {
      value: form[name],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setForm((prev) => ({ ...prev, [name]: e.target.value })),
    };
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    backgroundColor: 'var(--vt-surface-overlay)',
    border: '1px solid var(--vt-surface-border)',
    borderRadius: '6px',
    color: 'var(--vt-text-primary)',
    fontFamily: 'var(--vt-font-body)',
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--vt-text-muted)',
    marginBottom: '4px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily: 'var(--vt-font-body)',
  };

  return (
    <div
      style={{
        border: '1px solid var(--vt-surface-border)',
        borderRadius: '10px',
        backgroundColor: 'var(--vt-surface-raised)',
        padding: '20px 24px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--vt-font-display)',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--vt-text-primary)',
            margin: 0,
          }}
        >
          {initial.company ? 'Edit application' : 'Log new application'}
        </h2>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--vt-text-muted)',
            padding: 4,
          }}
          type="button"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px',
          marginBottom: '14px',
        }}
      >
        <div>
          <label style={labelStyle}>Company *</label>
          <input style={inputStyle} placeholder="e.g. Google" {...field('company')} />
        </div>
        <div>
          <label style={labelStyle}>Role *</label>
          <input style={inputStyle} placeholder="e.g. Senior Engineer" {...field('role')} />
        </div>
        <div>
          <label style={labelStyle}>Location</label>
          <input style={inputStyle} placeholder="e.g. London / Remote" {...field('location')} />
        </div>
        <div>
          <label style={labelStyle}>Applied date *</label>
          <input type="date" style={inputStyle} {...field('appliedDate')} />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} {...field('status')}>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          style={{ ...inputStyle, height: '72px', resize: 'vertical' }}
          placeholder="Recruiter name, salary range, interview notes…"
          {...field('notes')}
        />
      </div>

      {error !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: '#2e0a0a',
            border: '1px solid var(--vt-status-danger)',
            borderRadius: '6px',
            color: 'var(--vt-status-danger)',
            fontSize: '13px',
            fontFamily: 'var(--vt-font-body)',
            marginBottom: '12px',
          }}
        >
          <AlertCircle size={14} strokeWidth={1.5} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          type="button"
          style={{
            padding: '7px 16px',
            border: '1px solid var(--vt-surface-border)',
            borderRadius: '6px',
            background: 'transparent',
            color: 'var(--vt-text-secondary)',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting || !form.company.trim() || !form.role.trim() || !form.appliedDate}
          onClick={() => onSubmit(form)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 18px',
            backgroundColor: 'var(--vt-brand-500)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting && (
            <Loader size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {initial.company ? 'Save changes' : 'Add application'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ListView({
  apps,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  apps: Application[];
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  if (apps.length === 0) {
    return (
      <div
        style={{
          padding: '48px 20px',
          textAlign: 'center',
          border: '1px dashed var(--vt-surface-border)',
          borderRadius: '10px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--vt-font-body)',
            fontSize: '14px',
            color: 'var(--vt-text-muted)',
            margin: 0,
          }}
        >
          No applications yet. Click "+ Add" to log your first one.
        </p>
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--vt-text-muted)',
    fontFamily: 'var(--vt-font-body)',
    backgroundColor: 'var(--vt-surface-raised)',
    borderBottom: '1px solid var(--vt-surface-border)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '11px 14px',
    fontSize: '13px',
    color: 'var(--vt-text-body)',
    fontFamily: 'var(--vt-font-body)',
    borderBottom: '1px solid var(--vt-surface-border)',
    verticalAlign: 'middle',
  };

  return (
    <div
      style={{
        border: '1px solid var(--vt-surface-border)',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Company</th>
            <th style={thStyle}>Role</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Applied</th>
            <th style={{ ...thStyle, width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id}>
              <td style={tdStyle}>
                <span style={{ fontWeight: 500, color: 'var(--vt-text-primary)' }}>
                  {app.company}
                </span>
                {app.location && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: 'var(--vt-text-muted)',
                      marginTop: '1px',
                    }}
                  >
                    {app.location}
                  </span>
                )}
              </td>
              <td style={tdStyle}>{app.role}</td>
              <td style={{ ...tdStyle, width: 140 }}>
                <select
                  value={app.status}
                  onChange={(e) => onStatusChange(app.id, e.target.value as ApplicationStatus)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--vt-font-mono)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: STATUS_CONFIG[app.status].color,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_CONFIG[s].label}
                    </option>
                  ))}
                </select>
              </td>
              <td
                style={{
                  ...tdStyle,
                  color: 'var(--vt-text-muted)',
                  fontFamily: 'var(--vt-font-mono)',
                  fontSize: '12px',
                }}
              >
                {app.appliedDate}
              </td>
              <td style={{ ...tdStyle, borderBottom: tdStyle.borderBottom }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => onEdit(app)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--vt-text-muted)',
                      padding: '4px',
                    }}
                    title="Edit"
                    type="button"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => onDelete(app.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--vt-status-danger)',
                      padding: '4px',
                      opacity: 0.7,
                    }}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban view
// ---------------------------------------------------------------------------

function KanbanView({
  apps,
  onDragEnd,
  onEdit,
  onDelete,
}: {
  apps: Application[];
  onDragEnd: (result: DropResult) => void;
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
}) {
  const byStatus = useMemo(() => {
    const groups = {} as Record<ApplicationStatus, Application[]>;
    for (const s of ALL_STATUSES) groups[s] = [];
    for (const app of apps) groups[app.status].push(app);
    return groups;
  }, [apps]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
        {ALL_STATUSES.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const items = byStatus[status];
          return (
            <div key={status} style={{ minWidth: 180, flex: '0 0 180px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: cfg.color,
                    fontFamily: 'var(--vt-font-mono)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {cfg.label}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--vt-text-muted)',
                    fontFamily: 'var(--vt-font-mono)',
                  }}
                >
                  {items.length}
                </span>
              </div>

              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minHeight: 120,
                      backgroundColor: snapshot.isDraggingOver
                        ? 'rgba(59,130,246,0.06)'
                        : 'var(--vt-surface-raised)',
                      border: `1px solid ${snapshot.isDraggingOver ? 'rgba(59,130,246,0.3)' : 'var(--vt-surface-border)'}`,
                      borderRadius: 8,
                      padding: 6,
                      transition: 'background 0.15s, border 0.15s',
                    }}
                  >
                    {items.map((app, index) => (
                      <Draggable key={app.id} draggableId={app.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              backgroundColor: snapshot.isDragging
                                ? 'var(--vt-surface-overlay)'
                                : 'var(--vt-surface-raised)',
                              border: '1px solid var(--vt-surface-border)',
                              borderRadius: 6,
                              padding: '8px 10px',
                              marginBottom: 6,
                              cursor: 'grab',
                              ...provided.draggableProps.style,
                            }}
                          >
                            <p
                              style={{
                                fontFamily: 'var(--vt-font-body)',
                                fontSize: '12.5px',
                                fontWeight: 500,
                                color: 'var(--vt-text-primary)',
                                margin: '0 0 2px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {app.company}
                            </p>
                            <p
                              style={{
                                fontFamily: 'var(--vt-font-body)',
                                fontSize: '11.5px',
                                color: 'var(--vt-text-secondary)',
                                margin: '0 0 6px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {app.role}
                            </p>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: 'var(--vt-font-mono)',
                                  fontSize: '10px',
                                  color: 'var(--vt-text-muted)',
                                }}
                              >
                                {app.appliedDate}
                              </span>
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button
                                  onClick={() => onEdit(app)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--vt-text-muted)',
                                    padding: '2px',
                                  }}
                                  type="button"
                                >
                                  <Pencil size={11} strokeWidth={1.5} />
                                </button>
                                <button
                                  onClick={() => onDelete(app.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--vt-status-danger)',
                                    padding: '2px',
                                    opacity: 0.7,
                                  }}
                                  type="button"
                                >
                                  <Trash2 size={11} strokeWidth={1.5} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'board';
type FormMode = 'closed' | 'create' | Application;

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // -- Data loading ----------------------------------------------------------

  const loadApps = useCallback(async () => {
    try {
      const res = await listApplications();
      setApps(res.data);
      setFetchError(null);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  // -- Form handlers ---------------------------------------------------------

  const initialForm = useMemo((): FormState => {
    if (formMode === 'closed' || formMode === 'create') return DEFAULT_FORM;
    return {
      company: formMode.company,
      role: formMode.role,
      location: formMode.location ?? '',
      status: formMode.status,
      appliedDate: formMode.appliedDate,
      notes: formMode.notes ?? '',
    };
  }, [formMode]);

  async function handleSubmit(form: FormState) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === 'create') {
        const input: CreateApplicationInput = {
          company: form.company,
          role: form.role,
          status: form.status,
          appliedDate: form.appliedDate,
          ...(form.location.trim() ? { location: form.location.trim() } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        };
        const created = await createApplication(input);
        setApps((prev) => [created, ...prev]);
      } else if (formMode !== 'closed') {
        const updated = await updateApplication(formMode.id, {
          company: form.company,
          role: form.role,
          status: form.status,
          appliedDate: form.appliedDate,
          location: form.location.trim() || null,
          notes: form.notes.trim() || null,
        });
        setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
      setFormMode('closed');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this application?')) return;
    try {
      await deleteApplication(id);
      setApps((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    const prev = apps.find((a) => a.id === id);
    if (!prev || prev.status === status) return;
    // Optimistic update
    setApps((cur) => cur.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await updateApplication(id, { status });
    } catch {
      setApps((cur) => cur.map((a) => (a.id === id ? { ...a, status: prev.status } : a)));
    }
  }

  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    const newStatus = destination.droppableId as ApplicationStatus;
    const oldStatus = source.droppableId as ApplicationStatus;

    setApps((prev) => prev.map((a) => (a.id === draggableId ? { ...a, status: newStatus } : a)));

    try {
      await updateApplication(draggableId, { status: newStatus });
    } catch {
      setApps((prev) => prev.map((a) => (a.id === draggableId ? { ...a, status: oldStatus } : a)));
    }
  }, []);

  // -- Render ----------------------------------------------------------------

  const viewBtnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    border: '1px solid var(--vt-surface-border)',
    borderRadius: 6,
    background: 'transparent',
    fontFamily: 'var(--vt-font-body)',
    fontSize: '12px',
    cursor: 'pointer',
    color: 'var(--vt-text-muted)',
  };

  const viewBtnActive: React.CSSProperties = {
    ...viewBtnBase,
    backgroundColor: 'var(--vt-surface-hover)',
    color: 'var(--vt-text-primary)',
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--vt-font-display)',
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--vt-text-primary)',
              margin: '0 0 4px',
              letterSpacing: '-0.02em',
            }}
          >
            Applications
          </h1>
          <p
            style={{
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              color: 'var(--vt-text-muted)',
              margin: 0,
            }}
          >
            {loading ? '…' : `${apps.length} tracked`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View toggle */}
          <button
            style={viewMode === 'list' ? viewBtnActive : viewBtnBase}
            type="button"
            onClick={() => setViewMode('list')}
          >
            <LayoutList size={13} strokeWidth={1.5} />
            List
          </button>
          <button
            style={viewMode === 'board' ? viewBtnActive : viewBtnBase}
            type="button"
            onClick={() => setViewMode('board')}
          >
            <Columns3 size={13} strokeWidth={1.5} />
            Board
          </button>

          {/* Add button */}
          <button
            type="button"
            onClick={() => {
              setFormMode('create');
              setFormError(null);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              backgroundColor: 'var(--vt-brand-500)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 7,
              fontFamily: 'var(--vt-font-body)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2} />
            Add
          </button>
        </div>
      </div>

      {/* Fetch error */}
      {fetchError !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            backgroundColor: '#2e0a0a',
            border: '1px solid var(--vt-status-danger)',
            borderRadius: 8,
            color: 'var(--vt-status-danger)',
            fontFamily: 'var(--vt-font-body)',
            fontSize: '13px',
            marginBottom: 20,
          }}
        >
          <AlertCircle size={14} strokeWidth={1.5} />
          {fetchError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <Loader
            size={22}
            strokeWidth={1.5}
            style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }}
          />
        </div>
      )}

      {/* Add / Edit form */}
      {!loading && formMode !== 'closed' && (
        <ApplicationForm
          initial={initialForm}
          onSubmit={(f) => void handleSubmit(f)}
          onCancel={() => setFormMode('closed')}
          submitting={submitting}
          error={formError}
        />
      )}

      {/* Content */}
      {!loading && viewMode === 'list' && (
        <ListView
          apps={apps}
          onEdit={(app) => {
            setFormMode(app);
            setFormError(null);
          }}
          onDelete={(id) => void handleDelete(id)}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
        />
      )}

      {!loading && viewMode === 'board' && (
        <KanbanView
          apps={apps}
          onDragEnd={(result) => void handleDragEnd(result)}
          onEdit={(app) => {
            setFormMode(app);
            setFormError(null);
          }}
          onDelete={(id) => void handleDelete(id)}
        />
      )}
    </div>
  );
}
