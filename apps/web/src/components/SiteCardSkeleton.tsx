import React from 'react';

export const SiteCardSkeleton: React.FC = () => {
  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      {/* Row 1: Site Title, URL & Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="skeleton-shimmer"
            style={{
              height: '22px',
              width: '58%',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '8px',
            }}
          />
          <div
            className="skeleton-shimmer"
            style={{
              height: '13px',
              width: '38%',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        </div>
        <div style={{ flexShrink: 0 }}>
          <div
            className="skeleton-shimmer"
            style={{
              height: '24px',
              width: '82px',
              borderRadius: 'var(--radius-full)',
            }}
          />
        </div>
      </div>

      {/* Row 2: Audit timestamp & Viewport Switcher */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            className="skeleton-shimmer"
            style={{
              height: '16px',
              width: '74px',
              borderRadius: 'var(--radius-sm)',
            }}
          />
          <div
            className="skeleton-shimmer"
            style={{
              height: '20px',
              width: '138px',
              borderRadius: '4px',
            }}
          />
        </div>

        {/* Viewport switch skeleton */}
        <div
          className="skeleton-shimmer"
          style={{
            height: '28px',
            width: '144px',
            borderRadius: 'var(--radius-sm)',
          }}
        />
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
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              className="skeleton-shimmer"
              style={{
                width: '62px',
                height: '62px',
                borderRadius: '50%',
              }}
            />
            <div
              className="skeleton-shimmer"
              style={{
                width: '44px',
                height: '10px',
                borderRadius: '4px',
              }}
            />
          </div>
        ))}
      </div>

      {/* Core Web Vitals metrics strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="skeleton-shimmer" style={{ width: '68px', height: '14px', borderRadius: '4px' }} />
        <div className="skeleton-shimmer" style={{ width: '68px', height: '14px', borderRadius: '4px' }} />
        <div className="skeleton-shimmer" style={{ width: '82px', height: '14px', borderRadius: '4px' }} />
      </div>

      {/* Bottom bar: Audit info, Channels, Action buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div className="skeleton-shimmer" style={{ width: '104px', height: '14px', borderRadius: '4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="skeleton-shimmer"
            style={{ width: '60px', height: '30px', borderRadius: 'var(--radius-md)' }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '88px', height: '30px', borderRadius: 'var(--radius-md)' }}
          />
          <div
            className="skeleton-shimmer"
            style={{ width: '32px', height: '30px', borderRadius: 'var(--radius-md)' }}
          />
        </div>
      </div>
    </div>
  );
};
