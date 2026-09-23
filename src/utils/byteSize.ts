/**
 * Exact byte-size helpers for offline storage bookkeeping.
 *
 * mediaStore previously reported a captured file's `size` as the BASE64 STRING length
 * (`data.length` in mediaStore.ts's old writeMedia), which overstates the true binary size by
 * ~33% (base64 encodes 3 bytes as 4 characters, plus up to 2 padding characters). Storage-health
 * figures built on that inflated number would trigger WARNING/HIGH earlier than actually
 * warranted. Every writer must use these helpers (or `Blob.size` directly, which is already
 * exact) instead of a string length.
 */

/**
 * Exact decoded byte length of a base64 string (no data: URL prefix), accounting for padding.
 * Standard formula: floor(len * 3 / 4) minus 1 byte per trailing '=' padding character.
 * Returns 0 for an empty string. Non-base64 characters are not validated — callers pass
 * already-validated base64 payloads (stripped of the `data:...;base64,` prefix upstream).
 */
export function base64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}
