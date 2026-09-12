-- Migration: Add last_scan_requested_at timestamp to sites table for audit rate-limiting and cooldown
ALTER TABLE sites ADD COLUMN last_scan_requested_at INTEGER;
