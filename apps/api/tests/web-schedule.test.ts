import { describe, it, expect } from 'vitest';
import {
  utcHourToLocal,
  localHourToUtc,
  formatHour,
  getIntervalName,
  formatScheduleSummary,
  formatNextRunCountdown,
} from '../../web/src/lib/schedule.js';

describe('Frontend Schedule & Timezone Utilities', () => {
  it('converts local and UTC hours consistently', () => {
    for (let h = 0; h < 24; h++) {
      const local = utcHourToLocal(h);
      const roundtripUtc = localHourToUtc(local);
      expect(roundtripUtc).toBe(h);
    }
  });

  it('formats 24-hour values into standard 12-hour strings', () => {
    expect(formatHour(0)).toBe('12:00 AM');
    expect(formatHour(2)).toBe('2:00 AM');
    expect(formatHour(11)).toBe('11:00 AM');
    expect(formatHour(12)).toBe('12:00 PM');
    expect(formatHour(14)).toBe('2:00 PM');
    expect(formatHour(23)).toBe('11:00 PM');
  });

  it('maps interval days to clear human names', () => {
    expect(getIntervalName(1)).toBe('Daily');
    expect(getIntervalName(7)).toBe('Weekly');
    expect(getIntervalName(14)).toBe('Bi-weekly');
    expect(getIntervalName(30)).toBe('Monthly');
    expect(getIntervalName(3)).toBe('Every 3 days');
  });

  it('formats schedule summary string', () => {
    const summary = formatScheduleSummary(7, 0);
    expect(summary).toContain('Weekly @');
    expect(summary).toMatch(/AM|PM/);
  });

  it('formats next run relative countdowns accurately', () => {
    const nowSec = Math.floor(Date.now() / 1000);

    expect(formatNextRunCountdown(null)).toBe('Not scheduled');
    expect(formatNextRunCountdown(undefined)).toBe('Not scheduled');
    expect(formatNextRunCountdown(nowSec - 10)).toBe('Due now');
    expect(formatNextRunCountdown(nowSec + 120)).toBe('In 2m');
    expect(formatNextRunCountdown(nowSec + 7200)).toBe('In 2h');
    expect(formatNextRunCountdown(nowSec + 86400 * 4)).toBe('In 4d');
  });
});
