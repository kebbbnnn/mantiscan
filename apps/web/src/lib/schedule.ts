/**
 * Schedule and timezone formatting utilities for Mantiscan frontend
 */

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Converts a UTC hour (0-23) to the user's local hour (0-23)
 */
export function utcHourToLocal(utcHour: number): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.getHours();
}

/**
 * Converts a local hour (0-23) to UTC hour (0-23)
 */
export function localHourToUtc(localHour: number): number {
  const d = new Date();
  d.setHours(localHour, 0, 0, 0);
  return d.getUTCHours();
}

/**
 * Formats a 24-hour integer into a readable 12-hour format (e.g. 2 -> "2:00 AM", 14 -> "2:00 PM")
 */
export function formatHour(hour24: number): string {
  const safeHour = ((hour24 % 24) + 24) % 24;
  const period = safeHour >= 12 ? 'PM' : 'AM';
  const hour12 = safeHour % 12 === 0 ? 12 : safeHour % 12;
  return `${hour12}:00 ${period}`;
}

/**
 * Returns a human-friendly cadence name for interval in days
 */
export function getIntervalName(days: number): string {
  switch (days) {
    case 1:
      return 'Daily';
    case 7:
      return 'Weekly';
    case 14:
      return 'Bi-weekly';
    case 30:
      return 'Monthly';
    default:
      return `Every ${days} days`;
  }
}

/**
 * Formats a schedule badge string (e.g. "Weekly @ 2:00 AM")
 */
export function formatScheduleSummary(intervalDays: number, hourUtc: number): string {
  const localHour = utcHourToLocal(hourUtc);
  const intervalName = getIntervalName(intervalDays);
  return `${intervalName} @ ${formatHour(localHour)}`;
}

/**
 * Formats next audit relative countdown (e.g. "In 3 days", "Due now")
 */
export function formatNextRunCountdown(nextAuditAt: number | null | undefined): string {
  if (!nextAuditAt) return 'Not scheduled';
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = nextAuditAt - nowSec;

  if (diffSec <= 0) {
    return 'Due now';
  }
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `In ${mins}m`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `In ${hours}h`;
  }
  const days = Math.round(diffSec / 86400);
  return `In ${days}d`;
}
