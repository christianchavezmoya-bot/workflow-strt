#!/usr/bin/env node
/**
 * READ-ONLY. Lists stale hashed frontend assets in the production web bucket, judged by what the
 * LIVE site actually references (see scripts/lib/stale-assets.mjs). Deletes nothing and has no
 * delete mode. (Deletion lives in `deploy-prod-web.mjs cleanup --apply`, which requires an
 * explicit --expect-count.)
 *
 *   node scripts/prod-web-stale-assets.mjs [--out stale.json]
 * Exit code: 0 = cleanup would be SAFE; 1 = unsafe / could not verify.
 */
import { writeFileSync } from "node:fs";
import { PROD_WEB } from "./lib/prod-web-target.mjs";
import { analyzeLiveAssets, fetchLiveManifest } from "./lib/prod-web-ops.mjs";

const outIdx = process.argv.indexOf("--out");
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null;

const manifest = await fetchLiveManifest();
const a = await analyzeLiveAssets();

console.log(`bucket:                     ${PROD_WEB.bucket}`);
console.log(`live site:                  ${PROD_WEB.siteUrl}  (buildSha ${String(manifest.buildSha).slice(0, 10)}, profile ${manifest.profile})`);
console.log(`objects under assets/:      ${a.assetKeys.length}`);
console.log(`index.html references:      ${a.indexRefs} asset(s) directly`);
console.log(`referenced (transitive):    ${a.referenced.size}`);
console.log(`STALE (unreferenced):       ${a.stale.length}`);
console.log(`unreadable referenced:      ${a.unreadable.length}`);
console.log(`cleanup verdict:            ${a.safe ? "SAFE" : "UNSAFE"}`);
for (const p of a.verdict.problems) console.log(`  - ${p}`);
if (outFile) {
  writeFileSync(outFile, JSON.stringify({ bucket: PROD_WEB.bucket, generatedAt: new Date().toISOString(), buildSha: manifest.buildSha, stale: a.stale }, null, 2));
  console.log(`stale list written to:      ${outFile}`);
}
process.exit(a.safe ? 0 : 1);
