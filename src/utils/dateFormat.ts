/**
 * Formats a timestamp into human-friendly format: YYYY-MM-DD HH:mm:ss
 */
export function formatHumanTimestamp(val?: string | null): string {
  if (!val) return '—';

  // If it's already in YYYY-MM-DD HH:mm:ss format
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
    return val;
  }

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val).replace('T', ' ').substring(0, 19);
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(val);
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats timestamp to match original app screenshot:
 * e.g. "Fri 16 Aug 2024 at 11:30"
 */
export function formatOldAppTimestamp(val?: string | null): string {
  if (!val) return '—';

  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val);
    }
    const dayName = DAYS[d.getDay()];
    const dateNum = d.getDate();
    const monthName = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${dayName} ${dateNum} ${monthName} ${year} at ${time}`;
  } catch {
    return String(val);
  }
}
