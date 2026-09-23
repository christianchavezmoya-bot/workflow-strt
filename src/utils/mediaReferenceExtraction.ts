/**
 * Pure extraction of every stored-media reference path embedded inside a workflow run's
 * stepResultsJson, an issue list's resolutionMedia, or any structurally similar JSON value.
 *
 * This MUST recognize exactly the same shapes mediaStore.ts's resolveUploadValue() already
 * handles (Phase 1C requirement) — kept here as a small, pure, exhaustively-testable sibling
 * rather than duplicated logic inside mediaStore.ts, so project-discard's orphan-prevention
 * cascade (offlineStorageService.ts) can enumerate "every file this run/issue owns" without
 * needing mediaStore's Filesystem/manifest side effects.
 *
 * Recognized shapes (mirrors resolveUploadValue exactly):
 *  - a bare stored-media reference string ("offline-media-ref:kind|mime|path")
 *  - a JSON-encoded array/object string (starts with "[" or "{", OR the field key is
 *    "issuesJson"/"stepResultsJson") containing any of the above, arbitrarily nested
 *  - arrays and plain objects, walked recursively
 *
 * Malformed/unparseable JSON is treated conservatively: extraction returns whatever it could
 * safely determine (never throws), so a caller can never be caused to delete something it
 * failed to fully understand — see mediaReferenceExtraction.test.ts's malformed-input cases.
 */

const MEDIA_REF_PREFIX = "offline-media-ref:";
const JSON_MEDIA_FIELDS = new Set(["issuesJson", "stepResultsJson"]);

function extractPathFromRef(value: string): string | null {
  if (!value.startsWith(MEDIA_REF_PREFIX)) return null;
  const raw = value.slice(MEDIA_REF_PREFIX.length);
  const parts = raw.split("|");
  const path = parts[2];
  return path ? decodeURIComponent(path) : null;
}

function walk(value: unknown, key: string | undefined, out: Set<string>): void {
  if (typeof value === "string") {
    const looksLikeJsonContainer = value.startsWith("[") || value.startsWith("{");
    if (JSON_MEDIA_FIELDS.has(key ?? "") || looksLikeJsonContainer) {
      try {
        const parsed = JSON.parse(value);
        walk(parsed, key, out);
        return;
      } catch {
        return; // not actually JSON despite looking like it — conservatively skip, never guess
      }
    }
    const path = extractPathFromRef(value);
    if (path) out.add(path);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) walk(item, key, out);
    return;
  }

  if (value && typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      walk(entryValue, entryKey, out);
    }
  }
}

/**
 * Every distinct media file path referenced anywhere inside `value` (a parsed object, a raw
 * JSON string, or a bare reference string). Returns an empty array for anything it cannot
 * confidently parse — never throws, never guesses at a path from partial/malformed input.
 */
export function extractMediaReferencePaths(value: unknown, key?: string): string[] {
  const out = new Set<string>();
  try {
    walk(value, key, out);
  } catch {
    return [...out]; // best-effort: return whatever was safely collected before the failure
  }
  return [...out];
}

/** Convenience for the common case: extract from a raw JSON string field (stepResultsJson/issuesJson). */
export function extractMediaReferencePathsFromJsonField(json: string | null | undefined, fieldKey: string): string[] {
  if (!json) return [];
  return extractMediaReferencePaths(json, fieldKey);
}
