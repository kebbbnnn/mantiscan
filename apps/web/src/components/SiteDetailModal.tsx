import React, { useState, useEffect, useCallback } from 'react';
import type { Site, AuditRun, DeviceStrategy } from '@mantiscan/shared';
import { AUDIT_INTERVAL_PRESETS } from '@mantiscan/shared';
import { ScoreGauge } from './ScoreGauge.js';
import { SiteTrendChart } from './SiteTrendChart.js';
import { apiUrl } from '../lib/api.js';
import {
  getUserTimeZone,
  localHourToUtc,
  utcHourToLocal,
  formatHour,
  formatScheduleSummary,
  formatNextRunCountdown,
} from '../lib/schedule.js';
import { X, ExternalLink, Smartphone, Monitor, Plus, Calendar, Clock, Check, Sliders } from 'lucide-react';

interface SiteDetailModalProps {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
  onSiteUpdated?: () => void;
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({ site, isOpen, onClose, onSiteUpdated }) => {
  const [currentSite, setCurrentSite] = useState<Site | null>(site);
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [strategy, setStrategy] = useState<DeviceStrategy>('mobile');
  const [loading, setLoading] = useState(false);
  const [intervalDays, setIntervalDays] = useState<number>(site?.auditIntervalDays ?? 7);
  const [localHour, setLocalHour] = useState<number>(() => utcHourToLocal(site?.auditHourUtc ?? 0));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
  const [perfThresholdVal, setPerfThresholdVal] = useState<number>(site?.perfThreshold ?? 90);
  const [lcpThresholdSec, setLcpThresholdSec] = useState<number>((site?.lcpThresholdMs ?? 2500) / 1000);
  const [clsThresholdVal, setClsThresholdVal] = useState<number>(site?.clsThreshold ?? 0.1);
  const [inpThresholdMsVal, setInpThresholdMsVal] = useState<number>(site?.inpThresholdMs ?? 200);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [thresholdsSavedMsg, setThresholdsSavedMsg] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'slack' | 'discord'>('slack');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  const userTimeZone = getUserTimeZone();

  const fetchDetails = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/sites/${site.id}`));
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        if (data.site) {
          setCurrentSite(data.site);
          setIntervalDays(data.site.auditIntervalDays ?? 7);
          setLocalHour(utcHourToLocal(data.site.auditHourUtc ?? 0));
          setPerfThresholdVal(data.site.perfThreshold ?? 90);
          setLcpThresholdSec((data.site.lcpThresholdMs ?? 2500) / 1000);
          setClsThresholdVal(data.site.clsThreshold ?? 0.1);
          setInpThresholdMsVal(data.site.inpThresholdMs ?? 200);
        }
      }
    } catch (err) {
      console.error('Failed to fetch site details:', err);
    } finally {
      setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    if (isOpen && site) {
      setCurrentSite(site);
      setIntervalDays(site.auditIntervalDays ?? 7);
      setLocalHour(utcHourToLocal(site.auditHourUtc ?? 0));
      setPerfThresholdVal(site.perfThreshold ?? 90);
      setLcpThresholdSec((site.lcpThresholdMs ?? 2500) / 1000);
      setClsThresholdVal(site.clsThreshold ?? 0.1);
      setInpThresholdMsVal(site.inpThresholdMs ?? 200);
      fetchDetails();
    }
  }, [isOpen, site, fetchDetails]);

  if (!isOpen || !currentSite) return null;

  const displaySite = currentSite;

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displaySite) return;
    setSavingSchedule(true);
    setScheduleSavedMsg(false);

    try {
      const targetUtcHour = localHourToUtc(localHour);
      const res = await fetch(apiUrl(`/api/sites/${displaySite.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditIntervalDays: intervalDays,
          auditHourUtc: targetUtcHour,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.site) {
          setCurrentSite(data.site);
        }
        setScheduleSavedMsg(true);
        setTimeout(() => setScheduleSavedMsg(false), 3000);
        onSiteUpdated?.();
      }
    } catch (err) {
      console.error('Failed to update schedule:', err);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displaySite) return;
    setSavingThresholds(true);
    setThresholdsSavedMsg(false);

    try {
      const res = await fetch(apiUrl(`/api/sites/${displaySite.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfThreshold: perfThresholdVal,
          lcpThresholdMs: Math.round(lcpThresholdSec * 1000),
          clsThreshold: clsThresholdVal,
          inpThresholdMs: inpThresholdMsVal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.site) {
          setCurrentSite(data.site);
        }
        setThresholdsSavedMsg(true);
        setTimeout(() => setThresholdsSavedMsg(false), 3000);
        onSiteUpdated?.();
      }
    } catch (err) {
      console.error('Failed to update thresholds:', err);
    } finally {
      setSavingThresholds(false);
    }
  };

  const filteredRuns = runs.filter((r) => r.strategy === strategy);
  const latestRun = filteredRuns[0] || displaySite.latestRuns?.find((r) => r.strategy === strategy);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookUrl.trim()) return;

    try {
      const res = await fetch(apiUrl(`/api/sites/${displaySite.id}/channels`), {
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
      await fetch(apiUrl(`/api/sites/${displaySite.id}/channels/${channelId}`), {
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
                {displaySite.name}
              </h2>
              <span className={`badge badge-${displaySite.status}`}>
                ● {displaySite.status}
              </span>
            </div>
            <a
              href={displaySite.url}
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
              {displaySite.url}
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

        {/* Interactive Lighthouse Report Action Banner */}
        {latestRun?.reportUrl && (
          <div
            style={{
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              background: 'rgba(56, 189, 248, 0.07)',
              border: '1px solid rgba(56, 189, 248, 0.22)',
              borderRadius: 'var(--radius-md)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.125rem' }}>⚡</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Interactive {strategy === 'desktop' ? 'Desktop' : 'Mobile'} Lighthouse Report
                  </span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      color: 'var(--accent-cyan)',
                      background: 'rgba(56, 189, 248, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                    }}
                  >
                    14-day live diagnostic
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Inspect complete audits, filmstrip, treemap, and DOM opportunities
                </div>
              </div>
            </div>
            <a
              href={latestRun.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#fff',
                background: 'var(--accent-cyan)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)',
                transition: 'transform 0.15s ease, opacity 0.15s ease',
              }}
            >
              Open Full Report ↗
            </a>
          </div>
        )}

        {/* Core Web Vitals */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Core Web Vitals Metrics
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Target SLAs configured for this site
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Largest Contentful Paint (LCP)</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Target: ≤{(displaySite.lcpThresholdMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  marginTop: '4px',
                  color:
                    latestRun?.lcpMs != null
                      ? latestRun.lcpMs <= displaySite.lcpThresholdMs
                        ? '#10b981'
                        : '#f87171'
                      : 'var(--text-primary)',
                }}
              >
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cumulative Layout Shift (CLS)</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Target: ≤{displaySite.clsThreshold.toFixed(2)}
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  marginTop: '4px',
                  color:
                    latestRun?.cls !== undefined && latestRun?.cls !== null
                      ? latestRun.cls <= displaySite.clsThreshold
                        ? '#10b981'
                        : '#f87171'
                      : 'var(--text-primary)',
                }}
              >
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Interaction to Next Paint (INP)</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Target: ≤{displaySite.inpThresholdMs}ms
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  marginTop: '4px',
                  color:
                    latestRun?.inpMs != null
                      ? latestRun.inpMs <= displaySite.inpThresholdMs
                        ? '#10b981'
                        : '#f87171'
                      : 'var(--text-primary)',
                }}
              >
                {latestRun?.inpMs ? `${latestRun.inpMs}ms` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Historical Multi-Scan Trend Graph */}
        {loading && runs.length === 0 ? (
          <div
            className="skeleton-shimmer"
            style={{
              height: '240px',
              marginBottom: '24px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        ) : (
          <SiteTrendChart runs={filteredRuns} site={displaySite} strategy={strategy} />
        )}

        {/* Audit Runs History Table */}
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Recent Audit History ({strategy})
          </h4>
          {loading && runs.length === 0 ? (
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
                  {[1, 2, 3].map((i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px' }}>
                        <div className="skeleton-shimmer" style={{ width: '140px', height: '14px', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div className="skeleton-shimmer" style={{ width: '60px', height: '14px', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div className="skeleton-shimmer" style={{ width: '120px', height: '14px', borderRadius: '4px' }} />
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div className="skeleton-shimmer" style={{ width: '70px', height: '14px', borderRadius: '4px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredRuns.length === 0 ? (
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
                        <span style={{ color: r.performanceScore >= displaySite.perfThreshold ? '#10b981' : '#ef4444' }}>
                          {r.performanceScore}
                        </span>{' '}
                        /{' '}
                        <span style={{ color: r.accessibilityScore >= displaySite.a11yThreshold ? '#10b981' : '#ef4444' }}>
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

        {/* Automated Audit Schedule Configuration */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={16} color="var(--accent-mantis)" />
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Automated Audit Schedule
              </h4>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {scheduleSavedMsg && (
                <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={14} /> Schedule Updated!
                </span>
              )}
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(52, 211, 153, 0.1)',
                  color: 'var(--accent-mantis)',
                  border: '1px solid rgba(52, 211, 153, 0.25)',
                }}
              >
                {formatScheduleSummary(displaySite.auditIntervalDays ?? 7, displaySite.auditHourUtc ?? 0)}
              </span>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '14px' }}>
              {/* Cadence */}
              <div>
                <label className="form-label" style={{ marginBottom: '6px' }}>Recurrence Cadence</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '6px' }}>
                  {AUDIT_INTERVAL_PRESETS.map((preset) => {
                    const isSelected = intervalDays === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setIntervalDays(preset.value)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: isSelected ? 700 : 500,
                          border: isSelected ? '1px solid var(--accent-mantis)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          color: isSelected ? 'var(--accent-mantis)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time of Day */}
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                  <Clock size={12} color="var(--accent-cyan)" />
                  Preferred Execution Time
                </label>
                <select
                  className="form-input"
                  value={localHour}
                  onChange={(e) => setLocalHour(parseInt(e.target.value, 10))}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    padding: '7px 10px',
                  }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i} style={{ background: '#12161f', color: '#fff' }}>
                      {formatHour(i)} {i >= 1 && i <= 5 ? '(Off-peak)' : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Your timezone: {userTimeZone} ({localHourToUtc(localHour)}:00 UTC)
                </p>
              </div>
            </div>

            {/* Bottom info & Save button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Next scheduled audit: <strong style={{ color: 'var(--text-primary)' }}>{new Date(displaySite.nextAuditAt * 1000).toLocaleString()}</strong> ({formatNextRunCountdown(displaySite.nextAuditAt)})
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                disabled={savingSchedule}
                onClick={handleSaveSchedule}
              >
                {savingSchedule ? 'Saving...' : 'Update Schedule'}
              </button>
            </div>
          </div>
        </div>

        {/* Alert Thresholds & SLA Tuning */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={15} color="var(--accent-cyan)" />
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Alert Thresholds & SLA Tuning
              </h4>
            </div>
            {thresholdsSavedMsg && (
              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={12} /> Thresholds updated successfully
              </span>
            )}
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label className="form-label">Min Performance Score ({perfThresholdVal})</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={perfThresholdVal}
                  onChange={(e) => setPerfThresholdVal(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-mantis)' }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Target SLA: ≥ {perfThresholdVal}
                </div>
              </div>

              <div>
                <label className="form-label">Max LCP ({lcpThresholdSec.toFixed(1)}s)</label>
                <input
                  type="range"
                  min="1.0"
                  max="6.0"
                  step="0.1"
                  value={lcpThresholdSec}
                  onChange={(e) => setLcpThresholdSec(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Alert if &gt; {lcpThresholdSec.toFixed(1)}s (Good: ≤ 2.5s)
                </div>
              </div>

              <div>
                <label className="form-label">Max CLS ({clsThresholdVal.toFixed(2)})</label>
                <input
                  type="range"
                  min="0.02"
                  max="0.50"
                  step="0.01"
                  value={clsThresholdVal}
                  onChange={(e) => setClsThresholdVal(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Alert if &gt; {clsThresholdVal.toFixed(2)} (Good: ≤ 0.10)
                </div>
              </div>

              <div>
                <label className="form-label">Max INP ({inpThresholdMsVal}ms)</label>
                <input
                  type="range"
                  min="50"
                  max="600"
                  step="25"
                  value={inpThresholdMsVal}
                  onChange={(e) => setInpThresholdMsVal(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Alert if &gt; {inpThresholdMsVal}ms (Good: ≤ 200ms)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                disabled={savingThresholds}
                onClick={handleSaveThresholds}
              >
                {savingThresholds ? 'Saving...' : 'Update Thresholds'}
              </button>
            </div>
          </div>
        </div>

        {/* Alert Channels Management */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Configured Notification Channels
          </h4>
          {displaySite.channels && displaySite.channels.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {displaySite.channels.map((ch) => (
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
              required
              aria-required="true"
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
