import React from 'react';
import { Plus, Activity } from 'lucide-react';
import type { Site } from '@mantiscan/shared';

interface NavbarProps {
  sites: Site[];
  onOpenAddModal: () => void;
  onNavigate?: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ sites, onOpenAddModal, onNavigate }) => {
  const healthyCount = sites.filter((s) => s.status === 'healthy').length;
  const degradedCount = sites.filter((s) => s.status === 'degraded').length;

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(11, 15, 25, 0.8)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        padding: '16px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Brand */}
        <div
          onClick={() => onNavigate?.('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: onNavigate ? 'pointer' : 'default',
          }}
        >
          <picture>
            <source srcSet="/logo.webp" type="image/webp" />
            <img
              src="/logo.png"
              alt="Mantiscan Logo"
              width="42"
              height="42"
              fetchPriority="high"
              style={{
                width: '42px',
                height: '42px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 14px rgba(16, 185, 129, 0.4))',
              }}
            />
          </picture>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                MANTISCAN
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                CI / CD
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Automated Lighthouse Auditing & Alerting
            </p>
          </div>
        </div>

        {/* Center: Health Stats Pill */}
        {sites.length > 0 && (
          <div className="navbar-health-pill">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color="var(--accent-mantis)" />
              <span style={{ color: 'var(--text-secondary)' }}>Sites:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sites.length}</span>
            </div>
            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#10b981' }}>●</span>
              <span style={{ color: 'var(--text-secondary)' }}>Healthy:</span>
              <span style={{ fontWeight: 700, color: '#10b981' }}>{healthyCount}</span>
            </div>
            {degradedCount > 0 && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ef4444' }}>●</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Degraded:</span>
                  <span style={{ fontWeight: 700, color: '#ef4444' }}>{degradedCount}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" className="btn btn-primary" onClick={onOpenAddModal}>
            <Plus size={16} /> Add Website
          </button>
        </div>
      </div>
    </header>
  );
};
