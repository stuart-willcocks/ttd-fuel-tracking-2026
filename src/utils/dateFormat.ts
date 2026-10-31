/**
 * Safely parses any date representation (ISO UTC, space-separated string, timestamp, or Date)
 * into a valid Date object. Strings without timezone offsets are treated as UTC.
 */
export function parseToDate(val?: string | number | Date | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;

  // If already standard ISO with Z or timezone offset (e.g. 2026-10-21T11:10:00Z or +01:00)
  if (s.endsWith('Z') || /[+-]\d{2}(:?\d{2})?$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // If format is YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss without timezone offset:
  // Timestamps in this database/system are UTC. Treat as UTC by appending 'Z'
  const isoCandidate = s.includes('T') ? s : s.replace(' ', 'T');
  const asUtc = new Date(isoCandidate + 'Z');
  if (!isNaN(asUtc.getTime())) {
    return asUtc;
  }

  // Fallback to standard parse
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

const THREE_LETTER_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats timestamps for the PDA app strictly in UK local time (Europe/London):
 * e.g. "Thu 2 Jul 2026 at 12:24:05"
 * Accurately accounts for British Summer Time (BST / UTC+1) and Greenwich Mean Time (GMT / UTC+0).
 */
export function formatPdaTimestamp(val?: string | number | Date | null): string {
  if (!val) return '—';

  try {
    const d = parseToDate(val);
    if (!d) return String(val);

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const m: Record<string, string> = {};
    for (const p of parts) {
      m[p.type] = p.value;
    }

    const monthIdx = parseInt(m.month || '1', 10) - 1;
    const shortMonth = THREE_LETTER_MONTHS[monthIdx] || (m.month || '').slice(0, 3);

    return `${m.weekday} ${m.day} ${shortMonth} ${m.year} at ${m.hour}:${m.minute}:${m.second}`;
  } catch {
    return String(val);
  }
}

/**
 * Formats timestamps for the Admin portal strictly in UK local time (Europe/London):
 * e.g. "Thu 2026-07-02 12:24:00"
 */
export function formatAdminTimestamp(val?: string | number | Date | null): string {
  if (!val) return '—';

  try {
    const d = parseToDate(val);
    if (!d) return String(val);

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const m: Record<string, string> = {};
    for (const p of parts) {
      m[p.type] = p.value;
    }

    return `${m.weekday} ${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
  } catch {
    return String(val);
  }
}

// Aliases for compatibility
export const formatOldAppTimestamp = formatPdaTimestamp;
export const formatHumanTimestamp = formatAdminTimestamp;
