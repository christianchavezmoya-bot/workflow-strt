/**
 * Word-start matching for search UIs.
 * "ba" matches "base station" / "bar" / "battle"; "cat" does NOT match "location".
 */

const WORD_SPLIT = /[^a-z0-9]+/i;

export function tokenizeWords(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(WORD_SPLIT)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** True when every query token starts at least one word in haystack (word-start match). */
export function matchesWordStart(haystack: string | undefined | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!haystack) return false;

  // Tokenize query on punctuation as well as spaces so "CAD-0039" → ["cad", "0039"].
  const queryWords = tokenizeWords(q);
  if (queryWords.length === 0) return true;

  const nameWords = tokenizeWords(haystack);
  if (nameWords.length === 0) return false;

  if (queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)))) return true;

  // Compact prefix for tags typed without separators (cad0039 → CAD-0039).
  const compactHaystack = nameWords.join("");
  const compactQuery = q.replace(/[^a-z0-9]/g, "");
  return compactQuery.length > 0 && compactHaystack.startsWith(compactQuery);
}

/** True when any of the haystacks matches via word-start. */
export function anyMatchesWordStart(
  haystacks: Array<string | undefined | null>,
  query: string,
): boolean {
  return haystacks.some((h) => matchesWordStart(h, query));
}
