import React, { useState } from 'react';
import type { Site, DeviceStrategy } from '@mantiscan/shared';
import { ScoreGauge } from './ScoreGauge.js';
import { Play, ExternalLink, Trash2, Smartphone, Monitor, Bell, AlertTriangle } from 'lucide-react';

interface SiteCardProps {
  site: Site;
  onScan: (id: string) => Promise<void>;
  onViewDetails: (site: Site) => void;
  onDelete: (id: string) => Promise<void>;
  isScanning: boolean;
}

export const SiteCard: React.FC<SiteCardProps> = ({
  site,
  onScan,
  onViewDetails,
  onDelete,
  isScanning,
}) => {
  const [strategy, setStrategy] = useState<DeviceStrategy>('mobile');

  // Find latest run matching selected strategy
  const currentRun = site.latestRuns?.find((r) => r.strategy === strategy) || site.latestRuns?.[0];

  const getStatusBadge = () => {
    if (site.lastRunStatus === 'running' || isScanning) {
      return <span className="badge badge-pending animate-pulse">● Auditing...</span>;
    }
    if (site.status === 'healthy') {
      return <span className="badge badge-healthy">● Healthy</span>;
    }
    if (site.status === 'degraded') {
      return <span className="badge badge-degraded">● Below Threshold</span>;
    }
    return <span className="badge badge-unknown">● Pending Run</span>;
  };

  const formatTimeAgo = (timestamp: number | null) => {
    if (!timestamp) return 'Never audited';
    const diff = Math.floor(Date.now() / 1000) - timestamp;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Row 1: Site Title, URL & Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3
            style={{
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={site.name}
          >
            {site.name}
          </h3>
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
              textDecoration: 'none',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {site.url}
            <ExternalLink size={12} />
          </a>
        </div>
        <div style={{ flexShrink: 0 }}>
          {getStatusBadge()}
        </div>
      </div>

      {/* Row 2: Audit timestamp & Viewport Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {formatTimeAgo(site.lastAuditedAt)}
        </span>

        {/* Viewport switch: Mobile / Desktop */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setStrategy('mobile')}
            style={{
              padding: '5px 9px',
              background: strategy === 'mobile' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: strategy === 'mobile' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <Smartphone size={13} /> Mobile
          </button>
          <button
            type="button"
            onClick={() => setStrategy('desktop')}
            style={{
              padding: '5px 9px',
              background: strategy === 'desktop' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: strategy === 'desktop' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <Monitor size={13} /> Desktop
          </button>
        </div>
      </div>

      {/* Center: The 4 Score Dials */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          padding: '14px 8px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <ScoreGauge
          score={currentRun?.performanceScore}
          label={`Perf (≥${site.perfThreshold})`}
        />
        <ScoreGauge
          score={currentRun?.accessibilityScore}
          label={`A11y (≥${site.a11yThreshold})`}
        />
        <ScoreGauge
          score={currentRun?.bestPracticesScore}
          label={`Practices (≥${site.bestPracticesThreshold})`}
        />
        <ScoreGauge
          score={currentRun?.seoScore}
          label={`SEO (≥${site.seoThreshold})`}
        />
      </div>

      {/* Core Web Vitals metrics strip */}
      {currentRun && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>LCP:</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: (currentRun.lcpMs ?? 0) <= 2500 ? '#10b981' : '#f59e0b',
              }}
            >
              {currentRun.lcpMs ? `${(currentRun.lcpMs / 1000).toFixed(2)}s` : '—'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>CLS:</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: (currentRun.cls ?? 0) <= 0.1 ? '#10b981' : '#f59e0b',
              }}
            >
              {currentRun.cls !== null && currentRun.cls !== undefined ? currentRun.cls.toFixed(3) : '0.000'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>Viewport:</span>
            <span
              style={{
                textTransform: 'capitalize',
                fontWeight: 600,
                color: strategy === 'mobile' ? 'var(--accent-cyan)' : 'var(--accent-mantis)',
              }}
            >
              {strategy}
            </span>
          </div>
        </div>
      )}

      {/* Threshold breach warning banner */}
      {currentRun &&
        (currentRun.performanceScore < site.perfThreshold ||
          currentRun.accessibilityScore < site.a11yThreshold) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: '0.8125rem',
              color: '#f87171',
            }}
          >
            <AlertTriangle size={15} />
            <span>Scores breach alert threshold</span>
          </div>
        )}

      {/* Bottom bar: Audit info, Channels, Action buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.8125rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
          <span>Audited: {formatTimeAgo(site.lastAuditedAt)}</span>
          {site.channels && site.channels.length > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--accent-mantis)',
                fontSize: '0.75rem',
              }}
            >
              <Bell size={12} /> {site.channels.length} channel{site.channels.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.8125rem' }}
            onClick={() => onViewDetails(site)}
          >
            Details
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.8125rem' }}
            disabled={isScanning || site.lastRunStatus === 'running'}
            onClick={() => onScan(site.id)}
          >
            <Play size={13} fill="currentColor" />
            {isScanning || site.lastRunStatus === 'running' ? 'Scanning...' : 'Scan Now'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '7px 9px' }}
            title="Delete website"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete ${site.name}?`)) {
                onDelete(site.id);
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
