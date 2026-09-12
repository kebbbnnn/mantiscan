-- Migration: Add Core Web Vitals alerting thresholds to sites table
ALTER TABLE sites ADD COLUMN lcp_threshold_ms INTEGER NOT NULL DEFAULT 2500;
ALTER TABLE sites ADD COLUMN cls_threshold REAL NOT NULL DEFAULT 0.1;
ALTER TABLE sites ADD COLUMN inp_threshold_ms INTEGER NOT NULL DEFAULT 200;
