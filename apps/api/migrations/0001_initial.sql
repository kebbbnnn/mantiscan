-- Initial D1 Migration for Mantiscan
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  perf_threshold INTEGER NOT NULL DEFAULT 90,
  a11y_threshold INTEGER NOT NULL DEFAULT 90,
  best_practices_threshold INTEGER NOT NULL DEFAULT 85,
  seo_threshold INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'unknown',
  next_audit_at INTEGER NOT NULL,
  last_audited_at INTEGER,
  last_run_status TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sites_next_audit ON sites(next_audit_at, status);

CREATE TABLE IF NOT EXISTS audit_runs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,
  strategy TEXT NOT NULL,
  performance_score INTEGER NOT NULL,
  accessibility_score INTEGER NOT NULL,
  best_practices_score INTEGER NOT NULL,
  seo_score INTEGER NOT NULL,
  lcp_ms INTEGER,
  cls REAL,
  inp_ms INTEGER,
  report_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_site_id ON audit_runs(site_id, created_at);

CREATE TABLE IF NOT EXISTS alert_channels (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_logs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id TEXT,
  alert_type TEXT NOT NULL,
  payload_summary TEXT,
  dispatched_at INTEGER NOT NULL
);
