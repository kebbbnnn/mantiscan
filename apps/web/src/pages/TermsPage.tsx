import React from 'react';
import { LegalLayout, type LegalSection } from '../components/LegalLayout.js';
import { Scale, AlertTriangle, Cpu, Webhook, ShieldAlert, FileText, Ban } from 'lucide-react';

interface TermsPageProps {
  onNavigate: (path: string) => void;
}

const SECTIONS: LegalSection[] = [
  { id: 'acceptance', title: 'Acceptance & Scope' },
  { id: 'aup', title: 'Acceptable Use Policy' },
  { id: 'limits', title: 'Audit Execution & Limits' },
  { id: 'webhooks', title: 'Webhook Integrations' },
  { id: 'disclaimer', title: 'Disclaimer of Warranties' },
  { id: 'liability', title: 'Limitation of Liability' },
  { id: 'termination', title: 'Suspension & Termination' },
];

export const TermsPage: React.FC<TermsPageProps> = ({ onNavigate }) => {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="Terms governing use of Mantiscan's automated Lighthouse CI auditing, performance monitoring, and alerting services."
      lastUpdated="September 12, 2026"
      sections={SECTIONS}
      onNavigate={onNavigate}
    >
      {/* 1. Acceptance */}
      <section id="acceptance" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Scale size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            1. Acceptance &amp; Scope
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          By accessing the Mantiscan web dashboard, submitting a target website URL for monitoring, or triggering an on-demand audit, you agree to be bound by these Terms of Service. If you do not agree with these terms, you must not use this service.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Mantiscan provides automated performance and accessibility testing using headless Google Chrome (`@lhci/cli`) executed across mobile and desktop viewport profiles.
        </p>
      </section>

      {/* 2. Acceptable Use Policy */}
      <section id="aup" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Ban size={22} color="var(--color-poor)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            2. Acceptable Use Policy (AUP)
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '14px' }}>
          To protect web infrastructure, public internet stability, and cloud runner resources, you agree to strictly adhere to the following rules:
        </p>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '16px',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: '#f87171' }}>Mandatory Requirement:</strong> You represent and warrant that you either own the target domain submitted, or possess explicit written authorization from the owner to perform automated browser audits and load benchmarking.
        </div>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>No Private or Internal IP Scanning (SSRF):</strong> You may not enter loopback addresses (`localhost`, `127.0.0.1`), link-local cloud metadata addresses (`169.254.169.254`), or private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>No Denial of Service (DoS):</strong> You may not weaponize Mantiscan's multi-run headless browser worker to perform stress-testing, resource exhaustion, or distributed attacks on third-party servers.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>No Automated Script Abuse:</strong> You may not programmatic-spam the API endpoint with batch creation requests without prior coordination.
          </li>
        </ul>
      </section>

      {/* 3. Audit Execution & Limits */}
      <section id="limits" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Cpu size={22} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            3. Audit Execution &amp; Resource Limits
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          Mantiscan runs Lighthouse CI with 3 runs per audit cycle to compute accurate median scores. To preserve free-tier compute boundaries:
        </p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <li>Audits are asynchronous and queued on GitHub Actions Ubuntu cloud runners. Execution times vary based on cloud runner concurrency.</li>
          <li>We reserve the right to throttle, queue, or cancel audits for websites exhibiting excessive response latencies or abnormally high bandwidth consumption.</li>
          <li>Audit scheduling presets are adhered to on a best-effort basis subject to GitHub Actions runner availability.</li>
        </ul>
      </section>

      {/* 4. Webhooks */}
      <section id="webhooks" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Webhook size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            4. Webhook Integrations &amp; Notifications
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          When configuring Slack or Discord webhook endpoints, you are solely responsible for ensuring the secrecy and accuracy of those webhook URLs. Mantiscan disclaims any liability for misdirected notifications resulting from incorrect webhook configurations or third-party platform API outages.
        </p>
      </section>

      {/* 5. Disclaimer of Warranties */}
      <section id="disclaimer" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <AlertTriangle size={22} color="var(--color-average)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            5. Disclaimer of Warranties ("AS-IS")
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          THE MANTISCAN SERVICE IS PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Mantiscan does not warrant that audits will be uninterrupted, error-free, or that results will produce identical scores between runs due to network jitter and target server variance.
        </p>
      </section>

      {/* 6. Limitation of Liability */}
      <section id="liability" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <ShieldAlert size={22} color="var(--color-poor)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            6. Limitation of Liability
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '12px' }}>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL MANTISCAN, ITS MAINTAINERS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING:
        </p>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <li>Target server downtime, crash, or memory exhaustion triggered by headless Chrome visits.</li>
          <li>Bandwidth or hosting provider overage charges incurred by audited sites.</li>
          <li>False-positive or false-negative regression alerts dispatched to team channels.</li>
          <li>Loss of revenue, data, or business interruption.</li>
        </ul>
      </section>

      {/* 7. Suspension & Termination */}
      <section id="termination" className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <FileText size={22} color="var(--accent-mantis)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            7. Suspension &amp; Termination
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '14px' }}>
          We reserve the right, in our sole discretion and without prior notice, to immediately suspend or remove any monitored website from the roster that violates this Acceptable Use Policy, targets unauthorized infrastructure, or harms runner availability.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          These terms may be updated periodically. Continued use of Mantiscan following any updates constitutes acceptance of the revised Terms of Service.
        </p>
      </section>
    </LegalLayout>
  );
};
