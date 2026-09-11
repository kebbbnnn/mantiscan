import React, { useState, useEffect, useCallback } from 'react';
import type { Site, CreateSiteInput } from '@mantiscan/shared';
import { apiUrl } from './lib/api.js';
import { Navbar } from './components/Navbar.js';
import { SiteCard } from './components/SiteCard.js';
import { AddSiteModal } from './components/AddSiteModal.js';
import { SiteDetailModal } from './components/SiteDetailModal.js';
import { Shield, Plus, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

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
        fetchSites();
      } else {
        showToast(data.error || 'Failed to trigger audit', 'error');
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar sites={sites} onOpenAddModal={() => setIsAddModalOpen(true)} />

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

        {/* Loading state */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="animate-pulse" style={{ margin: '0 auto 12px auto' }} />
            <p>Loading monitored websites...</p>
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
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <Shield size={28} color="var(--accent-mantis)" />
            </div>
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
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
        <p>Mantiscan — $0 Budget Automated Lighthouse CI &amp; Alerting System</p>
      </footer>

      {/* Modals */}
      <AddSiteModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddSite}
      />

      <SiteDetailModal
        site={selectedDetailSite}
        isOpen={!!selectedDetailSite}
        onClose={() => setSelectedDetailSite(null)}
      />
    </div>
  );
};
