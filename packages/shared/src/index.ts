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
  status: SiteHealthStatus;
  auditIntervalDays: number;
  auditHourUtc: number;
  nextAuditAt: number;
  lastAuditedAt: number | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  createdAt: number;
  channels?: AlertChannel[];
  latestRuns?: AuditRun[];
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
} as const;

export const DEFAULT_SCHEDULE = {
  intervalDays: 7,
  hourUtc: 0,
} as const;

export const REGRESSION_DELTA_THRESHOLD = 10;
