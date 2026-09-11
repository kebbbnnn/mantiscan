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
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
}

export const DEFAULT_THRESHOLDS = {
  performance: 90,
  accessibility: 90,
  bestPractices: 85,
  seo: 90,
} as const;

export const REGRESSION_DELTA_THRESHOLD = 10;
