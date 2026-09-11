import { describe, it, expect } from 'vitest';
import { calculateNextAuditAt } from '../src/services/schedule.js';

describe('Audit Schedule Calculation Engine', () => {
  it('schedules for later today if the target hour is still in the future', () => {
    // Current time: 2026-09-11 02:00:00 UTC
    const now = new Date(Date.UTC(2026, 8, 11, 2, 0, 0));
    // Target hour: 05:00 UTC, interval: 7 days
    const nextAudit = calculateNextAuditAt(7, 5, now);

    const expected = Math.floor(Date.UTC(2026, 8, 11, 5, 0, 0) / 1000);
    expect(nextAudit).toBe(expected);
  });

  it('advances by interval days if the target hour has already passed today', () => {
    // Current time: 2026-09-11 10:00:00 UTC
    const now = new Date(Date.UTC(2026, 8, 11, 10, 0, 0));
    // Target hour: 02:00 UTC, interval: 7 days
    const nextAudit = calculateNextAuditAt(7, 2, now);

    // Expected: 2026-09-18 02:00:00 UTC
    const expected = Math.floor(Date.UTC(2026, 8, 18, 2, 0, 0) / 1000);
    expect(nextAudit).toBe(expected);
  });

  it('advances by interval days if current time exactly matches target hour', () => {
    // Current time: 2026-09-11 02:00:00.000 UTC
    const now = new Date(Date.UTC(2026, 8, 11, 2, 0, 0));
    const nextAudit = calculateNextAuditAt(1, 2, now);

    // Expected: 2026-09-12 02:00:00 UTC (daily)
    const expected = Math.floor(Date.UTC(2026, 8, 12, 2, 0, 0) / 1000);
    expect(nextAudit).toBe(expected);
  });

  it('handles monthly 30-day interval across month boundaries', () => {
    // Current time: 2026-01-15 08:00:00 UTC
    const now = new Date(Date.UTC(2026, 0, 15, 8, 0, 0));
    // Target hour: 04:00 UTC (past today), interval: 30 days
    const nextAudit = calculateNextAuditAt(30, 4, now);

    // 15 + 30 days = Feb 14
    const expected = Math.floor(Date.UTC(2026, 1, 14, 4, 0, 0) / 1000);
    expect(nextAudit).toBe(expected);
  });

  it('handles leap year boundaries correctly', () => {
    // 2024 is a leap year (Feb 29 exists)
    // Current time: 2024-02-25 12:00:00 UTC
    const now = new Date(Date.UTC(2024, 1, 25, 12, 0, 0));
    // Target hour: 06:00 UTC, interval: 7 days
    const nextAudit = calculateNextAuditAt(7, 6, now);

    // Feb 25 + 7 days in leap year = March 3, 2024
    const expected = Math.floor(Date.UTC(2024, 2, 3, 6, 0, 0) / 1000);
    expect(nextAudit).toBe(expected);
  });

  it('safely clamps out-of-range hours and non-positive intervals', () => {
    const now = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));

    // Hour 99 clamped to 23 (which is still in the future for today 12:00)
    const nextWithHour99 = calculateNextAuditAt(7, 99, now);
    expect(nextWithHour99).toBe(Math.floor(Date.UTC(2026, 8, 11, 23, 0, 0) / 1000));

    // Interval 0 clamped to minimum 1 day
    const nextWithInterval0 = calculateNextAuditAt(0, 5, now);
    expect(nextWithInterval0).toBe(Math.floor(Date.UTC(2026, 8, 12, 5, 0, 0) / 1000));
  });
});
