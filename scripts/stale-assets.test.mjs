import { describe, expect, it } from "vitest";
import { baseName, checkExpectedCount, computeStaleAssets, verifyCleanupSafe } from "./lib/stale-assets.mjs";

const keys = [
  "assets/index-NEW11111.js",
  "assets/chunk-a-AAAA1111.js",
  "assets/chunk-b-BBBB2222.js", // only reachable via chunk-a (transitive)
  "assets/style-CCCC3333.css",
  "assets/logo-DDDD4444.png",
  "assets/index-OLD99999.js", // previous build
  "assets/chunk-a-OLD88888.js",
  "assets/orphan-EEEE5555.css",
];
const files = {
  "assets/index-NEW11111.js": 'import("./chunk-a-AAAA1111.js")',
  "assets/chunk-a-AAAA1111.js": 'const m = ["assets/chunk-b-BBBB2222.js"]',
  "assets/chunk-b-BBBB2222.js": "export default 1",
  "assets/style-CCCC3333.css": "body{background:url(./logo-DDDD4444.png)}",
  "assets/index-OLD99999.js": 'import("./chunk-a-OLD88888.js")',
  "assets/chunk-a-OLD88888.js": "old",
  "assets/orphan-EEEE5555.css": "x",
};
const entryDocs = {
  "index.html": '<script src="/assets/index-NEW11111.js"></script><link href="/assets/style-CCCC3333.css">',
};
const loadAsset = (k) => files[k] ?? null;

describe("computeStaleAssets", () => {
  it("keeps everything reachable from the entry document, including transitive chunks and CSS-referenced images", () => {
    const { referenced } = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset });
    expect([...referenced].sort()).toEqual([
      "assets/chunk-a-AAAA1111.js",
      "assets/chunk-b-BBBB2222.js",
      "assets/index-NEW11111.js",
      "assets/logo-DDDD4444.png",
      "assets/style-CCCC3333.css",
    ]);
  });

  it("marks only unreachable files stale: the previous build and orphans", () => {
    const { stale } = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset });
    expect(stale).toEqual(["assets/chunk-a-OLD88888.js", "assets/index-OLD99999.js", "assets/orphan-EEEE5555.css"]);
  });

  it("is conservative: a file mentioned only in a comment is kept, never deleted", () => {
    const withComment = { ...files, "assets/chunk-b-BBBB2222.js": "// see orphan-EEEE5555.css" };
    const { stale } = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset: (k) => withComment[k] ?? null });
    expect(stale).not.toContain("assets/orphan-EEEE5555.css");
  });

  it("reports unreadable referenced chunks so a cleanup can be refused", () => {
    const result = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset: (k) => (k.includes("chunk-a-AAAA") ? null : files[k] ?? null) });
    expect(result.unreadable).toEqual(["assets/chunk-a-AAAA1111.js"]);
    const verdict = verifyCleanupSafe({ ...result, entryDocs, loadAsset: (k) => (k.includes("chunk-a-AAAA") ? null : files[k] ?? null) });
    expect(verdict.safe).toBe(false);
    expect(verdict.problems[0]).toMatch(/could not read 1 referenced chunk/);
  });

  it("treats an empty entry document as 'nothing referenced' and would call everything stale - the verdict must catch a bad entry doc upstream", () => {
    const { referenced, stale } = computeStaleAssets({ assetKeys: keys, entryDocs: { "index.html": "" }, loadAsset });
    expect(referenced.size).toBe(0);
    expect(stale).toHaveLength(keys.length); // callers must therefore assert index.html references >= 1 asset
  });
});

describe("verifyCleanupSafe", () => {
  it("is safe when nothing referenced mentions a stale file", () => {
    const result = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset });
    expect(verifyCleanupSafe({ ...result, entryDocs, loadAsset })).toEqual({ safe: true, problems: [] });
  });

  it("flags a stale file that live content still mentions (defence in depth)", () => {
    const result = computeStaleAssets({ assetKeys: keys, entryDocs, loadAsset });
    const tainted = (k) => (k === "assets/chunk-b-BBBB2222.js" ? "uses index-OLD99999.js" : files[k] ?? null);
    const verdict = verifyCleanupSafe({ stale: ["assets/index-OLD99999.js"], referenced: result.referenced, unreadable: [], entryDocs, loadAsset: tainted });
    expect(verdict.safe).toBe(false);
    expect(verdict.problems.join()).toMatch(/index-OLD99999\.js/);
  });

  it("baseName strips the key prefix", () => {
    expect(baseName("assets/a/b/c-XYZ.js")).toBe("c-XYZ.js");
  });
});

describe("checkExpectedCount (guard on the destructive step)", () => {
  it("passes only when the stated count equals the live analysis", () => {
    expect(checkExpectedCount("96", 96)).toMatchObject({ ok: true });
    expect(checkExpectedCount(96, 96)).toMatchObject({ ok: true });
  });
  it("refuses a different number, so a changed bucket can never be deleted blind", () => {
    const r = checkExpectedCount("95", 96);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/does not match the 96 stale files found — nothing deleted/);
  });
  it("refuses a missing, empty or garbled value", () => {
    for (const bad of [null, undefined, "", "abc", "9 6", "-1", "96.5", "0x10"]) {
      expect(checkExpectedCount(bad, 96).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("refuses when there is nothing to delete", () => {
    expect(checkExpectedCount("0", 0)).toEqual({ ok: false, message: "no stale files to delete" });
  });
});
