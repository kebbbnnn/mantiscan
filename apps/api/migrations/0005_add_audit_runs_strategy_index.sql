-- Migration 0005: Add composite index on audit_runs for fast site/strategy/created_at lookups
CREATE INDEX IF NOT EXISTS idx_audit_runs_lookup ON audit_runs(site_id, strategy, created_at);
