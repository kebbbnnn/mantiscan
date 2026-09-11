/**
 * Pure scheduling calculation service for Mantiscan.
 * Computes deterministic next execution epoch timestamps in UTC.
 */

/**
 * Calculates the next Unix epoch timestamp (in seconds) for a recurring audit.
 *
 * @param intervalDays Number of days between audits (e.g. 1, 7, 14, 30). Clamped to >= 1.
 * @param targetHourUtc The hour of the day in UTC (0 - 23) when the audit should run.
 * @param now Reference date (defaults to current system time).
 * @returns Unix timestamp in seconds for the next audit.
 */
export function calculateNextAuditAt(
  intervalDays?: number | null,
  targetHourUtc?: number | null,
  now: Date = new Date()
): number {
  const rawInterval = intervalDays === undefined || intervalDays === null ? 7 : intervalDays;
  const safeInterval = Math.max(1, Math.floor(rawInterval));
  const rawHour = targetHourUtc === undefined || targetHourUtc === null ? 0 : targetHourUtc;
  const safeHour = Math.max(0, Math.min(23, Math.floor(rawHour)));

  // Target candidate for the current calendar day at targetHourUtc:00:00.000 UTC
  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      safeHour,
      0,
      0,
      0
    )
  );

  // If the candidate target on today has already elapsed (or is right now),
  // advance forward by the recurrence interval
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + safeInterval);
  }

  return Math.floor(target.getTime() / 1000);
}
