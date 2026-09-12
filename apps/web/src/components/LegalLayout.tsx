import React from 'react';
import { ArrowLeft, Shield, Clock, ExternalLink } from 'lucide-react';

export interface LegalSection {
  id: string;
  title: string;
}

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  title,
  subtitle,
  lastUpdated,
  sections,
  onNavigate,
  children,
}) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top sticky header bar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(11, 15, 25, 0.85)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '14px 24px',
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
          {/* Back button & Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigate('/')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                fontSize: '0.8125rem',
              }}
            >
              <ArrowLeft size={15} />
              <span>Back to Dashboard</span>
            </button>

            <div
              onClick={() => onNavigate('/')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <img
                src="/logo.png"
                alt="Mantiscan Logo"
                style={{
                  width: '28px',
                  height: '28px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.4))',
                }}
              />
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                }}
              >
                MANTISCAN
              </span>
            </div>
          </div>

          {/* Legal Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--accent-mantis)',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <Shield size={13} />
            <span>Official Legal Documentation</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          padding: '40px 24px',
          flex: 1,
        }}
      >
        {/* Page Hero Header */}
        <div style={{ marginBottom: '36px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '0.8125rem',
              marginBottom: '10px',
            }}
          >
            <Clock size={14} />
            <span>Effective Date: {lastUpdated}</span>
          </div>
          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '1rem',
              lineHeight: 1.6,
              maxWidth: '720px',
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* Content Layout (Sidebar + Article) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '32px',
            alignItems: 'start',
          }}
        >
          {/* Table of Contents Sidebar */}
          <aside
            className="glass-card"
            style={{
              padding: '20px',
              position: 'sticky',
              top: '80px',
            }}
          >
            <h3
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: '14px',
                fontWeight: 700,
              }}
            >
              Table of Contents
            </h3>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sections.map((section, idx) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--accent-mantis)',
                      opacity: 0.8,
                    }}
                  >
                    0{idx + 1}
                  </span>
                  <span style={{ fontWeight: 500 }}>{section.title}</span>
                </button>
              ))}
            </nav>

            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <p>Questions or security reports?</p>
              <a
                href="https://github.com/kebbbnnn/mantiscan/issues"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--accent-mantis)',
                  textDecoration: 'none',
                  marginTop: '6px',
                  fontWeight: 600,
                }}
              >
                <span>GitHub Issues</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </aside>

          {/* Main Legal Content */}
          <article
            style={{
              gridColumn: 'span 2',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {children}
          </article>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.8125rem',
          marginTop: 'auto',
        }}
      >
        <p style={{ marginBottom: '8px' }}>
          Mantiscan — Automated Lighthouse CI &amp; Alerting System
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.8125rem' }}>
          <button
            type="button"
            onClick={() => onNavigate('/privacy')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => onNavigate('/terms')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Terms of Service
          </button>
        </div>
      </footer>
    </div>
  );
};
