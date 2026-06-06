/**
 * Parse a YYYY-MM-DD date string as LOCAL time (not UTC).
 *
 * The Problem:
 *   new Date('2026-06-01') → parsed as 2026-06-01T00:00:00Z (UTC midnight)
 *   In UTC+5:30 that becomes May 31st 18:30 local time → wrong month!
 *
 * The Fix:
 *   new Date('2026-06-01T00:00:00') → parsed as local midnight → correct month
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // If already has time component, use as-is
  if (dateStr.includes('T')) return new Date(dateStr);
  // Append T00:00:00 to force local time interpretation
  return new Date(dateStr + 'T00:00:00');
}

/** Get YYYY-MM-DD string from a Date in local time */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function advanceDateByFrequency(dateStr: string, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string {
  const date = parseLocalDate(dateStr);
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    const originalDay = date.getDate();
    date.setMonth(date.getMonth() + 1);
    if (date.getDate() !== originalDay) {
      date.setDate(0);
    }
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return toLocalDateString(date);
}

