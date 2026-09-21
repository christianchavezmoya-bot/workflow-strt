#!/usr/bin/env node
/**
 * Production web deploy + stale-asset cleanup for https://www.strata-ngo.com
 * (bucket strata-ngo-web-prod behind CloudFront E1AYVTSTERUCZP — see lib/prod-web-target.mjs).
 *
 * SAFE BY DEFAULT: every mode is a dry run unless --apply is passed.
 *
 *   node scripts/deploy-prod-web.mjs plan                         # preflight + show what would happen
 *   node scripts/deploy-prod-web.mjs deploy  --apply              # upload -> index/manifest -> invalidate -> verify
 *   node scripts/deploy-prod-web.mjs cleanup                      # read-only: list stale assets (live-reference based)
 *   node scripts/deploy-prod-web.mjs cleanup --apply --expect-count N   # delete exactly the N stale assets
 *
 * Why this exists instead of `aws s3 sync --delete` (scripts/deploy-phase-d-aws.sh, step 4):
 *   - that pass uploads index.html, assets and deletions unordered, so index.html can go live before its
 *     chunks exist and old chunks disappear in the same breath;
 *   - it never invalidates CloudFront and predates the www cutover (its distribution is not the live one);
 *   - it has no target verification, artifact verification or dry run.
 * Here: assets first (no delete) -> index.html + build-manifest.json LAST with no-cache headers -> invalidate
 * -> verify live. Cleanup is a separate, later, explicit step so rollback stays instant in between.
 *
 * Preflight (all modes): the pinned bucket/distribution still match AWS; dist/ is a PROD-profile artifact that
 * passes the artifact-isolation checks (incl. BOM to Project); the manifest buildSha equals git HEAD.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROD_WEB } from "./lib/prod-web-target.mjs";
import { checkExpectedCount } from "./lib/stale-assets.mjs";
import { analyzeArtifact } from "./lib/artifact-isolation.mjs";
import { analyzeLiveAssets, aws, awsJson, deleteKeys, fetchLiveManifest, verifyProdTarget } from "./lib/prod-web-ops.mjs";

const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith("--") ? args[0] : "plan";
const apply = args.includes("--apply");
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, flag("--dist") ?? "dist");

const fail = (m) => { console.error(`\n[deploy-prod-web] BLOCKED: ${m}`); process.exit(1); };
const info = (m) => console.log(`[deploy-prod-web] ${m}`);
const step = (m) => console.log(`\n[deploy-prod-web] ── ${m}`);
info(`mode=${mode} ${apply ? "APPLY (will write to AWS)" : "DRY RUN (no writes)"}`);
info(`target: s3://${PROD_WEB.bucket}  ⇢  CloudFront ${PROD_WEB.distributionId}  ⇢  ${PROD_WEB.siteUrl}`);

step("preflight: pinned production target still matches AWS");
const target = verifyProdTarget();
if (!target.ok) fail(`target mismatch — refusing to touch AWS:\n  - ${target.problems.join("\n  - ")}`);
info("bucket policy admits the pinned distribution; distribution has the www aliases and this bucket as origin");

if (mode === "plan" || mode === "deploy") {
  step("preflight: dist/ is a production artifact");
  const art = analyzeArtifact(dist, "prod");
  for (const c of art.checks) console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.id}`);
  if (!art.pass) fail(`artifact isolation failed:\n  - ${art.violations.join("\n  - ")}`);
  const manifest = JSON.parse(readFileSync(resolve(dist, "build-manifest.json"), "utf8"));
  const head = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  if (manifest.buildSha !== head && !args.includes("--allow-sha-mismatch")) {
    fail(`dist was built from ${String(manifest.buildSha).slice(0, 10)} but git HEAD is ${head.slice(0, 10)} — rebuild (npm run build:prod-web) or pass --allow-sha-mismatch`);
  }
  info(`artifact OK: profile=${manifest.profile} api=${manifest.apiBase} bom=${manifest.features?.bomModule ?? "n/a"} sha=${String(manifest.buildSha).slice(0, 10)}`);

  step("upload order");
  const noCache = PROD_WEB.noCacheControl;
  const cmds = [
    ["1. hashed assets (no --delete)", ["s3", "sync", `${dist}/`, `s3://${PROD_WEB.bucket}/`, "--exclude", "index.html", "--exclude", "build-manifest.json"]],
    ["2. index.html LAST, never cached", ["s3", "cp", `${dist}/index.html`, `s3://${PROD_WEB.bucket}/index.html`, "--cache-control", noCache]],
    ["3. build-manifest.json, never cached", ["s3", "cp", `${dist}/build-manifest.json`, `s3://${PROD_WEB.bucket}/build-manifest.json`, "--cache-control", noCache]],
    ["4. invalidate CloudFront", ["cloudfront", "create-invalidation", "--distribution-id", PROD_WEB.distributionId, "--paths", "/*"]],
  ];
  for (const [label, c] of cmds) console.log(`  ${label}\n     aws ${c.join(" ")}`);

  if (mode === "deploy") {
    if (!apply) { info("dry run only — re-run with --apply to perform the deploy"); process.exit(0); }
    step("deploying");
    for (const [label, c] of cmds) { info(label); aws(...c); }
    const inv = awsJson("cloudfront", "list-invalidations", "--distribution-id", PROD_WEB.distributionId, "--query", "InvalidationList.Items[0]");
    info(`invalidation ${inv?.Id} ${inv?.Status}; waiting…`);
    for (let i = 0; i < 40; i++) {
      const s = awsJson("cloudfront", "get-invalidation", "--distribution-id", PROD_WEB.distributionId, "--id", inv.Id, "--query", "Invalidation.Status");
      if (s === "Completed") break;
      await new Promise((r) => setTimeout(r, 8000));
    }
    step("verify live");
    const live = await fetchLiveManifest();
    if (live.buildSha !== manifest.buildSha) fail(`live buildSha ${live.buildSha} != deployed ${manifest.buildSha}`);
    const a = await analyzeLiveAssets();
    info(`live buildSha matches; index.html references ${a.indexRefs} asset(s), all present; ${a.stale.length} stale file(s) from previous builds remain`);
    info("stale files are intentionally NOT deleted here. When satisfied, run: node scripts/deploy-prod-web.mjs cleanup");
  }
  process.exit(0);
}

if (mode === "cleanup") {
  step("analyze what the LIVE site references");
  const a = await analyzeLiveAssets();
  console.log(`  objects under assets/: ${a.assetKeys.length}   referenced: ${a.referenced.size}   STALE: ${a.stale.length}   unreadable: ${a.unreadable.length}`);
  for (const k of a.stale.slice(0, 5)) console.log(`    e.g. ${k}`);
  if (!a.safe) fail(`cleanup is not verifiably safe:\n  - ${a.verdict.problems.join("\n  - ") || "index.html references no assets"}`);
  info("verdict: SAFE — nothing reachable from live index.html mentions a stale file");

  if (!apply) {
    info(`dry run only. To delete exactly these ${a.stale.length} files:  node scripts/deploy-prod-web.mjs cleanup --apply --expect-count ${a.stale.length}`);
    process.exit(0);
  }
  const gate = checkExpectedCount(flag("--expect-count"), a.stale.length);
  if (!gate.ok) fail(gate.message);
  step("deleting stale assets");
  deleteKeys(a.stale);
  const after = await analyzeLiveAssets();
  info(`deleted ${a.stale.length}; stale remaining: ${after.stale.length}`);
  info("bucket is versioned: deleted objects remain recoverable as noncurrent versions (delete markers) until any lifecycle rule expires them");
  process.exit(after.stale.length === 0 ? 0 : 1);
}

fail(`unknown mode "${mode}" (use plan | deploy | cleanup)`);
