# Staging release runbook — `1f31444a2` (2026-11-01)

Release: `1f31444a252178aa4b05500e33cd3716055c4b7b` (= `origin/main`; PRs #376, #377, #378, #379).
Target: **staging only**. Production, DNS and Cloudflare are out of scope.
Companion docs: `HANDOFF_STATUS_2026-11-01.md` (state before this release) and
`STAGING_ACCEPTANCE_2026-11-01.md` (results).

## 1. Release checklist

- [ ] Source SHA = `origin/main` = `1f31444a2`, with no later commits, and all four PR merge commits as ancestors.
- [ ] CI 7/7 green on the release SHA (backend, frontend, standards, e2e, e2e-full, e2e-perf, e2e-web-perf).
- [ ] Build from an **isolated clean worktree** at the release SHA, never from a developer checkout or `.env*`.
- [ ] Backend changes reviewed: only `ProjectAssetsController.cs` (+30) and `Dtos.cs` (+1) since `ab9b365`.
      **No migrations**, no `DbInitializer` / `PostgresSchemaEnsurer` changes. Staging runs with
      `Database__RunMigrationsOnStartup=false`, so the database is untouched.
- [ ] Rollback artifacts in place **before** any write (section 4).
- [ ] Backend image tagged with the **git SHA** (immutable release identity) and deployed **by digest**.
      `:staging` is a mutable convenience tag only, never `latest`.
- [ ] New task-definition revision copied from the current one, so staging secrets (Secrets Manager refs),
      roles, logging and environment carry over. Only the image changes. No production values.
- [ ] Web built with `npm run build:dev-web`, `check:artifact-isolation --profile dev` passes, and the manifest `buildSha` = release.
- [ ] OCR assets present in `dist/tesseract/` (worker, both cores, uncompressed `lang/eng.traineddata`).
- [ ] Upload order: hashed assets → `index.html` + `build-manifest.json` (`no-cache`) → CloudFront invalidation `/*`.
- [ ] ECS service stable with the new revision, then the verification procedure (section 3).

## 2. Deploy procedure (what is actually run)

`scripts/deploy-phase-c-aws.sh` is the documented staging procedure. Before PR #382 (merged
2026-11-01, `main` `3621eb655`) parts of it were stale: Step 1 rewrote the CloudFront aliases/cert by
default, Step 4 asserted `www` = staging (false since `www` became production on `E1AYVTSTERUCZP`), and
`EXPECTED_SHA` was hard-coded. So release `1f31444a2` was deployed by running these steps by hand.
With #382 merged, the script can be used directly: `EXPECTED_SHA=<sha> ./scripts/deploy-phase-c-aws.sh`
(CloudFront setup is opt-in; the image is tagged with the git SHA and deployed by digest). The manual
equivalent:

```bash
P="--profile strata-agent --region ap-southeast-2"     # bash; in zsh use an array
SHA=1f31444a252178aa4b05500e33cd3716055c4b7b
ECR=920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api

# API — build from the release worktree (image built from server/Commtrac.Api only)
docker build --build-arg GIT_SHA=$SHA --build-arg BUILD_TIME=$(date -u +%FT%TZ) -t commtrac-api:$SHA .
aws ecr get-login-password $P | docker login --username AWS --password-stdin ${ECR%/*}
docker tag commtrac-api:$SHA $ECR:$SHA && docker push $ECR:$SHA
DIGEST=$(aws ecr describe-images --repository-name commtrac-api --image-ids imageTag=$SHA $P --query 'imageDetails[0].imageDigest' --output text)
# new revision = current revision with ONLY the image replaced by $ECR@$DIGEST
aws ecs register-task-definition --cli-input-json file://taskdef.json $P
aws ecs update-service --cluster default --service commtrac-api-ae2c --task-definition default-commtrac-api-ae2c:<NEW> $P
aws ecs wait services-stable --cluster default --services commtrac-api-ae2c $P
# then (optional) move the :staging convenience tag to $DIGEST

# Web
npm run build:dev-web && npm run check:artifact-isolation -- --profile dev --dist dist
aws s3 sync dist/ s3://strata-ngo-web-staging/ --delete --cache-control "public,max-age=31536000,immutable" \
  --exclude index.html --exclude build-manifest.json $P
aws s3 cp dist/index.html s3://strata-ngo-web-staging/index.html --cache-control "no-cache,no-store,must-revalidate" $P
aws s3 cp dist/build-manifest.json s3://strata-ngo-web-staging/build-manifest.json --cache-control "no-cache,no-store,must-revalidate" $P
aws cloudfront create-invalidation --distribution-id E1YN5XTWDWRHYP --paths "/*" --profile strata-agent
```

The ECS service uses a CANARY strategy (5%, 3-min bake), the deployment circuit breaker with
automatic rollback, and the alarm `default/commtrac-api-ae2c/RollbackAlarm`. A failing
revision rolls itself back, but **check the outcome**: a completed `update-service` is not success.

## 3. Verification procedure

Never weaken TLS to verify. On a network that TLS-inspects strata-ngo (e.g. the Fortinet seen on
2026-11-01), use AWS-side evidence instead and record the limitation; run the HTTPS checks later
from a trusted network or a phone on cellular.

