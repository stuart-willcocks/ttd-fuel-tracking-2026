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
