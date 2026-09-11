import React from 'react';

interface ScoreGaugeProps {
  score: number | null | undefined;
  label: string;
  size?: number;
  strokeWidth?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  label,
  size = 72,
  strokeWidth = 6,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const displayScore = score !== null && score !== undefined ? Math.round(score) : null;

  // Lighthouse score color bands
  const getColor = (val: number | null) => {
    if (val === null) return '#475569';
    if (val >= 90) return '#10b981'; // Green
    if (val >= 50) return '#f59e0b'; // Orange / Amber
    return '#ef4444'; // Red
  };

  const strokeColor = getColor(displayScore);
  const strokeDashoffset =
    displayScore !== null ? circumference - (displayScore / 100) * circumference : circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} className="gauge-svg">
          {/* Background circle */}
          <circle
            className="gauge-bg"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress meter */}
          <circle
            className="gauge-meter"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke={strokeColor}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Center score text */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.28,
            fontWeight: 800,
            color: strokeColor,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {displayScore !== null ? displayScore : '—'}
        </div>
      </div>

      <span
        style={{
          fontSize: '0.725rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: size + 16,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </span>
    </div>
  );
};
