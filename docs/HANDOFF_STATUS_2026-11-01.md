# Handoff status — 2026-11-01

Snapshot for the next agent taking over Strata N-Go / Commtrac (`workflow-strt`). Every SHA and
version below was read live on 2026-11-01 unless marked otherwise. Re-check before acting:
this goes stale as soon as anything merges or deploys.

## TL;DR

| Environment | Web (frontend) | API (backend) | Behind `main` |
|---|---|---|---|
| **`main`** (origin) | `1f31444a2` (#379 merge, 2026-10-07) | same | — |
| **Staging** | `56de85086` (#376 merge) | `ab9b36555` (#374 merge) | web: 21 commits (#377–#379) · API: 31 commits incl. 2 backend commits |
| **Production** | `ab9b36555` | `ab9b36555` | 31 commits (#376–#379) |

- CI on `main` HEAD `1f31444a2`: all 7 required checks green (backend, frontend, standards,
  e2e, e2e-full, e2e-perf, e2e-web-perf).
- Open PRs: **1** — #375, which now conflicts with `main` and is partly overlapped by #379 (see below).
- No migrations since `ab9b36555`. The backend diff since then is small (see "What's behind").
- **Next logical step:** deploy `main` (`1f31444a2`) to **staging**, frontend **and** backend, then
  run manual staging acceptance for #377–#379. Production only after sign-off.

## Environments in detail

### Staging (`https://staging.strata-ngo.com`, API `https://api.staging.strata-ngo.com/api`)
- **Web:** `56de85086225e133eab3d6d5cb705538bb3c6e5a`, profile `dev`, debug features on, BOM on.
  Deployed 2026-10-01 (from S3 `strata-ngo-web-staging/build-manifest.json`). Bucket behind CloudFront
  `E1YN5XTWDWRHYP` (alias `staging.strata-ngo.com` only).
- **API:** ECS `default` / `commtrac-api-ae2c`, task def `default-commtrac-api-ae2c:46`, image
  `commtrac-api@sha256:7f76011604b58cfcf1ada4f1575ef09068e4e2577e0d89a8bef469b2c451b375`
  = git `ab9b3655563021d0beb6d77ec3e29b24ebcc1266` (verified via `/api/version` on 2026-10-01).
  1/1 running, rollout COMPLETED. The service shows a forced redeploy on 2026-10-27, but on the
  same task def, so it was a restart, not a new version.
- Postgres (RDS). Health was `healthy / database connected / Postgres` at the last check from an
  unfiltered network (2026-10-01). See "Network caveat" below.
- Packaged OCR assets (`/tesseract/worker.min.js`, both `tesseract-core-*.wasm.js`,
  `lang/eng.traineddata`) are live on staging, byte-identical to the build (verified 2026-10-01).

### Production (`https://www.strata-ngo.com` / `strata-ngo.com`, API `https://api.strata-ngo.com/api`)
- **Web:** `ab9b3655563021d0beb6d77ec3e29b24ebcc1266`, profile `prod`, debug off (from S3
  `strata-ngo-web-prod/build-manifest.json`). CloudFront `E1AYVTSTERUCZP`. **Production does not
  have the camera/OCR feature (#376) yet.**
- **API:** ECS `default` / `commtrac-api-prod`, task def `commtrac-api-prod:17`, **same image
  digest as staging** (`sha256:7f760116…` = `ab9b365`). Also restarted 2026-10-27 on the same task def.
- ECR tag hygiene: the `prod` tag points at an older digest (`sha256:d2cdc01b…`, pushed
  2026-09-24) that production **does not run**. Use digests, not the `prod` tag, as the truth.

## What's behind

### `main` vs production (`ab9b365..1f31444`, 31 commits, 4 PRs)
| PR | Merged | Scope | Backend? | On staging? |
|---|---|---|---|---|
| #376 camera-assisted QR/barcode/OCR field capture | 2026-10-01 | frontend only | no | **yes** (web) |
| #377 supporting documents before run lock | 2026-10-06 | frontend only | no | no |
| #378 production workflow report + sign-off regressions (first part) | 2026-10-06 | frontend + API | **yes** | no |
| #379 complete six production workflow regressions | 2026-10-06 | frontend + API | **yes** | no |

Backend changes since `ab9b365`, the only ones (no migrations, no `DbInitializer` /
`PostgresSchemaEnsurer` changes):
- `7157038c6` fix: expose unresolved blocking issue state in asset summary
- `7482f3293` fix: compute explicit unresolved blocking summary
- Files: `server/Commtrac.Api/Controllers/ProjectAssetsController.cs` (+30), `Models/Dtos.cs` (+1).

→ **Deploying `main` to any environment needs a new API image, not just web.** The frontend
"Resolve Blocking Issue" fix (#379) depends on the new API summary field.

The six regressions #378/#379 address (from `docs/production-workflow-regression-plan-2026-10-07.md`
on `main`): report identity/filename by workflow type, omitting uncaptured optional media,
issues-table columns/numbering, technician signature rendering, the blocking CTA driven only by
unresolved High/Blocking issues, and Closed & Signed accepting an authorized customer waiver.
**The plan requires manual staging acceptance before production promotion. That has NOT
happened: neither PR has been on staging.**

### `main` vs staging
- Web: 21 commits behind (#377, #378, #379).
- API: 31 commits behind (still `ab9b365`), including the two backend commits above.

## Open PRs

### #375 `fix/report-title-and-step-alignment` — fix(reports): dynamic report title + centered step-number badge
- Last updated 2026-09-29, 1 commit. **`mergeable = CONFLICTING`** with `main`.
- Touches `generateWorkflowReport.ts`, `workflowReportExport.ts`,
  `useAssetInstallationReportExport.ts`, `AssetInstallationPage.tsx`.
- **Overlap:** #379 has since implemented report identity by workflow type (title/filename) on
  `main`. Part of #375 (the dynamic title) is likely superseded. The step-number badge centering
  may still be needed. Next agent: rebase onto `main`, drop what #379 already covers, keep only
  what's still missing, or close it with a note.

No other open PRs. No open GitHub issues.

## Recently completed work (context)

**#376 camera-assisted field capture (merged 2026-10-01, on staging web, not in production)**
- QR/barcode + Text/OCR capture beside eligible workflow fields. Mandatory editable Review →
  Use Value. Nothing ever auto-fills a field.
- Native modal stacking fix (camera Menu/Dialog above the runner on iOS).
- Retake/Scan Again live-preview fix (rebind stream to the remounted `<video>`).
- Industrial OCR: targeting band + guide, text-line isolation, deskew, bounded Tesseract passes,
  deterministic candidate scoring, pinch-to-zoom (real camera zoom).
- QR lifecycle hardening (reusable canvases, decoder-error tolerance, track-ended recovery,
  Try again, backdrop taps ignored) + DEV `[FieldCapture]` trace (`window.__fieldCapture`).
- Rotation-invariant barcodes: one extra 90° attempt covers 90°/270° for linear/PDF417; QR/DM
  native any-angle.
- OCR is fully offline: Tesseract assets are self-hosted under `/tesseract/` and the model ships
  uncompressed (Android AAPT2 gunzips `.gz`).
- Physical iPhone QA passed for stacking, Retake, OCR, editable review, offline, and the QR
  lifecycle stress test. **Physical QA of rotation (tests A–L) was never reported back.** The iPhone
  dev build installed then was `1f4a2d2e8` (= the #376 tree).

**#377 supporting documents:** frontend-only; reuses the Asset Documents dialog on the run review stage.

## Follow-ups / known issues (not done)
1. **Stage `main`:** deploy `1f31444a2` web + API to staging, then manual acceptance of the six
   #378/#379 items and the #377 document flow.
2. **Production promotion** of #376–#379 after staging sign-off (web via
   `node scripts/deploy-prod-web.mjs`, see `docs/PROD_WEB_DEPLOY.md`; API via the production
   procedure, `scripts/deploy-phase-d-aws.sh` / `docs/MAC_AGENT_PHASE_D_PROD_AWS_PROMPT.md`).
3. **PR #375:** rebase/trim or close (see above).
4. **Staging deploy script is partly stale:** `scripts/deploy-phase-c-aws.sh`
   - Step 1 rewrites CloudFront aliases/cert. Run with `SKIP_CLOUDFRONT=1` for routine deploys.
   - Step 4 asserts `www` serves the same bundle as staging. That's false since the `www` cutover
     (`www` is production, `E1AYVTSTERUCZP`), so the script fails after uploading.
   - `EXPECTED_SHA` is hard-coded to an old SHA.
   - The 2026-10-01 staging deploy ran Step 4's commands by hand without the `www` checks.
   Worth fixing the script.
5. **Cache headers:** the staging procedure uploads every non-`index.html` file as
   `max-age=31536000, immutable`, including the non-hashed OCR assets (`worker.min.js`,
   `eng.traineddata`). A future Tesseract upgrade under the same names could be served stale from
   browser caches for up to a year. Give `/tesseract/*` a shorter cache policy or versioned paths.
6. **`@zxing/browser`** is no longer imported by app code (the service uses `@zxing/library`
   directly since #376). It could be removed from `package.json`.
7. **Security note (out of #376 scope, unverified against intent):** on the iOS dev build, WebKit
   localStorage contains an `auth_token` key, which contradicts CLAUDE.md ("tokens in
   Keychain/Keystore"). Worth checking `secureStorage.ts` usage.
8. **ECR `prod` tag** is stale vs. what production runs (see Production above).
9. Flaky test: `src/features/projects/ProjectForm.approvalDecision.test.tsx` ("new project still
   defaults to Draft") intermittently hits the 5s timeout in the full local suite and passes in
   isolation. Not modified. Known and unrelated.

## Network caveat (this Mac, 2026-11-01)
On the current network, a **Fortinet FortiGate (`FG100FTK22037562`) TLS-inspects the
strata-ngo hosts**, presenting certificates this Mac doesn't trust. curl/Node/Playwright get
`unable to verify the first certificate` for staging **and** production (GitHub is exempt).
This is local, **not a site outage**. DNS resolves to the expected Cloudflare/AWS endpoints.
Consequences:
- Live `/api/version`, `/api/health` and smoke checks could not be re-verified today. Versions
  above come from S3 manifests and ECS/ECR via the AWS API, which works.
- Before deploying, either run from an uninspected network or install the FortiGate CA
  (with the network owner's approval). Don't disable TLS verification.

## How things are deployed (pointers)
- **Staging web + API:** `scripts/deploy-phase-c-aws.sh` (AWS profile `strata-agent`,
  `ap-southeast-2`, account `920154935299`). Mind follow-up 4. Web = `npm run build:dev-web` →
  S3 `strata-ngo-web-staging` → invalidate `E1YN5XTWDWRHYP`. API = Docker build (only
  `server/Commtrac.Api/`) → ECR `commtrac-api` → new task-def revision on `commtrac-api-ae2c`.
- **Production web:** `node scripts/deploy-prod-web.mjs deploy [--apply]` (dry run by default),
  `docs/PROD_WEB_DEPLOY.md`. Bucket `strata-ngo-web-prod`, CloudFront `E1AYVTSTERUCZP`.
- **Production API:** `scripts/deploy-phase-d-aws.sh` (ECS `commtrac-api-prod`).
- Migrations apply on API startup (`DbInitializer`). Postgres parity rules are in CLAUDE.md.
- Mobile dev build: `npm run build:dev-native`, then an Xcode build with a fresh `-derivedDataPath`, then
  `xcrun devicectl device install app` (Christian's iPhone UDID `00008150-001C2DD63A2B401C`,
  bundle `com.strata.ngo.field.dev`). A launch fails with "Locked" if the phone is locked.

## Rollback references
- **Staging web before `56de850`:** `ab9b365` (entry `index-dzeWfCdp.js`). The local bucket snapshot
  taken on 2026-10-01 **no longer exists** (scratchpad expired). To roll back, rebuild `ab9b365`
  with `npm run build:dev-web` from a clean checkout and redeploy.
- **Staging/prod API:** task defs `default-commtrac-api-ae2c:46` / `commtrac-api-prod:17`, digest
  `sha256:7f760116…`. Keep these as the rollback target when the API is next deployed.

## Rules to keep
- Never touch `android/app/google-services.json.disabled-not-strata-ngo` (untracked, intentional).
- No production deploys, DNS or Cloudflare changes without explicit approval. Staging first,
  manual acceptance, then production.
- PRs merge only with all 7 checks green. Don't merge on someone's behalf unless asked.
- `docs/ARCHITECTURE.md` is generated (pre-commit hook). Don't hand-edit it.

## Local checkout state (this Mac)
- `/Users/christianchavez/Desktop/workflow-strt` is on `main` at **`56de85086`**, **21 commits
  behind `origin/main`**. Run `git pull --ff-only` before working.
- Working tree clean apart from the protected untracked Android file (and this handoff doc,
  uncommitted).
