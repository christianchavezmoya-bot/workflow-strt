# Production web deploy and stale-asset cleanup

**Target (verified from evidence, not from older docs):** bucket `strata-ngo-web-prod` behind
CloudFront `E1AYVTSTERUCZP` (aliases `www.strata-ngo.com`, `strata-ngo.com`). Older docs that say `www`
shares the staging distribution `E1YN5XTWDWRHYP` are stale — that distribution now serves
`staging.strata-ngo.com` only. Constants live in `scripts/lib/prod-web-target.mjs`; every run re-verifies
them against AWS and refuses to act on a mismatch.

## Build
`npm run build:prod-web` (= `build-cloud-web.mjs --profile prod`). Production is pinned by the profile:
API `https://api.strata-ngo.com/api`, BOM to Project **on**, verified in the compiled bundle. Never build
the release from a developer's `.env*`; use a clean checkout/worktree.

## Deploy — `node scripts/deploy-prod-web.mjs`
Dry run by default; `--apply` performs writes.

```
node scripts/deploy-prod-web.mjs deploy            # preflight + prints the ordered plan (no writes)
node scripts/deploy-prod-web.mjs deploy --apply
```
Order: hashed assets (no delete) → `index.html` **last** and `build-manifest.json`, both
`no-cache,no-store,must-revalidate` → CloudFront invalidation `/*` → verify the live manifest `buildSha`.
Preflight also requires `dist/` to pass `check:artifact-isolation --profile prod` (including the BOM check) and
its `buildSha` to equal `git HEAD`.

Why not `aws s3 sync --delete` (Phase D script, step 4): it uploads `index.html`, assets and deletions in
one unordered pass, never invalidates CloudFront, and predates the `www` cutover.

## Stale assets — how they arise and how to remove them
Vite emits content-hashed files, so every deploy leaves the previous build's files in the bucket. They are
harmless (nothing references them) but accumulate. They are removed as a **separate, later** step so rollback
stays instant in between:

```
npm run prod-web:stale-assets                      # read-only report; exit 0 = safe
node scripts/deploy-prod-web.mjs cleanup           # read-only, same analysis + the exact delete command
node scripts/deploy-prod-web.mjs cleanup --apply --expect-count <N>
```
"Stale" means: not reachable from the **live** `index.html` through any referenced JS/CSS chunk
(`scripts/lib/stale-assets.mjs`; conservative — a name in a comment keeps the file). The delete refuses unless
the live analysis is verified safe, every referenced chunk was readable, and `--expect-count` equals the
stale count found.

## Storage retention — noncurrent version lifecycle

`infra/s3/strata-ngo-web-prod-lifecycle.json` (see `infra/s3/README.md` for the full rationale) is the
reviewed lifecycle configuration for `strata-ngo-web-prod`: it expires **noncurrent** versions under
`assets/` after 60 days, and leaves current versions and the three root files (`index.html`,
`build-manifest.json`, `favicon.png`) untouched at any age. It exists in this repo as a proposal/record
— nothing applies it automatically; a human runs the commands below after review.

**Pre-apply: back up whatever is currently configured** (expect `NoSuchLifecycleConfiguration` on a
bucket with no existing rule — that absence of output *is* the backup):
```bash
aws s3api get-bucket-lifecycle-configuration --bucket strata-ngo-web-prod \
  --profile strata-agent --region ap-southeast-2 \
  > lifecycle-backup-$(date +%Y%m%d).json \
  || echo "no pre-existing lifecycle configuration (expected)"
```

**Apply:**
```bash
aws s3api put-bucket-lifecycle-configuration --bucket strata-ngo-web-prod \
  --lifecycle-configuration file://infra/s3/strata-ngo-web-prod-lifecycle.json \
  --profile strata-agent --region ap-southeast-2
```

**Read back** — must show exactly one rule, `Enabled`, `Filter.Prefix` = `assets/`,
`NoncurrentVersionExpiration.NoncurrentDays` = `60`, and no `Expiration`/`Transitions`:
```bash
aws s3api get-bucket-lifecycle-configuration --bucket strata-ngo-web-prod \
  --profile strata-agent --region ap-southeast-2
```

**Verify versioning is still enabled** (a lifecycle change never touches this, but confirm anyway):
```bash
aws s3api get-bucket-versioning --bucket strata-ngo-web-prod \
  --profile strata-agent --region ap-southeast-2
```

**Verify current objects are unchanged** (applying a lifecycle rule modifies no object):
```bash
aws s3api list-objects-v2 --bucket strata-ngo-web-prod --query 'length(Contents)' \
  --profile strata-agent --region ap-southeast-2
```

**Rollback / removal** — deletes the lifecycle configuration entirely (safe: nothing can have expired
before the bucket is 60 days old, and removal only stops *future* expirations, it cannot un-expire
anything already gone):
```bash
aws s3api delete-bucket-lifecycle --bucket strata-ngo-web-prod \
  --profile strata-agent --region ap-southeast-2
```

## Recovery
The bucket is versioned: `delete-objects` adds delete markers, so removed files remain as noncurrent
versions until a lifecycle rule expires them (see "Storage retention" above — 60 days for `assets/`,
indefinite for the three root files). A user with a tab open from before the deploy may hit a missing
lazy chunk once; the app's `lazyWithChunkReload` reloads. **Git, not an S3 version, is the authoritative
rollback**: `build-manifest.json` records the exact `buildSha` for every deploy, so
`git checkout <sha> && npm run build:prod-web` reproduces the artifact deterministically — this remains
true even after a version has expired.
