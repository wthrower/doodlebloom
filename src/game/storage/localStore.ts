/** Shared localStorage JSON helpers. All persisted JSON goes through these
 *  so parse failures and write failures are handled uniformly. */

/** Read a JSON value, returning `fallback` for missing or corrupt data. */
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Write a JSON value. Failures (QuotaExceededError, Safari private mode) are
 * swallowed: in-memory state is authoritative; the persisted copy goes stale
 * but the app stays up.
 */
export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // best-effort persistence
  }
}
