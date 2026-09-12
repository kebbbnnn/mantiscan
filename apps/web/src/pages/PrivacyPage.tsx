import React from 'react';
import { LegalLayout, type LegalSection } from '../components/LegalLayout.js';
import { ShieldCheck, Database, Cpu, Bell, Trash2, Lock, Mail } from 'lucide-react';

interface PrivacyPageProps {
  onNavigate: (path: string) => void;
}

const SECTIONS: LegalSection[] = [
  { id: 'zero-tracking', title: 'Zero-Tracking Guarantee' },
  { id: 'collection', title: 'Information We Collect' },
  { id: 'usage', title: 'How We Use Information' },
  { id: 'subprocessors', title: 'Third-Party Sub-Processors' },
  { id: 'retention', title: 'Data Retention & Erasure' },
  { id: 'security', title: 'Security Safeguards' },
  { id: 'contact', title: 'Contact Information' },
];

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate }) => {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Mantiscan collects, processes, and protects data when auditing website performance, accessibility, and Core Web Vitals."
      lastUpdated="September 12, 2026"
      sections={SECTIONS}
      onNavigate={onNavigate}
    >
      {/* 1. Zero Tracking */}
      <section id="zero-tracking" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <ShieldCheck size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            1. Zero-Tracking Guarantee
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '14px' }}>
          Mantiscan is engineered as a privacy-first developer tool. We do not use behavioral tracking scripts, advertising trackers, remarketing pixels, or third-party analytical cookies.
        </p>
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--accent-mantis)' }}>Key Commitment:</strong> Mantiscan will never sell, rent, monetize, or broker any data submitted to this service to data brokers or third-party advertisers.
        </div>
      </section>

      {/* 2. Information We Collect */}
      <section id="collection" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Database size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            2. Information We Collect
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '14px' }}>
          Mantiscan only collects data strictly necessary to execute automated Lighthouse audits and deliver regression alerts:
        </p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Target Website URLs:</strong> The publicly accessible HTTP/HTTPS web addresses you enter into the monitoring roster.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Audit Metrics & Artifacts:</strong> Lighthouse scores across Performance, Accessibility, Best Practices, and SEO, including Core Web Vitals (FCP, LCP, TBT, CLS, Speed Index) and compiled HTML audit reports.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Alert Destinations:</strong> Slack and Discord incoming webhook URLs optionally provided to receive notifications.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Standard Edge Server Logs:</strong> Standard HTTP request metadata (IP address, user agent, requested route, and timestamp) processed automatically by Cloudflare Workers for infrastructure routing and DDoS mitigation.
          </li>
        </ul>
      </section>

      {/* 3. How We Use Information */}
      <section id="usage" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Cpu size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            3. How We Use Information
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          Collected data is used strictly for the following operational purposes:
        </p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <li>Executing scheduled and on-demand automated Google Lighthouse CI audits.</li>
          <li>Computing median scores across mobile and desktop viewports to eliminate cloud CPU jitter.</li>
          <li>Generating historical performance trend graphs on your dashboard.</li>
          <li>Dispatching state-transition and score regression alerts to your configured Slack or Discord webhooks.</li>
        </ul>
      </section>

      {/* 4. Sub-processors */}
      <section id="subprocessors" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Bell size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            4. Third-Party Sub-Processors
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
          To deliver a zero-cost serverless architecture, Mantiscan utilizes the following trusted cloud infrastructure providers:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>Cloudflare</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
              Hosts the frontend (Pages), API backend (Workers), and serverless SQLite database (D1).
            </p>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>GitHub Actions</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
              Executes headless Chrome audit runners in isolated Ubuntu cloud containers.
            </p>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>Slack &amp; Discord</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
              Receives automated webhook payloads containing score cards and regression alerts when configured.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Retention */}
      <section id="retention" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Trash2 size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            5. Data Retention &amp; Erasure
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          Audit records and historical scores are stored in Cloudflare D1. You hold full control over the data lifecycle:
        </p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Immediate Site Deletion:</strong> Deleting a website from the dashboard permanently purges the site configuration and all associated historical audit records via SQLite foreign key cascades.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Manual Purge Requests:</strong> If you need historical records erased without using the dashboard, you may submit a request to the maintainer contact below.
          </li>
        </ul>
      </section>

      {/* 6. Security */}
      <section id="security" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Lock size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            6. Security Safeguards
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          All network traffic between your browser, Cloudflare Workers, and GitHub Actions is encrypted in-transit with TLS 1.3. Webhook communications from GitHub Actions to the API are cryptographically verified via a shared ingest secret (`INGEST_SECRET`). Secrets and GitHub Personal Access Tokens are stored strictly in encrypted Cloudflare Workers secrets and are never exposed to the client-side bundle.
        </p>
      </section>

      {/* 7. Contact */}
      <section id="contact" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Mail size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            7. Contact Information
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '14px' }}>
          If you have questions regarding this Privacy Policy or wish to report a security vulnerability, please contact us via:
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="mailto:privacy@mantiscan.dev"
            className="btn btn-secondary"
            style={{ fontSize: '0.8125rem' }}
          >
            <Mail size={14} />
            <span>privacy@mantiscan.dev</span>
          </a>
          <a
            href="https://github.com/kebbbnnn/mantiscan/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '0.8125rem' }}
          >
            <span>GitHub Issues Tracker</span>
          </a>
        </div>
      </section>
    </LegalLayout>
  );
};
