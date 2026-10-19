const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Formats timestamps for the PDA app:
 * e.g. "Thu 2 July 2026 at 12:24"
 */
export function formatPdaTimestamp(val?: string | null): string {
  if (!val) return '—';

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val);
    }
    const dayName = DAYS[d.getDay()];
    const dateNum = d.getDate();
    const monthName = FULL_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${dayName} ${dateNum} ${monthName} ${year} at ${time}`;
  } catch {
    return String(val);
  }
}

/**
 * Formats timestamps for the Admin app:
 * e.g. "ddd YYYY-MM-DD HH:mm:ss" -> "Thu 2026-07-02 12:24:00"
 */
export function formatAdminTimestamp(val?: string | null): string {
  if (!val) return '—';

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val);
    }
    const dayName = DAYS[d.getDay()];
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const date = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    return `${dayName} ${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(val);
  }
}

// Aliases for compatibility
export const formatOldAppTimestamp = formatPdaTimestamp;
export const formatHumanTimestamp = formatAdminTimestamp;
