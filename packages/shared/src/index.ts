export type SiteHealthStatus = 'healthy' | 'degraded' | 'pending' | 'unknown';
export type DeviceStrategy = 'mobile' | 'desktop';
export type ChannelType = 'slack' | 'discord';
export type TriggerSource = 'cron' | 'manual';

export interface AuditScores {
  performance: number; // 0 - 100
  accessibility: number; // 0 - 100
  bestPractices: number; // 0 - 100
  seo: number; // 0 - 100
}

export interface CoreWebVitals {
  lcpMs?: number | null;
  cls?: number | null;
  inpMs?: number | null;
  fcpMs?: number | null;
  ttfbMs?: number | null;
}

export interface AlertChannel {
  id: string;
  siteId: string;
  type: ChannelType;
  webhookUrl: string;
  isActive: boolean;
  createdAt: number;
}

export interface Site {
  id: string;
  name: string;
  url: string;
  perfThreshold: number;
  a11yThreshold: number;
  bestPracticesThreshold: number;
  seoThreshold: number;
  lcpThresholdMs: number;
  clsThreshold: number;
  inpThresholdMs: number;
  status: SiteHealthStatus;
  auditIntervalDays: number;
  auditHourUtc: number;
  nextAuditAt: number;
  lastAuditedAt: number | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  lastScanRequestedAt: number | null;
  createdAt: number;
  channels?: AlertChannel[];
  latestRuns?: AuditRun[];
}

export interface SiteStatusResponse {
  id: string;
  status: SiteHealthStatus;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  lastAuditedAt: number | null;
  lastScanRequestedAt: number | null;
}

export interface AuditRun {
  id: string;
  siteId: string;
  triggeredBy: TriggerSource;
  strategy: DeviceStrategy;
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcpMs?: number | null;
  cls?: number | null;
  inpMs?: number | null;
  reportUrl?: string | null;
  createdAt: number;
}

export interface AuditResultPayload {
  siteId: string;
  strategy: DeviceStrategy;
  triggeredBy: TriggerSource;
  scores: AuditScores;
  metrics: CoreWebVitals;
  reportUrl?: string | null;
  summary?: string | null;
}

export interface CreateSiteInput {
  name: string;
  url: string;
  perfThreshold?: number;
  a11yThreshold?: number;
  bestPracticesThreshold?: number;
  seoThreshold?: number;
  lcpThresholdMs?: number;
  clsThreshold?: number;
  inpThresholdMs?: number;
  auditIntervalDays?: number;
  auditHourUtc?: number;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
}

export interface UpdateSiteInput {
  name?: string;
  url?: string;
  perfThreshold?: number;
  a11yThreshold?: number;
  bestPracticesThreshold?: number;
  seoThreshold?: number;
  lcpThresholdMs?: number;
  clsThreshold?: number;
  inpThresholdMs?: number;
  auditIntervalDays?: number;
  auditHourUtc?: number;
}

export const AUDIT_INTERVAL_PRESETS = [
  { label: 'Daily', value: 1, description: 'Every 24 hours' },
  { label: 'Every 3 days', value: 3, description: 'Every 3 days' },
  { label: 'Weekly (7 days)', value: 7, description: 'Every 7 days' },
  { label: 'Bi-weekly (14 days)', value: 14, description: 'Every 14 days' },
  { label: 'Monthly (30 days)', value: 30, description: 'Every 30 days' },
] as const;

export const DEFAULT_THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  bestPractices: 85,
  seo: 90,
  lcpMs: 2500,
  cls: 0.1,
  inpMs: 200,
} as const;

export const DEFAULT_SCHEDULE = {
  intervalDays: 7,
  hourUtc: 0,
} as const;

export const REGRESSION_DELTA_THRESHOLD = 10;

export const AUDIT_COOLDOWN_SECONDS = 300; // 5 minutes
export const AUDIT_RUNNING_TIMEOUT_SECONDS = 600; // 10 minutes

export interface CooldownStatus {
  canScan: boolean;
  remainingSeconds: number;
  reason: 'none' | 'cooldown' | 'running';
}

export function getAuditCooldownStatus(
  site: { lastScanRequestedAt?: number | null; lastRunStatus?: string | null },
  nowSeconds: number = Math.floor(Date.now() / 1000)
): CooldownStatus {
  const elapsed = site.lastScanRequestedAt !== null && site.lastScanRequestedAt !== undefined
    ? Math.max(0, nowSeconds - site.lastScanRequestedAt)
    : Infinity;

  // Self-healing check: if marked running for >= 10 minutes, treat as expired
  const isActivelyRunning = site.lastRunStatus === 'running' && elapsed < AUDIT_RUNNING_TIMEOUT_SECONDS;
  if (isActivelyRunning) {
    const remaining = Math.max(1, AUDIT_COOLDOWN_SECONDS - elapsed);
    return { canScan: false, remainingSeconds: remaining, reason: 'running' };
  }

  // Cooldown check: must be at least 5 minutes since last request
  if (elapsed < AUDIT_COOLDOWN_SECONDS) {
    return { canScan: false, remainingSeconds: AUDIT_COOLDOWN_SECONDS - elapsed, reason: 'cooldown' };
  }

  return { canScan: true, remainingSeconds: 0, reason: 'none' };
}
