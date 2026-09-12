import React, { useState, useMemo, useRef } from 'react';
import type { Site, AuditRun, DeviceStrategy } from '@mantiscan/shared';
import { TrendingUp, Activity, ExternalLink, Zap, Clock, Info } from 'lucide-react';

interface SiteTrendChartProps {
  runs: AuditRun[];
  site: Site;
  strategy: DeviceStrategy;
}

type MetricMode = 'scores' | 'vitals';
type CategoryKey = 'performance' | 'accessibility' | 'bestPractices' | 'seo';
type VitalKey = 'lcp' | 'cls' | 'inp';

interface CategoryConfig {
  key: CategoryKey;
  label: string;
  color: string;
  getValue: (run: AuditRun) => number;
}

interface VitalConfig {
  key: VitalKey;
  label: string;
  unit: string;
  color: string;
  goodThreshold: number;
  goodLabel: string;
  maxScale: number;
  formatValue: (val: number | null | undefined) => string;
  getValue: (run: AuditRun) => number | null;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'performance',
    label: 'Performance',
    color: '#10b981', // Mantis green
    getValue: (r) => r.performanceScore,
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    color: '#3b82f6', // Blue
    getValue: (r) => r.accessibilityScore,
  },
  {
    key: 'bestPractices',
    label: 'Best Practices',
    color: '#a855f7', // Purple
    getValue: (r) => r.bestPracticesScore,
  },
  {
    key: 'seo',
    label: 'SEO',
    color: '#f59e0b', // Amber
    getValue: (r) => r.seoScore,
  },
];

const VITALS: VitalConfig[] = [
  {
    key: 'lcp',
    label: 'LCP (Largest Contentful Paint)',
    unit: 's',
    color: '#06b6d4',
    goodThreshold: 2.5,
    goodLabel: 'Good (≤ 2.5s)',
    maxScale: 5.0,
    formatValue: (val) => (val !== null && val !== undefined ? `${val.toFixed(2)}s` : '—'),
    getValue: (r) => (r.lcpMs !== null && r.lcpMs !== undefined ? r.lcpMs / 1000 : null),
  },
  {
    key: 'cls',
    label: 'CLS (Cumulative Layout Shift)',
    unit: '',
    color: '#ec4899',
    goodThreshold: 0.1,
    goodLabel: 'Good (≤ 0.10)',
    maxScale: 0.5,
    formatValue: (val) => (val !== null && val !== undefined ? val.toFixed(3) : '—'),
    getValue: (r) => (r.cls !== null && r.cls !== undefined ? r.cls : null),
  },
  {
    key: 'inp',
    label: 'INP (Interaction to Next Paint)',
    unit: 'ms',
    color: '#eab308',
    goodThreshold: 200,
    goodLabel: 'Good (≤ 200ms)',
    maxScale: 500,
    formatValue: (val) => (val !== null && val !== undefined ? `${Math.round(val)}ms` : '—'),
    getValue: (r) => (r.inpMs !== null && r.inpMs !== undefined ? r.inpMs : null),
  },
];

const SVG_WIDTH = 640;
const SVG_HEIGHT = 220;
const MARGIN_LEFT = 44;
const MARGIN_RIGHT = 24;
const MARGIN_TOP = 24;
const MARGIN_BOTTOM = 32;

const PLOT_WIDTH = SVG_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

