/**
 * Safely extracts a human-readable string error message from any error,
 * including standard Error instances, Supabase/PostgREST error objects,
 * strings, and network exceptions.
 * Guarantees that "[object Object]" is never returned.
 */
export function formatErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
      if (typeof obj.details === 'string' && obj.details.trim().length > 0) {
        return `${obj.message} (${obj.details})`;
      }
      return obj.message;
    }
    if (typeof obj.details === 'string' && obj.details.trim().length > 0) {
      return obj.details;
    }
    if (typeof obj.hint === 'string' && obj.hint.trim().length > 0) {
      return obj.hint;
    }
    if (typeof obj.error_description === 'string' && obj.error_description.trim().length > 0) {
      return obj.error_description;
    }
    try {
      const json = JSON.stringify(err);
      if (json !== '{}') return json;
    } catch {
      // Fallback
    }
  }

  return String(err);
}
