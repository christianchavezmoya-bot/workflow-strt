/**
 * Short codes the user can read out over the phone, e.g. FR-7QK2M4.
 *
 * The alphabet drops the vowels (A E I O U and Y) so a code can never spell a word, and
 * the glyphs that get confused when written in a field notebook: 0 and O, 1 and I and L.
 *
 * Must stay in step with FaultReportsController.ReferenceAlphabet on the server, which
 * validates codes the client generated.
 */

const ALPHABET = "23456789BCDFGHJKMNPQRSTVWXZ";
const CODE_LENGTH = 6;

function randomIndexes(count: number): number[] {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(count);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b % ALPHABET.length);
  }
  return Array.from({ length: count }, () => Math.floor(Math.random() * ALPHABET.length));
}

export function generateFaultReferenceCode(): string {
  const body = randomIndexes(CODE_LENGTH)
    .map((i) => ALPHABET[i])
    .join("");
  return `FR-${body}`;
}

/** Accepts what a user typed or pasted; returns the canonical code, or null. */
export function normalizeFaultReferenceCode(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Only treat a leading FR as the prefix when a separator follows it: F and R are both
  // valid body characters, so "FR-FR2345" must keep its body intact.
  const hadPrefix = /^\s*FR[-\s_]/i.test(raw);
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = hadPrefix ? cleaned.slice(2) : cleaned;

  if (body.length < 4 || body.length > 12) return null;
  if (![...body].every((ch) => ALPHABET.includes(ch))) return null;
  return `FR-${body}`;
}
