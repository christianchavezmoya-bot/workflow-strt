/**
 * Side-effecting helpers (aws CLI + live HTTPS) shared by the production web tools. The decision
 * logic lives in pure, unit-tested modules (stale-assets.mjs, prod-web-target.mjs); this file only
 * moves data. Nothing here writes to AWS except the explicit functions at the bottom.
 */
import { execFileSync } from "node:child_process";
import { PROD_WEB, verifyTarget } from "./prod-web-target.mjs";
import { computeStaleAssets, verifyCleanupSafe } from "./stale-assets.mjs";

export const awsJson = (...a) =>
  JSON.parse(execFileSync("aws", [...a, "--profile", PROD_WEB.profile, "--region", PROD_WEB.region, "--output", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) || "null");

/** READ-ONLY: confirm what AWS reports still matches the pinned production target. */
export function verifyProdTarget() {
  const distribution = awsJson("cloudfront", "get-distribution", "--id", PROD_WEB.distributionId, "--query", "Distribution.DistributionConfig");
  const policy = awsJson("s3api", "get-bucket-policy", "--bucket", PROD_WEB.bucket, "--query", "Policy");
  return verifyTarget({ distribution, bucketPolicy: policy });
}

const get = async (path) => {
  const res = await fetch(`${PROD_WEB.siteUrl}/${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.text();
};
export const fetchLiveManifest = async () => JSON.parse(await get("build-manifest.json"));

/** READ-ONLY: what the LIVE site references vs what the bucket holds. */
export async function analyzeLiveAssets() {
  const listing = awsJson("s3api", "list-objects-v2", "--bucket", PROD_WEB.bucket, "--prefix", "assets/", "--query", "Contents[].Key");
  const assetKeys = (listing ?? []).filter((k) => !k.endsWith("/"));
  const entryDocs = { "index.html": await get("index.html") };
  const loaded = new Map();
  for (let round = 0; round < 50; round++) {
    const { referenced } = computeStaleAssets({ assetKeys, entryDocs, loadAsset: (k) => loaded.get(k) ?? null });
    const missing = [...referenced].filter((k) => /\.(?:js|mjs|css)$/i.test(k) && !loaded.has(k));
    if (missing.length === 0) break;
    await Promise.all(missing.map(async (k) => { try { loaded.set(k, await get(k)); } catch { /* reported as unreadable */ } }));
    if (missing.every((k) => !loaded.has(k))) break;
  }
  const loadAsset = (k) => loaded.get(k) ?? null;
  const result = computeStaleAssets({ assetKeys, entryDocs, loadAsset });
  const verdict = verifyCleanupSafe({ ...result, entryDocs, loadAsset });
  const indexRefs = [...result.referenced].filter((k) => entryDocs["index.html"].includes(k.slice(k.lastIndexOf("/") + 1))).length;
  return { assetKeys, ...result, verdict, indexRefs, safe: verdict.safe && indexRefs >= 1 };
}

// ── WRITES (only reachable through --apply in deploy-prod-web.mjs) ─────────────────────────

export const aws = (...a) => execFileSync("aws", [...a, "--profile", PROD_WEB.profile, "--region", PROD_WEB.region], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

/** Deletes keys in batches of 1000 with delete-objects. In a versioned bucket this only adds delete markers. */
export function deleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true };
    const out = awsJson("s3api", "delete-objects", "--bucket", PROD_WEB.bucket, "--delete", JSON.stringify(batch));
    if (out?.Errors?.length) throw new Error(`delete-objects reported ${out.Errors.length} error(s): ${JSON.stringify(out.Errors[0])}`);
  }
}
