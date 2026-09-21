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

## Recovery
The bucket is versioned: `delete-objects` adds delete markers, so removed files remain as noncurrent
versions until a lifecycle rule (if any) expires them. Confirm that rule before a large cleanup. A user with a
tab open from before the deploy may hit a missing lazy chunk once; the app's `lazyWithChunkReload` reloads.
