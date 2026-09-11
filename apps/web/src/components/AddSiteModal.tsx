import React, { useState } from 'react';
import type { CreateSiteInput } from '@mantiscan/shared';
import { DEFAULT_THRESHOLDS, AUDIT_INTERVAL_PRESETS, DEFAULT_SCHEDULE } from '@mantiscan/shared';
import { getUserTimeZone, localHourToUtc, formatHour, getIntervalName } from '../lib/schedule.js';
import { X, Plus, Sliders, Bell, Calendar, Clock } from 'lucide-react';

interface AddSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSiteInput) => Promise<void>;
}

export const AddSiteModal: React.FC<AddSiteModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [perfThreshold, setPerfThreshold] = useState<number>(DEFAULT_THRESHOLDS.performance);
  const [a11yThreshold, setA11yThreshold] = useState<number>(DEFAULT_THRESHOLDS.accessibility);
  const [bestPracticesThreshold, setBestPracticesThreshold] = useState<number>(DEFAULT_THRESHOLDS.bestPractices);
  const [seoThreshold, setSeoThreshold] = useState<number>(DEFAULT_THRESHOLDS.seo);
  const [intervalDays, setIntervalDays] = useState<number>(DEFAULT_SCHEDULE.intervalDays);
  const [localHour, setLocalHour] = useState<number>(2); // 2:00 AM local time default
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userTimeZone = getUserTimeZone();
  const utcHour = localHourToUtc(localHour);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError('Please provide both site name and website URL.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        perfThreshold,
        a11yThreshold,
        bestPracticesThreshold,
        seoThreshold,
        auditIntervalDays: intervalDays,
        auditHourUtc: utcHour,
        slackWebhookUrl: slackWebhookUrl.trim() || undefined,
        discordWebhookUrl: discordWebhookUrl.trim() || undefined,
      });
      onClose();
      // Reset form
      setName('');
      setUrl('');
      setIntervalDays(DEFAULT_SCHEDULE.intervalDays);
      setLocalHour(2);
      setSlackWebhookUrl('');
      setDiscordWebhookUrl('');
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Add Website to Monitor
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Weekly Lighthouse audits and regression alerting.
            </p>
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

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: '#f87171',
              fontSize: '0.8125rem',
              marginBottom: '18px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Website Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Acme Production App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Target URL</label>
            <input
              type="text"
              className="form-input"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {/* Audit Schedule Section */}
          <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Calendar size={16} color="var(--accent-mantis)" />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Automated Audit Schedule
              </span>
            </div>

            {/* Recurrence Cadence Pills */}
            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>Recurrence Cadence</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '8px' }}>
                {AUDIT_INTERVAL_PRESETS.map((preset) => {
                  const isSelected = intervalDays === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setIntervalDays(preset.value)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8125rem',
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

            {/* Preferred Time of Day */}
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} color="var(--accent-cyan)" />
                Preferred Execution Time (Your Local Time)
              </label>
              <select
                className="form-input"
                value={localHour}
                onChange={(e) => setLocalHour(parseInt(e.target.value, 10))}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} style={{ background: '#12161f', color: '#fff' }}>
                    {formatHour(i)} {i >= 1 && i <= 5 ? '(Off-peak recommended)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Schedule Preview Helper */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              🗓️ Repeats <strong style={{ color: 'var(--text-primary)' }}>{getIntervalName(intervalDays)}</strong> at{' '}
              <strong style={{ color: 'var(--accent-mantis)' }}>{formatHour(localHour)}</strong> in your timezone (
              <span style={{ color: 'var(--text-secondary)' }}>{userTimeZone}</span> • {utcHour}:00 UTC). Initial baseline scan runs immediately upon adding.
            </div>
          </div>

          {/* Thresholds Section */}
          <div style={{ margin: '24px 0', borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Sliders size={16} color="var(--accent-mantis)" />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Score Alert Thresholds
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div>
                <label className="form-label">Performance (min: {perfThreshold})</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={perfThreshold}
                  onChange={(e) => setPerfThreshold(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-mantis)' }}
                />
              </div>
              <div>
                <label className="form-label">Accessibility (min: {a11yThreshold})</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={a11yThreshold}
                  onChange={(e) => setA11yThreshold(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-mantis)' }}
                />
              </div>
              <div>
                <label className="form-label">Best Practices (min: {bestPracticesThreshold})</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={bestPracticesThreshold}
                  onChange={(e) => setBestPracticesThreshold(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-mantis)' }}
                />
              </div>
              <div>
                <label className="form-label">SEO (min: {seoThreshold})</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={seoThreshold}
                  onChange={(e) => setSeoThreshold(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: 'var(--accent-mantis)' }}
                />
              </div>
            </div>
          </div>

          {/* Webhook Notifications Section */}
          <div style={{ margin: '20px 0', borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Bell size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Team Alert Channels (Optional)
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Slack Incoming Webhook URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://hooks.slack.com/services/..."
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Discord Webhook URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={16} />
              {loading ? 'Adding...' : 'Add Website'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
