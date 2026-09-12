import React, { useState, useEffect, useCallback } from 'react';
import type { Site, CreateSiteInput } from '@mantiscan/shared';
import { apiUrl } from './lib/api.js';
import { useRouter } from './lib/router.js';
import { Navbar } from './components/Navbar.js';
import { SiteCard } from './components/SiteCard.js';
import { SiteCardSkeleton } from './components/SiteCardSkeleton.js';
import { Plus, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

const AddSiteModal = React.lazy(() => import('./components/AddSiteModal.js').then((m) => ({ default: m.AddSiteModal })));
const SiteDetailModal = React.lazy(() => import('./components/SiteDetailModal.js').then((m) => ({ default: m.SiteDetailModal })));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage.js').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = React.lazy(() => import('./pages/TermsPage.js').then((m) => ({ default: m.TermsPage })));

export const App: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningSiteId, setScanningSiteId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedDetailSite, setSelectedDetailSite] = useState<Site | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/sites'));
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
      }
    } catch (err) {
      console.error('Failed to load sites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Polling when a scan is in progress
  useEffect(() => {
    const hasRunningAudit = sites.some((s) => s.lastRunStatus === 'running');
    if (!hasRunningAudit && !scanningSiteId) return;

    const interval = setInterval(() => {
      fetchSites();
    }, 3000);

    return () => clearInterval(interval);
  }, [sites, scanningSiteId, fetchSites]);

  const handleScan = async (siteId: string) => {
    setScanningSiteId(siteId);
    try {
      const res = await fetch(apiUrl(`/api/sites/${siteId}/scan`), { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Audit queued on runner', 'info');
        const now = Math.floor(Date.now() / 1000);
        setSites((prev) =>
          prev.map((s) =>
            s.id === siteId
              ? {
                  ...s,
                  lastRunStatus: 'running',
                  lastScanRequestedAt: data.lastScanRequestedAt || now,
                }
              : s
          )
        );
        fetchSites();
      } else {
        showToast(data.error || 'Failed to trigger audit', 'error');
        if (res.status === 429 && data.retryAfter) {
          const now = Math.floor(Date.now() / 1000);
          setSites((prev) =>
            prev.map((s) =>
              s.id === siteId
                ? {
                    ...s,
                    lastScanRequestedAt: now - (300 - data.retryAfter),
                  }
                : s
            )
          );
        }
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setScanningSiteId(null);
    }
  };

  const handleAddSite = async (input: CreateSiteInput) => {
    const res = await fetch(apiUrl('/api/sites'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add site');
    }

    showToast('Website added to monitoring roster!', 'success');
    await fetchSites();
  };

  const handleDeleteSite = async (siteId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/sites/${siteId}`), { method: 'DELETE' });
      if (res.ok) {
        showToast('Website removed', 'info');
        fetchSites();
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const { currentPath, navigate } = useRouter();

  if (currentPath === '/privacy') {
    return (
      <React.Suspense fallback={null}>
        <PrivacyPage onNavigate={navigate} />
      </React.Suspense>
    );
  }

  if (currentPath === '/terms') {
    return (
      <React.Suspense fallback={null}>
        <TermsPage onNavigate={navigate} />
      </React.Suspense>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar sites={sites} onOpenAddModal={() => setIsAddModalOpen(true)} onNavigate={navigate} />

      {/* Main Content Area */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '36px 24px', flex: 1 }}>
        {/* Toast alert */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: toast.type === 'success' ? '#065f46' : toast.type === 'error' ? '#991b1b' : '#1e293b',
              color: '#ffffff',
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.875rem',
              fontWeight: 600,
              zIndex: 100,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {toast.type === 'success' ? (
              <CheckCircle size={18} color="#34d399" />
            ) : toast.type === 'error' ? (
              <AlertCircle size={18} color="#f87171" />
            ) : (
              <RefreshCw size={18} color="#38bdf8" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Hero Section */}
        <div style={{ marginBottom: '36px' }}>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Performance &amp; Accessibility Monitor
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', maxWidth: '640px' }}>
            Automated multi-run Lighthouse CI audits across Mobile &amp; Desktop viewports. Alerts are dispatched to team channels when scores drop below thresholds.
          </p>
        </div>

        {/* Loading skeleton state */}
        {loading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
              gap: '24px',
            }}
            aria-busy="true"
            aria-label="Loading monitored websites"
          >
            {[1, 2, 3].map((i) => (
              <SiteCardSkeleton key={i} />
            ))}
          </div>
        ) : sites.length === 0 ? (
          /* Empty state */
          <div
            className="glass-card"
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              maxWidth: '540px',
              margin: '40px auto',
            }}
          >
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo.png"
                alt="Mantiscan Mascot"
                width="76"
                height="76"
                style={{
                  width: '76px',
                  height: '76px',
                  objectFit: 'contain',
                  margin: '0 auto 16px auto',
                  filter: 'drop-shadow(0 0 24px rgba(16, 185, 129, 0.35))',
                }}
              />
            </picture>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
              No Websites Monitored Yet
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
              Add client or production websites to begin weekly automated Lighthouse CI audits and team channel alerts.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsAddModalOpen(true)}
              style={{ padding: '12px 24px', fontSize: '0.9375rem' }}
            >
              <Plus size={18} /> Add Your First Website
            </button>
          </div>
        ) : (
          /* Sites Grid */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
              gap: '24px',
            }}
          >
            {sites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                isScanning={scanningSiteId === site.id}
                onScan={handleScan}
                onViewDetails={(s) => setSelectedDetailSite(s)}
                onDelete={handleDeleteSite}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8125rem',
        }}
      >
        <p style={{ marginBottom: '8px' }}>
          Mantiscan — An Automated Lighthouse CI &amp; Alerting System
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Privacy Policy
          </button>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <button
            type="button"
            onClick={() => navigate('/terms')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Terms of Service
          </button>
        </div>
      </footer>

      {/* Modals */}
      <React.Suspense fallback={null}>
        {isAddModalOpen && (
          <AddSiteModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSubmit={handleAddSite}
            onNavigate={navigate}
          />
        )}

        {selectedDetailSite && (
          <SiteDetailModal
            site={selectedDetailSite}
            isOpen={!!selectedDetailSite}
            onClose={() => setSelectedDetailSite(null)}
            onSiteUpdated={fetchSites}
          />
        )}
      </React.Suspense>
    </div>
  );
};
