import React, { useState, useEffect, useCallback } from 'react';
import type { Site, AuditRun, DeviceStrategy } from '@mantiscan/shared';
import { ScoreGauge } from './ScoreGauge.js';
import { X, ExternalLink, Smartphone, Monitor, Plus, Loader2 } from 'lucide-react';

interface SiteDetailModalProps {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({ site, isOpen, onClose }) => {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [strategy, setStrategy] = useState<DeviceStrategy>('mobile');
  const [loading, setLoading] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'slack' | 'discord'>('slack');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${site.id}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch (err) {
      console.error('Failed to fetch site details:', err);
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    if (isOpen && site) {
      fetchDetails();
    }
  }, [isOpen, site, fetchDetails]);

  if (!isOpen || !site) return null;

  const filteredRuns = runs.filter((r) => r.strategy === strategy);
  const latestRun = filteredRuns[0] || site.latestRuns?.find((r) => r.strategy === strategy);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.trim()) return;

    try {
      const res = await fetch(`/api/sites/${site.id}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newChannelType,
          webhookUrl: newWebhookUrl.trim(),
        }),
      });

      if (res.ok) {
        setNewWebhookUrl('');
        fetchDetails();
      }
    } catch (err) {
      console.error('Failed to add channel:', err);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await fetch(`/api/sites/${site.id}/channels/${channelId}`, {
        method: 'DELETE',
      });
      fetchDetails();
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {site.name}
              </h2>
              {loading && <Loader2 size={16} color="var(--accent-mantis)" className="animate-pulse" />}
              <span className={`badge badge-${site.status}`}>
                ● {site.status}
              </span>
            </div>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '4px',
                textDecoration: 'none',
              }}
            >
              {site.url}
              <ExternalLink size={12} />
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewport switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            type="button"
            className={`btn ${strategy === 'mobile' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStrategy('mobile')}
            style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
          >
            <Smartphone size={14} /> Mobile Strategy
          </button>
          <button
            type="button"
            className={`btn ${strategy === 'desktop' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStrategy('desktop')}
            style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
          >
            <Monitor size={14} /> Desktop Strategy
          </button>
        </div>

        {/* Latest Audit Scores */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            padding: '18px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '24px',
          }}
        >
          <ScoreGauge score={latestRun?.performanceScore} label="Performance" size={80} />
          <ScoreGauge score={latestRun?.accessibilityScore} label="Accessibility" size={80} />
          <ScoreGauge score={latestRun?.bestPracticesScore} label="Best Practices" size={80} />
          <ScoreGauge score={latestRun?.seoScore} label="SEO" size={80} />
        </div>

        {/* Core Web Vitals */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Core Web Vitals Metrics
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Largest Contentful Paint (LCP)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {latestRun?.lcpMs ? `${(latestRun.lcpMs / 1000).toFixed(2)}s` : '—'}
              </div>
            </div>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cumulative Layout Shift (CLS)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {latestRun?.cls !== undefined && latestRun?.cls !== null ? latestRun.cls.toFixed(3) : '—'}
              </div>
            </div>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interaction to Next Paint (INP)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {latestRun?.inpMs ? `${latestRun.inpMs}ms` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Audit Runs History Table */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Recent Audit History ({strategy})
          </h4>
          {filteredRuns.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No audits recorded yet for {strategy}. Click &quot;Scan Now&quot; to trigger the first run.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Date</th>
                    <th style={{ padding: '10px 14px' }}>Trigger</th>
                    <th style={{ padding: '10px 14px' }}>Scores (P / A / BP / SEO)</th>
                    <th style={{ padding: '10px 14px' }}>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                        {new Date(r.createdAt * 1000).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 14px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>
                        {r.triggeredBy}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: r.performanceScore >= site.perfThreshold ? '#10b981' : '#ef4444' }}>
                          {r.performanceScore}
                        </span>{' '}
                        /{' '}
                        <span style={{ color: r.accessibilityScore >= site.a11yThreshold ? '#10b981' : '#ef4444' }}>
                          {r.accessibilityScore}
                        </span>{' '}
                        / {r.bestPracticesScore} / {r.seoScore}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {r.reportUrl ? (
                          <a
                            href={r.reportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}
                          >
                            View Report ↗
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Alert Channels Management */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Configured Notification Channels
          </h4>
          {site.channels && site.channels.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {site.channels.map((ch) => (
                <div
                  key={ch.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ch.type === 'slack' ? '💬 Slack Webhook' : '🎮 Discord Webhook'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch.id)}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              No channels configured. Add a Slack or Discord webhook below to receive alerts.
            </p>
          )}

          <form onSubmit={handleAddChannel} style={{ display: 'flex', gap: '8px' }}>
            <select
              value={newChannelType}
              onChange={(e) => setNewChannelType(e.target.value as 'slack' | 'discord')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '0.8125rem',
              }}
            >
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
            </select>
            <input
              type="url"
              className="form-input"
              placeholder="Paste webhook URL..."
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.8125rem' }}
            />
            <button type="submit" className="btn btn-secondary" style={{ padding: '8px 14px' }}>
              <Plus size={14} /> Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
