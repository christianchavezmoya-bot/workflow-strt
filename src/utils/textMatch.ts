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

/** True when every query word starts at least one word in haystack. */
export function matchesWordStart(haystack: string | undefined | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!haystack) return false;
  const queryWords = q.split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return true;
  const nameWords = tokenizeWords(haystack);
  if (nameWords.length === 0) return false;
  return queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)));
}

/** True when any of the haystacks matches via word-start. */
export function anyMatchesWordStart(
  haystacks: Array<string | undefined | null>,
  query: string,
): boolean {
  return haystacks.some((h) => matchesWordStart(h, query));
}
