# S3 lifecycle policies

Reviewed, version-controlled lifecycle configurations for production S3 buckets. A file here is a
**proposal + record of what was applied**, not something anything auto-applies — see
`docs/PROD_WEB_DEPLOY.md` for the exact commands to apply and verify one.

## `strata-ngo-web-prod-lifecycle.json`

**Bucket:** `strata-ngo-web-prod` — the static web frontend behind CloudFront `E1AYVTSTERUCZP`
(`www.strata-ngo.com` / `strata-ngo.com`). See `scripts/lib/prod-web-target.mjs` for how that target
is identified and verified.

**Purpose.** Every deploy overwrites or removes hashed files under `assets/` (Vite content-hashing —
see `docs/PROD_WEB_DEPLOY.md`). With bucket versioning enabled, S3 keeps every previous copy as a
*noncurrent version* forever unless a lifecycle rule says otherwise, so `assets/` noncurrent storage
grows without bound. This rule caps that: it expires (permanently deletes) a noncurrent version under
`assets/` 60 days after it stops being current.

**Scope, precisely:**
- Applies **only** to noncurrent versions under the `assets/` prefix.
- **Current versions are never touched by this rule** — nothing live can be expired by it, at any age.
- `index.html`, `build-manifest.json` and `favicon.png` live at the bucket root, **outside**
  `assets/`, so every version of them (current and noncurrent) is unaffected and kept indefinitely.
- No transitions (Glacier/IA) and no cleanup of expired-object delete markers — deliberately out of
  scope for this phase (see "Future work" below).
- Touches nothing else: not `strata-ngo-media-prod` (user/customer media, a separate bucket), not
  `strata-ngo-web-staging`, and no other AWS resource. A lifecycle configuration is scoped to the one
  bucket it is applied to.

**The 60-day window is a convenience, not the rollback plan.** Because root files (which reference
asset filenames) are versioned forever while the assets they reference expire at 60 days, an
`index.html` version older than 60 days may point at asset chunks that no longer exist — restoring it
alone would not reliably restore a working site. **The authoritative rollback path is a reproducible
build from git**: every deploy's `build-manifest.json` records the exact `buildSha`
(`scripts/write-build-manifest.mjs`), so `git checkout <sha> && npm run build:prod-web` recreates the
full, matching artifact deterministically. S3 versions are a short-term convenience on top of that,
not a substitute for it.

**Why no delete-marker cleanup yet.** When the 96 assets removed by the one-time stale-asset cleanup
(2026-09-21) age past 60 days, they will leave only a delete marker in the bucket (harmless, and free
to store) rather than being fully removed from the listing. Adding `ExpiredObjectDeleteMarker` cleanup
is deferred to a later, separate change so the first expiration cycle can be observed before combining
it with another automated deletion behaviour.

**Deliberately deferred, not forgotten** (tracked, not implemented):
- Applying an equivalent (or shorter) retention window to `strata-ngo-web-staging`.
- Expired-object-delete-marker cleanup on this bucket, once the first 60-day cycle is observed.
- Whether root files should eventually get a bounded (not indefinite) retention window, which would
  remove the asymmetry above — but only once the reproducible-build rollback path is what people
  actually rely on in practice, not S3 versions.

## Applying / verifying / rolling back

See **"Stale assets" → lifecycle** in `docs/PROD_WEB_DEPLOY.md` for the exact `aws s3api` commands
(backup/read, apply, read-back, versioning check, rollback). This repo does not execute them
automatically; a human runs them after review.
