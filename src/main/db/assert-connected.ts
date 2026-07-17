/**
 * Narrow a nullable connection handle to non-null or throw the canonical
 * "Not connected" error. The one home for the
 * `if (!this.pool) throw new Error('Not connected')` guard that every adapter
 * method opened with. Returns the handle so callers can bind it locally:
 *
 *     const db = assertConnected(this.db)
 */
export function assertConnected<T>(conn: T | null | undefined, message = 'Not connected'): NonNullable<T> {
  if (conn == null) throw new Error(message)
  return conn as NonNullable<T>
}
