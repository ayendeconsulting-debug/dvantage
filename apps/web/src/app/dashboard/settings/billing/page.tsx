'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader, Sparkles, ExternalLink, Crown } from 'lucide-react';
import {
  getSubscription,
  createCheckoutSession,
  createPortalSession,
} from '@/lib/api/subscription';
import type { SubscriptionStatus_ } from '@/lib/api/subscription';

// ---------------------------------------------------------------------------
// Usage meter component
// ---------------------------------------------------------------------------

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  if (limit === null) {
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)' }}>{label}</span>
          <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', color: 'var(--vt-status-success)' }}>Unlimited</span>
        </div>
        <div style={{ height: '4px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '2px' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: 'var(--vt-status-success)', borderRadius: '2px' }} />
        </div>
      </div>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const isWarn = pct >= 80 && pct < 100;
  const isFull = pct >= 100;
  const barColor = isFull ? 'var(--vt-status-danger)' : isWarn ? 'var(--vt-status-warning)' : 'var(--vt-brand-500)';

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '12px', color: isFull ? 'var(--vt-status-danger)' : isWarn ? 'var(--vt-status-warning)' : 'var(--vt-text-muted)' }}>
          {used} / {limit}
        </span>
      </div>
      <div style={{ height: '4px', backgroundColor: 'var(--vt-surface-border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '2px', transition: 'width 500ms ease' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component — uses useSearchParams (must be inside Suspense)
// ---------------------------------------------------------------------------

function BillingContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success') === '1';
  const canceled = searchParams.get('canceled') === '1';

  const [sub, setSub] = useState<SubscriptionStatus_ | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSubscription();
      setSub(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUpgrade() {
    const priceId = process.env['NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM_MONTHLY'];
    if (!priceId) {
      setActionError('Stripe price ID not configured. Set NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM_MONTHLY in your environment.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const { checkoutUrl } = await createCheckoutSession({ priceId, interval: 'monthly' });
      window.location.href = checkoutUrl;
    } catch (err) {
      setActionError((err as Error).message);
      setActionLoading(false);
    }
  }

  async function handleManage() {
    setActionLoading(true);
    setActionError(null);
    try {
      const { portalUrl } = await createPortalSession();
      window.location.href = portalUrl;
    } catch (err) {
      setActionError((err as Error).message);
      setActionLoading(false);
    }
  }

  const isPremium = sub?.plan === 'premium';

  return (
    <div style={{ maxWidth: '560px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontFamily: 'var(--vt-font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--vt-text-primary)', margin: 0 }}>Billing</h1>
        <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', color: 'var(--vt-text-muted)', margin: '4px 0 0' }}>Manage your plan and track monthly usage.</p>
      </div>

      {/* Success banner */}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#0a2e1e', border: '1px solid var(--vt-status-success)', borderRadius: '8px', marginBottom: '20px' }}>
          <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: 'var(--vt-status-success)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-status-success)' }}>
            You&apos;re now on Premium. Welcome to unlimited access!
          </span>
        </div>
      )}

      {/* Canceled banner */}
      {canceled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#3d2e0a', border: '1px solid var(--vt-status-warning)', borderRadius: '8px', marginBottom: '20px' }}>
          <AlertCircle size={16} strokeWidth={1.5} style={{ color: 'var(--vt-status-warning)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-status-warning)' }}>
            Checkout was canceled — your plan has not changed.
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
          <Loader size={20} strokeWidth={1.5} style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '8px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px' }}>
          <AlertCircle size={15} strokeWidth={1.5} />{error}
        </div>
      )}

      {!loading && sub && (
        <>
          {/* Current plan */}
          <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '10px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isPremium ? '12px' : '0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  {isPremium && <Crown size={16} strokeWidth={1.5} style={{ color: 'var(--vt-brand-400)' }} />}
                  <span style={{ fontFamily: 'var(--vt-font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--vt-text-primary)' }}>
                    {isPremium ? 'Premium' : 'Free'}
                  </span>
                  <span style={{ fontFamily: 'var(--vt-font-mono)', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: isPremium ? '#1e3a5f' : 'var(--vt-surface-border)', color: isPremium ? 'var(--vt-brand-400)' : 'var(--vt-text-muted)' }}>
                    {isPremium ? (sub.status ?? 'active') : 'free'}
                  </span>
                </div>
                {isPremium && sub.currentPeriodEnd && (
                  <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-muted)', margin: 0 }}>
                    {sub.cancelAtPeriodEnd
                      ? `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`
                      : `Renews on ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`
                    }
                  </p>
                )}
              </div>

              {/* Action button */}
              {!isPremium && (
                <button
                  onClick={() => void handleUpgrade()}
                  disabled={actionLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 18px', backgroundColor: 'var(--vt-brand-500)', color: '#ffffff', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', fontWeight: 500, border: 'none', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                  type="button"
                >
                  {actionLoading
                    ? <><Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />Redirecting&hellip;</>
                    : <><Sparkles size={14} strokeWidth={1.5} />Upgrade to Premium</>
                  }
                </button>
              )}

              {isPremium && (
                <button
                  onClick={() => void handleManage()}
                  disabled={actionLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 16px', backgroundColor: 'transparent', color: 'var(--vt-text-secondary)', border: '1px solid var(--vt-surface-border)', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                  type="button"
                >
                  {actionLoading
                    ? <><Loader size={12} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />Redirecting&hellip;</>
                    : <><ExternalLink size={13} strokeWidth={1.5} />Manage subscription</>
                  }
                </button>
              )}
            </div>

            {actionError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#2e0a0a', border: '1px solid var(--vt-status-danger)', borderRadius: '6px', color: 'var(--vt-status-danger)', fontFamily: 'var(--vt-font-body)', fontSize: '13px', marginTop: '12px' }}>
                <AlertCircle size={14} strokeWidth={1.5} />{actionError}
              </div>
            )}
          </div>

          {/* Usage this month */}
          <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '10px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)' }}>
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--vt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Usage this month
              </span>
            </div>

            <UsageMeter
              label="ATS scores"
              used={sub.usage.atsScoresUsed}
              limit={sub.usage.atsScoresLimit}
            />
            <UsageMeter
              label="AI optimizations"
              used={sub.usage.optimizationsUsed}
              limit={sub.usage.optimizationsLimit}
            />
            <UsageMeter
              label="Saved job descriptions"
              used={sub.usage.jobsCreatedUsed}
              limit={sub.usage.jobsCreatedLimit}
            />

            {!isPremium && (
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '12px', color: 'var(--vt-text-disabled)', margin: '12px 0 0' }}>
                Limits reset on the 1st of each month. Upgrade to Premium for unlimited access.
              </p>
            )}
          </div>

          {/* Premium features list (free users only) */}
          {!isPremium && (
            <div style={{ border: '1px solid var(--vt-surface-border)', borderRadius: '10px', padding: '20px', backgroundColor: 'var(--vt-surface-raised)', marginTop: '16px' }}>
              <p style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--vt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>
                Premium includes
              </p>
              {[
                'Unlimited ATS scores',
                'Unlimited AI resume optimization',
                'Unlimited saved job descriptions',
                'Priority AI processing',
                'AI cover letter generation (coming soon)',
                'Advanced analytics (coming soon)',
              ].map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: 'var(--vt-status-success)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--vt-font-body)', fontSize: '13.5px', color: 'var(--vt-text-body)' }}>{feature}</span>
                </div>
              ))}
              <button
                onClick={() => void handleUpgrade()}
                disabled={actionLoading}
                style={{ marginTop: '16px', width: '100%', padding: '10px', backgroundColor: 'var(--vt-brand-500)', color: '#ffffff', border: 'none', borderRadius: '6px', fontFamily: 'var(--vt-font-body)', fontSize: '14px', fontWeight: 500, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}
                type="button"
              >
                {actionLoading ? 'Redirecting to checkout\u2026' : 'Upgrade to Premium'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — Suspense boundary required by Next.js 15 for useSearchParams
// ---------------------------------------------------------------------------

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
        <Loader size={20} strokeWidth={1.5} style={{ color: 'var(--vt-text-muted)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