// Build smooth cubic bezier spline path
function buildSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export const SiteTrendChart: React.FC<SiteTrendChartProps> = ({ runs, site, strategy }) => {
  const [mode, setMode] = useState<MetricMode>('scores');
  const [activeCategories, setActiveCategories] = useState<Record<CategoryKey, boolean>>({
    performance: true,
    accessibility: true,
    bestPractices: true,
    seo: true,
  });
  const [selectedVital, setSelectedVital] = useState<VitalKey>('lcp');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Take the most recent 20 runs matching strategy and order chronologically (left = oldest, right = newest)
  const chronologicalRuns = useMemo(() => {
    return [...runs].slice(0, 20).reverse();
  }, [runs]);

  const numPoints = chronologicalRuns.length;

  // Toggle individual category lines
  const toggleCategory = (cat: CategoryKey) => {
    setActiveCategories((prev) => {
      // Don't allow deselecting all categories
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (prev[cat] && activeCount <= 1) return prev;
      return { ...prev, [cat]: !prev[cat] };
    });
  };

  // Helper to map index to X coordinate
  const getXCoord = (index: number): number => {
    if (numPoints <= 1) return MARGIN_LEFT + PLOT_WIDTH / 2;
    return MARGIN_LEFT + (index / (numPoints - 1)) * PLOT_WIDTH;
  };

  // Helper to map score (0-100) to Y coordinate
  const getScoreYCoord = (score: number): number => {
    const clamped = Math.max(0, Math.min(100, score));
    return MARGIN_TOP + (1 - clamped / 100) * PLOT_HEIGHT;
  };

  // Helper to map vital value to Y coordinate
  const getVitalYCoord = (val: number, maxScale: number): number => {
    const clamped = Math.max(0, Math.min(maxScale, val));
    return MARGIN_TOP + (1 - clamped / maxScale) * PLOT_HEIGHT;
  };

  // Handle pointer hover across the SVG to snap to closest run index
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (numPoints === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normalizedSvgX = (clientX / rect.width) * SVG_WIDTH;

    if (numPoints === 1) {
      setHoveredIndex(0);
      return;
    }

    const relX = Math.max(0, Math.min(PLOT_WIDTH, normalizedSvgX - MARGIN_LEFT));
    const rawIndex = (relX / PLOT_WIDTH) * (numPoints - 1);
    const closestIndex = Math.max(0, Math.min(numPoints - 1, Math.round(rawIndex)));
    setHoveredIndex(closestIndex);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  if (numPoints === 0) {
    return null;
  }

  const currentVitalConfig = VITALS.find((v) => v.key === selectedVital)!;
  const hoveredRun = hoveredIndex !== null ? chronologicalRuns[hoveredIndex] : null;
  const previousRun = hoveredIndex !== null && hoveredIndex > 0 ? chronologicalRuns[hoveredIndex - 1] : null;

  return (
    <div
      ref={containerRef}
      style={{
        marginBottom: '24px',
        padding: '18px 20px',
        background: 'rgba(0, 0, 0, 0.28)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Chart Header: Title, Strategy Badge, Mode Switcher */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={16} color="var(--accent-mantis)" />
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Historical Scan Trends ({strategy})
          </h4>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 255, 255, 0.07)',
              color: 'var(--text-secondary)',
            }}
          >
            {numPoints} {numPoints === 1 ? 'audit' : 'audits'} plotted
          </span>
        </div>

        {/* View Mode Toggle: Scores vs Web Vitals */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '3px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('scores')}
            style={{
              background: mode === 'scores' ? 'var(--accent-mantis)' : 'transparent',
              color: mode === 'scores' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease',
            }}
          >
            <Activity size={12} />
            Scores (0–100)
          </button>
          <button
            type="button"
            onClick={() => setMode('vitals')}
            style={{
              background: mode === 'vitals' ? 'var(--accent-mantis)' : 'transparent',
              color: mode === 'vitals' ? '#ffffff' : 'var(--text-secondary)',
              border: 'none',
              padding: '4px 10px',
              borderRadius: '5px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease',
            }}
          >
            <Zap size={12} />
            Web Vitals
          </button>
        </div>
      </div>

      {/* Series Filters */}
      {mode === 'scores' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Series:</span>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategories[cat.key];
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 9px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${isActive ? cat.color : 'var(--border-subtle)'}`,
                  background: isActive ? `${cat.color}22` : 'rgba(255, 255, 255, 0.02)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isActive ? cat.color : 'var(--text-muted)',
                  }}
                />
                {cat.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Metric:</span>
          {VITALS.map((vital) => {
            const isSelected = selectedVital === vital.key;
            return (
              <button
                key={vital.key}
                type="button"
                onClick={() => setSelectedVital(vital.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 9px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${isSelected ? vital.color : 'var(--border-subtle)'}`,
                  background: isSelected ? `${vital.color}22` : 'rgba(255, 255, 255, 0.02)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isSelected ? vital.color : 'var(--text-muted)',
                  }}
                />
                {vital.label}
              </button>
            );
          })}
        </div>
      )}

      {/* SVG Canvas Container with Relative Tooltip Positioning */}
      <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Performance gradient area fill */}
            <linearGradient id="mantisTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            {/* Vital gradient area fill */}
            <linearGradient id="vitalTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentVitalConfig.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={currentVitalConfig.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {mode === 'scores' ? (
            [100, 75, 50, 25, 0].map((val) => {
              const y = getScoreYCoord(val);
              return (
                <g key={val}>
                  <line
                    x1={MARGIN_LEFT}
                    y1={y}
                    x2={SVG_WIDTH - MARGIN_RIGHT}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="1"
                    strokeDasharray={val === 0 ? 'none' : '4 4'}
                  />
                  <text
                    x={MARGIN_LEFT - 8}
                    y={y + 3.5}
                    fill="var(--text-muted)"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="var(--font-mono)"
                  >
                    {val}
                  </text>
                </g>
              );
            })
          ) : (
            [1, 0.75, 0.5, 0.25, 0].map((ratio) => {
              const val = currentVitalConfig.maxScale * ratio;
              const y = MARGIN_TOP + (1 - ratio) * PLOT_HEIGHT;
              return (
                <g key={ratio}>
                  <line
                    x1={MARGIN_LEFT}
                    y1={y}
                    x2={SVG_WIDTH - MARGIN_RIGHT}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.06)"
                    strokeWidth="1"
                    strokeDasharray={ratio === 0 ? 'none' : '4 4'}
                  />
                  <text
                    x={MARGIN_LEFT - 8}
                    y={y + 3.5}
                    fill="var(--text-muted)"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="var(--font-mono)"
                  >
                    {val < 1 && val > 0 ? val.toFixed(2) : Math.round(val)}
                    {currentVitalConfig.unit}
                  </text>
                </g>
              );
            })
          )}

          {/* Reference Line: Site Threshold in Scores Mode */}
          {mode === 'scores' && site.perfThreshold && activeCategories.performance && (
            <g>
              <line
                x1={MARGIN_LEFT}
                y1={getScoreYCoord(site.perfThreshold)}
                x2={SVG_WIDTH - MARGIN_RIGHT}
                y2={getScoreYCoord(site.perfThreshold)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.85"
              />
              <text
                x={SVG_WIDTH - MARGIN_RIGHT - 4}
                y={getScoreYCoord(site.perfThreshold) - 5}
                fill="#ef4444"
                fontSize="9"
                fontWeight="700"
                textAnchor="end"
                fontFamily="var(--font-mono)"
              >
                Threshold ({site.perfThreshold})
              </text>
            </g>
          )}

          {/* Reference Line: Google Good Benchmark in Vitals Mode */}
          {mode === 'vitals' && (
            <g>
              <line
                x1={MARGIN_LEFT}
                y1={getVitalYCoord(currentVitalConfig.goodThreshold, currentVitalConfig.maxScale)}
                x2={SVG_WIDTH - MARGIN_RIGHT}
                y2={getVitalYCoord(currentVitalConfig.goodThreshold, currentVitalConfig.maxScale)}
                stroke="var(--accent-mantis)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.8"
              />
              <text
                x={SVG_WIDTH - MARGIN_RIGHT - 4}
                y={getVitalYCoord(currentVitalConfig.goodThreshold, currentVitalConfig.maxScale) - 5}
                fill="var(--accent-mantis)"
                fontSize="9"
                fontWeight="700"
                textAnchor="end"
                fontFamily="var(--font-mono)"
              >
                {currentVitalConfig.goodLabel}
              </text>
            </g>
          )}

          {/* Category Scores Mode: Lines & Points */}
          {mode === 'scores' &&
            CATEGORIES.map((cat) => {
              if (!activeCategories[cat.key]) return null;

              const points = chronologicalRuns.map((r, i) => ({
                x: getXCoord(i),
                y: getScoreYCoord(cat.getValue(r)),
              }));

              const pathStr = buildSplinePath(points);

              // Area fill for performance
              const isPerf = cat.key === 'performance';
              const areaPathStr =
                isPerf && numPoints > 1
                  ? `${pathStr} L ${points[points.length - 1].x} ${MARGIN_TOP + PLOT_HEIGHT} L ${points[0].x} ${MARGIN_TOP + PLOT_HEIGHT} Z`
                  : '';

              return (
                <g key={cat.key}>
                  {isPerf && numPoints > 1 && <path d={areaPathStr} fill="url(#mantisTrendGrad)" />}
                  {numPoints > 1 && (
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={cat.color}
                      strokeWidth={isPerf ? 2.5 : 1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {points.map((pt, idx) => {
                    const isHovered = hoveredIndex === idx;
                    return (
                      <g key={idx}>
                        {isHovered && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={isPerf ? 7 : 5}
                            fill={cat.color}
                            fillOpacity="0.25"
                            className="animate-pulse"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? (isPerf ? 5 : 4) : isPerf ? 3.5 : 2.5}
                          fill="var(--bg-main)"
                          stroke={cat.color}
                          strokeWidth={isPerf ? 2.5 : 2}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}

          {/* Web Vitals Mode: Line & Points */}
          {mode === 'vitals' && (() => {
            const validPoints: { x: number; y: number; val: number; origIdx: number }[] = [];
            chronologicalRuns.forEach((r, i) => {
              const val = currentVitalConfig.getValue(r);
              if (val !== null && !isNaN(val)) {
                validPoints.push({
                  x: getXCoord(i),
                  y: getVitalYCoord(val, currentVitalConfig.maxScale),
                  val,
                  origIdx: i,
                });
              }
            });

            const pathStr = buildSplinePath(validPoints);
            const areaPathStr =
              validPoints.length > 1
                ? `${pathStr} L ${validPoints[validPoints.length - 1].x} ${MARGIN_TOP + PLOT_HEIGHT} L ${validPoints[0].x} ${MARGIN_TOP + PLOT_HEIGHT} Z`
                : '';

            return (
              <g>
                {validPoints.length > 1 && <path d={areaPathStr} fill="url(#vitalTrendGrad)" />}
                {validPoints.length > 1 && (
                  <path
                    d={pathStr}
                    fill="none"
                    stroke={currentVitalConfig.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {validPoints.map((pt, idx) => {
                  const isHovered = hoveredIndex === pt.origIdx;
                  return (
                    <g key={idx}>
                      {isHovered && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={7}
                          fill={currentVitalConfig.color}
                          fillOpacity="0.25"
                          className="animate-pulse"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 5 : 3.5}
                        fill="var(--bg-main)"
                        stroke={currentVitalConfig.color}
                        strokeWidth={2.5}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Hover Vertical Crosshair */}
          {hoveredIndex !== null && (
            <line
              x1={getXCoord(hoveredIndex)}
              y1={MARGIN_TOP}
              x2={getXCoord(hoveredIndex)}
              y2={MARGIN_TOP + PLOT_HEIGHT}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* X-Axis Date Labels */}
          {chronologicalRuns.map((r, i) => {
            // Only show labels for first, last, and every few runs if many exist
            const showLabel =
              numPoints <= 6 ||
              i === 0 ||
              i === numPoints - 1 ||
              (numPoints > 6 && i % Math.ceil(numPoints / 5) === 0);

            if (!showLabel) return null;

            const date = new Date(r.createdAt * 1000);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;

            return (
              <text
                key={i}
                x={getXCoord(i)}
                y={SVG_HEIGHT - 10}
                fill="var(--text-muted)"
                fontSize="9"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {label}
              </text>
            );
          })}
        </svg>

        {/* Dynamic Glassmorphic Tooltip */}
        {hoveredRun && hoveredIndex !== null && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left:
                getXCoord(hoveredIndex) > SVG_WIDTH * 0.65
                  ? `${(getXCoord(hoveredIndex) / SVG_WIDTH) * 100}%`
                  : `${(getXCoord(hoveredIndex) / SVG_WIDTH) * 100}%`,
              transform:
                getXCoord(hoveredIndex) > SVG_WIDTH * 0.65
                  ? 'translate(-105%, 0)'
                  : 'translate(10px, 0)',
              background: 'rgba(11, 15, 25, 0.92)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              pointerEvents: 'none',
              zIndex: 10,
              minWidth: '170px',
              fontSize: '0.75rem',
            }}
          >
            {/* Header: Date & Trigger Badge */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '6px',
              }}
            >
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                {new Date(hoveredRun.createdAt * 1000).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background:
                    hoveredRun.triggeredBy === 'manual'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(59, 130, 246, 0.15)',
                  color: hoveredRun.triggeredBy === 'manual' ? 'var(--accent-mantis)' : '#60a5fa',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                {hoveredRun.triggeredBy === 'manual' ? <Zap size={9} /> : <Clock size={9} />}
                {hoveredRun.triggeredBy === 'manual' ? 'Manual' : 'Scheduled'}
              </span>
            </div>

            {/* Content: Mode Scores vs Vitals */}
            {mode === 'scores' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {CATEGORIES.map((cat) => {
                  const val = cat.getValue(hoveredRun);
                  const prevVal = previousRun ? cat.getValue(previousRun) : null;
                  const delta = prevVal !== null ? val - prevVal : null;

                  return (
                    <div
                      key={cat.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cat.color }} />
                        {cat.label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {val}
                        {delta !== null && delta !== 0 && (
                          <span
                            style={{
                              marginLeft: '5px',
                              fontSize: '0.6875rem',
                              color: delta > 0 ? 'var(--color-good)' : 'var(--color-poor)',
                            }}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{currentVitalConfig.label}:</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: currentVitalConfig.color,
                    }}
                  >
                    {currentVitalConfig.formatValue(currentVitalConfig.getValue(hoveredRun))}
                  </span>
                </div>
              </div>
            )}

            {/* HTML Report link prompt if available */}
            {hoveredRun.reportUrl && (
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '6px',
                  borderTop: '1px solid var(--border-subtle)',
                  color: 'var(--accent-mantis)',
                  fontSize: '0.6875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ExternalLink size={10} /> Full report available in table
              </div>
            )}
          </div>
        )}
      </div>

      {/* Single-run informational hint */}
      {numPoints === 1 && (
        <div
          style={{
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Info size={13} color="var(--accent-mantis)" />
          <span>
            Only 1 audit run recorded for this strategy. Run another scan to visualize historical score progression.
          </span>
        </div>
      )}
    </div>
  );
};
