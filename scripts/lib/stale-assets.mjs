/**
 * Decides which hashed frontend assets in a static-site bucket are STALE, from what the deployed
 * site actually references — never from file dates or name patterns.
 *
 * A file is "referenced" if its exact (unique, content-hashed) file name appears in index.html or
 * in any referenced JS/CSS file, transitively. This deliberately over-approximates (a name in a
 * comment counts) so the tool can only ever keep too much, never delete something in use.
 * Everything under assets/ that is not reachable from the entry documents is stale.
 */

const SCANNABLE = /\.(?:js|mjs|css|html)$/i;

/** basename of an object key, e.g. "assets/Foo-abc123.js" -> "Foo-abc123.js" */
export const baseName = (key) => key.slice(key.lastIndexOf("/") + 1);

/**
 * @param {object} args
 * @param {string[]} args.assetKeys       every object key under assets/ in the bucket
 * @param {Record<string,string>} args.entryDocs  entry documents, name -> text (e.g. { "index.html": "..." })
 * @param {(key:string)=>string|null} args.loadAsset  returns the text of an asset, or null if unreadable
 * @returns {{ referenced:Set<string>, stale:string[], unreadable:string[] }}
 */
export function computeStaleAssets({ assetKeys, entryDocs, loadAsset }) {
  const byBase = new Map(assetKeys.map((k) => [baseName(k), k]));
  const referenced = new Set();
  const unreadable = [];
  const queue = [];

  const scan = (text) => {
    for (const [base, key] of byBase) {
      if (!referenced.has(key) && text.includes(base)) {
        referenced.add(key);
        queue.push(key);
      }
    }
  };

  for (const text of Object.values(entryDocs)) scan(text);

  while (queue.length) {
    const key = queue.shift();
    if (!SCANNABLE.test(key)) continue; // images/fonts cannot reference other assets
    const text = loadAsset(key);
    if (text == null) {
      unreadable.push(key);
      continue;
    }
    scan(text);
  }

  const stale = assetKeys.filter((k) => !referenced.has(k)).sort();
  return { referenced, stale, unreadable };
}

/**
 * Safety verdict for deleting `stale`: it must be non-empty-safe, every referenced chunk must have
 * been readable (otherwise we might have missed references), and no entry document or referenced
 * chunk may mention a stale file name (belt and braces over computeStaleAssets).
 */
export function verifyCleanupSafe({ stale, referenced, unreadable, entryDocs, loadAsset }) {
  const problems = [];
  if (unreadable.length) problems.push(`could not read ${unreadable.length} referenced chunk(s): ${unreadable.slice(0, 3).join(", ")}`);
  const texts = [...Object.values(entryDocs), ...[...referenced].filter((k) => SCANNABLE.test(k)).map((k) => loadAsset(k) ?? "")];
  for (const key of stale) {
    const base = baseName(key);
    if (texts.some((t) => t.includes(base))) problems.push(`stale file is referenced by live content: ${key}`);
  }
  return { safe: problems.length === 0, problems };
}

/**
 * Gate for the destructive step: the operator must state exactly how many files they expect to be
 * deleted, and it must equal what the live analysis found. Refuses (nothing deleted) on any mismatch,
 * a missing/garbled value, or a zero count.
 */
export function checkExpectedCount(expectedRaw, actual) {
  const text = expectedRaw == null ? "" : String(expectedRaw).trim();
  if (!/^\d+$/.test(text)) return { ok: false, message: `--expect-count must be a whole number (got ${JSON.stringify(expectedRaw)})` };
  const expected = Number(text);
  if (expected !== actual) return { ok: false, message: `--expect-count ${expected} does not match the ${actual} stale files found — nothing deleted` };
  if (actual === 0) return { ok: false, message: "no stale files to delete" };
  return { ok: true, message: `confirmed ${actual} files` };
}
