import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const sites = sqliteTable(
  'sites',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    perfThreshold: integer('perf_threshold').notNull().default(90),
    a11yThreshold: integer('a11y_threshold').notNull().default(90),
    bestPracticesThreshold: integer('best_practices_threshold').notNull().default(85),
    seoThreshold: integer('seo_threshold').notNull().default(90),
    lcpThresholdMs: integer('lcp_threshold_ms').notNull().default(2500),
    clsThreshold: real('cls_threshold').notNull().default(0.1),
    inpThresholdMs: integer('inp_threshold_ms').notNull().default(200),
    status: text('status').$type<'healthy' | 'degraded' | 'pending' | 'unknown'>().notNull().default('unknown'),
    auditIntervalDays: integer('audit_interval_days').notNull().default(7),
    auditHourUtc: integer('audit_hour_utc').notNull().default(0),
    nextAuditAt: integer('next_audit_at').notNull(), // unix seconds
    lastAuditedAt: integer('last_audited_at'), // unix seconds
    lastRunStatus: text('last_run_status').$type<'success' | 'failed' | 'running'>(),
    lastScanRequestedAt: integer('last_scan_requested_at'), // unix seconds
    createdAt: integer('created_at').notNull(), // unix seconds
  },
  (table) => ({
    nextAuditIdx: index('idx_sites_next_audit').on(table.nextAuditAt, table.status),
  })
);

export const auditRuns = sqliteTable(
  'audit_runs',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    triggeredBy: text('triggered_by').$type<'cron' | 'manual'>().notNull(),
    strategy: text('strategy').$type<'mobile' | 'desktop'>().notNull(),
    performanceScore: integer('performance_score').notNull(),
    accessibilityScore: integer('accessibility_score').notNull(),
    bestPracticesScore: integer('best_practices_score').notNull(),
    seoScore: integer('seo_score').notNull(),
    lcpMs: integer('lcp_ms'),
    cls: real('cls'),
    inpMs: integer('inp_ms'),
    reportUrl: text('report_url'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    siteRunsIdx: index('idx_audit_runs_site_id').on(table.siteId, table.createdAt),
    siteStrategyRunsIdx: index('idx_audit_runs_lookup').on(table.siteId, table.strategy, table.createdAt),
  })
);

export const alertChannels = sqliteTable('alert_channels', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  type: text('type').$type<'slack' | 'discord'>().notNull(),
  webhookUrl: text('webhook_url').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});

export const alertLogs = sqliteTable('alert_logs', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => auditRuns.id, { onDelete: 'set null' }),
  alertType: text('alert_type').notNull(), // 'degraded' | 'recovered' | 'regression'
  payloadSummary: text('payload_summary'),
  dispatchedAt: integer('dispatched_at').notNull(),
});

export type SiteRow = typeof sites.$inferSelect;
export type InsertSiteRow = typeof sites.$inferInsert;
export type AuditRunRow = typeof auditRuns.$inferSelect;
export type InsertAuditRunRow = typeof auditRuns.$inferInsert;
export type AlertChannelRow = typeof alertChannels.$inferSelect;
export type InsertAlertChannelRow = typeof alertChannels.$inferInsert;
export type AlertLogRow = typeof alertLogs.$inferSelect;