| Check | Preferred (HTTPS, trusted network) | AWS-side evidence |
|---|---|---|
| Web build identity | `GET https://staging.strata-ngo.com/build-manifest.json` → `buildSha` | `s3://strata-ngo-web-staging/build-manifest.json`; invalidation `Completed` |
| API build identity | `GET /api/version` → `gitSha` | running task's image digest = digest pushed for the `$SHA` tag; image built with `GIT_SHA=$SHA` |
| API health + DB | `GET /api/health` → `healthy`, `database: connected` | ECS desired = running, rollout `COMPLETED`; CloudWatch `/aws/ecs/default/commtrac-api-ae2c-219a` startup log (`[DB] Provider: Postgres`, no exceptions) |
| No startup errors | — | CloudWatch filter `?Exception ?fail ?crit` on the new task's stream |
| OCR assets | `GET /tesseract/{worker.min.js, tesseract-core-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js, lang/eng.traineddata}` = 200 + build sha256 | S3 objects present with matching size/ETag |
| JS errors / chunks | headless Chromium + WebKit: login page renders, 0 page errors, every `dist/assets/*.js` served | — |
| Functional | section 5 matrix (login required; dedicated staging test project) | — |

## 4. Rollback procedure

Recovery targets recorded before the release (evidence in `~/strata-ngo-release-evidence/2026-11-01/`
on the deploying Mac):

| Part | Target | How to restore |
|---|---|---|
| API | task def `default-commtrac-api-ae2c:46` (ACTIVE), image `commtrac-api@sha256:7f76011604b58cfcf1ada4f1575ef09068e4e2577e0d89a8bef469b2c451b375` (git `ab9b365`; protected by tag `ab9b3655563021d0beb6d77ec3e29b24ebcc1266`) | `aws ecs update-service --cluster default --service commtrac-api-ae2c --task-definition default-commtrac-api-ae2c:46` → `wait services-stable` → verify |
| Web | build `56de85086` (entry `index-CDQSUoq1.js`, 176 objects), byte-exact snapshot `rollback-staging-web-56de85086/` + `.sha256` list | `aws s3 sync <snapshot>/ s3://strata-ngo-web-staging/ --delete` (same cache flags, excluding `index.html` + manifest), then `index.html` + manifest no-cache, then invalidate `E1YN5XTWDWRHYP` |
| Web (no snapshot) | git `56de85086` | clean worktree at that SHA → `npm ci` → `npm run build:dev-web` → deploy as above |
| Database | unchanged by this release | nothing to roll back (no migrations; migrations disabled at startup) |

**Emergency rollback restores a mixed pair:** API `ab9b365` (`:46`) with web `56de85086`. That's
the pair staging served from 2026-10-01 to 2026-10-31, but it drops #377–#379 and the two halves no
longer share one SHA. For a single-SHA rollback, rebuild and deploy the `ab9b365` web instead.

S3 bucket versioning can't be read with the agent role (`s3:GetBucketVersioning` denied), so
don't count on object versions; use the snapshot.

## 5. Acceptance-test matrix

Status values: **PASS** (tested, evidence) · **FAIL** (tested, did not meet expectation) ·
**BLOCKED** (external dependency) · **PENDING** (not yet tested). Physical-device rows stay
PENDING until actually performed on a device. CI is never evidence for them.

### #376 Camera capture (physical iPhone + mobile web)
| # | Test | Expected |
|---|---|---|
| C1 | QR recognition | detected → Review, value editable |
| C2 | Linear barcode recognition (horizontal) | same |
| C3 | Rotated barcode 90° / 270° / 180° | detected without rotating the phone |
| C4 | Target-window isolation | codes/text outside the target aren't read |
| C5 | Review before field population | the field is unchanged until Use Value |
| C6 | Use Value | the field gets exactly the edited value |
| C7 | Scan Again | live preview resumes (no black screen) |
| C8 | OCR explicit Capture | OCR only on Capture |
| C9 | OCR Retake | live preview, candidate discarded |
| C10 | OCR confirmation | editable candidate, Use Value commits |
| C11 | Cancel | the field is unchanged |
| C12 | Background/foreground during preview | the camera recovers (or Try again), the dialog doesn't close |
| C13 | Repeated scans (≥10) | no black screen, no premature close |
| C14 | Offline OCR | works with no network (packaged assets) |

### #377 Supporting Documents
| # | Test | Expected |
|---|---|---|
| D1 | Visible at the run review stage | "Supporting documents" beside "Review captured data" |
| D2 | Accessible during execution (before lock) | upload/link/manage up to 3 |
| D3 | Persist after save/reopen | the same documents on the asset-row Documents action |
| D4 | Workflows without documents | run normally |
| D5 | Locking/completion unchanged | hidden once the run is saved/locked or in sign-off review |

### #379 Six regressions
| # | Test | Expected |
|---|---|---|
| R1 | Report title + filename (commissioning) | `<REPORT_TYPE>_<PROJECT_NUMBER>_<ASSET_TAG>_<WORKFLOW_NAME>.pdf`; no `installation-record` |
| R2a | Optional media not captured | omitted from the PDF |
| R2b | Optional media captured | included |
| R2c | Required media missing | explicitly marked missing |
| R3a | PDF issues table | no Type / Impact / Notes; Description wider |
| R3b | Issues Board | no Type column |
| R3c | Historical issues | step-only numbering; no invented item letters |
| R4a | Installer signature (customer signed) | actual signature image |
| R4b | Installer signature (customer waived) | actual installer image; waiver indicated |
| R4c | Historical signed run | signature still rendered |
| R5a | Open High/Blocking issue | Resolve Blocking Issue shown |
| R5b | Resolved blocking + open Medium | not shown |
| R5c | Only Medium | not shown |
| R5d | No issues | not shown |
| R5e | Closed asset with Medium issues | stays Closed |
| R5f | Backend/frontend agree | the API's explicit blocking summary drives the UI |
| R6a | Installer signed + valid customer waiver | appears in Closed & Signed |
| R6b | Bulk PDF export | includes the waived asset |
| R6c | Report | shows the waiver; no fabricated customer signature |
| R6d | Installer-only, not signed/waived by the customer | doesn't qualify |
