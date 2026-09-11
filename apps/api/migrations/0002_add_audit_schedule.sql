-- Migration: Add audit interval and target hour to sites table
ALTER TABLE sites ADD COLUMN audit_interval_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE sites ADD COLUMN audit_hour_utc INTEGER NOT NULL DEFAULT 0;
