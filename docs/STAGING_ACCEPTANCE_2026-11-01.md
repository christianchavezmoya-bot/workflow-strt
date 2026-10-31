# Staging acceptance — release `1f31444a2` (2026-11-01)

**Recommendation: NOT READY FOR PRODUCTION.**
The deployment is complete and verified from AWS. Every functional acceptance test is still
**PENDING** (manual/device) or **BLOCKED** (this agent's network TLS-inspects strata-ngo, and the
iPhone was not connected). No defects have been found, but none of #376–#379 has been exercised
end-to-end on staging yet.

Status values: **PASS** (tested, evidence) · **FAIL** (tested, did not meet expectation) ·
**BLOCKED** (external dependency) · **PENDING** (not yet tested).
Procedures: `STAGING_RELEASE_RUNBOOK_2026-11-01.md`. State before this release:
`HANDOFF_STATUS_2026-11-01.md`.

## 1. Source

| | |
|---|---|
| Release commit | `1f31444a252178aa4b05500e33cd3716055c4b7b` = `origin/main` at deploy time, no later commits |
| Included PRs | #376 camera QR/barcode/OCR capture · #377 supporting documents · #378 regression groundwork · #379 six workflow/report fixes. All four merge commits are ancestors of the release. |
| CI on release SHA | **PASS** 7/7: backend, frontend, standards, e2e, e2e-full, e2e-perf, e2e-web-perf |
| Backend changes vs previous staging API (`ab9b365`) | `ProjectAssetsController.cs` (+30), `Models/Dtos.cs` (+1). **No migrations**, no `DbInitializer`/`PostgresSchemaEnsurer` changes. |
| Built from | isolated clean worktree at the release SHA (web + API); dev-native from the main checkout fast-forwarded to the same SHA |

## 2. Deployed versions (after)

| Part | Before (rollback target) | After |
|---|---|---|
| Staging web | `56de85086` (entry `index-CDQSUoq1.js`, 176 objects) | **`1f31444a2`** (entry `index-G8jMBaaS.js`, 175 objects, profile `dev`, API `https://api.staging.strata-ngo.com/api`) |
| Staging API | `ab9b365`: task def `default-commtrac-api-ae2c:46`, image `sha256:7f760116…b375` | **`1f31444a2`**: task def **`default-commtrac-api-ae2c:47`**, image **`commtrac-api@sha256:57a15a67415f47fd07bb24db97f58e7c0dfc0b6c8fe91fbcf84a2f1dfb09bf29`** |
| Production | `ab9b365` web + API | **unchanged** (not touched) |
| Database | — | unchanged (no migrations; `Database__RunMigrationsOnStartup=false` on staging) |

## 3. AWS deployment identifiers

| Item | Value |
|---|---|
| Account / region / profile | `920154935299` / `ap-southeast-2` / `strata-agent` |
| ECR image (immutable tag) | `commtrac-api:1f31444a252178aa4b05500e33cd3716055c4b7b` → `sha256:57a15a67415f47fd07bb24db97f58e7c0dfc0b6c8fe91fbcf84a2f1dfb09bf29` (`linux/amd64`, `Build__GitSha=1f31444a2…` baked in). `:staging` moved to this digest **after** rollout. |
| Previous image (protected) | `sha256:7f76011604b58cfcf1ada4f1575ef09068e4e2577e0d89a8bef469b2c451b375`, tagged `ab9b3655563021d0beb6d77ec3e29b24ebcc1266` before the move. **Production also runs this digest.** |
| Task definition | `default-commtrac-api-ae2c:47`: an exact copy of `:46` with only `containerDefinitions[0].image` changed (1 field diff; staging secrets/roles/env/logging unchanged; no production values) |
| ECS | cluster `default`, service `commtrac-api-ae2c`, deployment `ecs-svc/6416061601774797345`, rollout **COMPLETED** 2026-10-31 23:00Z (canary 5% + bake, circuit breaker on, no rollback), 1/1 running, 0 failed; task `1eca4ffb3ea045c68b26726d0127f8f2` (172.31.1.26) |
| Web | S3 `strata-ngo-web-staging`, CloudFront `E1YN5XTWDWRHYP` (alias `staging.strata-ngo.com` only, guarded before invalidating), invalidation `I3ZJLERXPH90R1SHO70L8K08UV` **Completed** |

## 4. Verification and smoke results

The agent's network (Fortinet FortiGate `FG100FTK22037562`) TLS-inspects every strata-ngo host,
so HTTPS clients on this Mac reject the certificates. Verification was therefore done with
**AWS-side evidence**. TLS was never weakened (an attempt to skip verification was blocked and
abandoned). Every HTTPS check below is BLOCKED until it is run from a trusted network.

| Check | Status | Evidence |
|---|---|---|
| Web build identity | **PASS** (AWS) / BLOCKED (HTTPS) | S3 `build-manifest.json` `buildSha=1f31444a2…`; `index.html` → `index-G8jMBaaS.js` present; invalidation Completed |
| API build identity | **PASS** (AWS) / BLOCKED (`/api/version`) | running task's resolved digest = `sha256:57a15a67…`, pushed from an image built at the release SHA with `Build__GitSha=1f31444a2…` |
| API health | **PASS** (AWS) / BLOCKED (HTTPS) | ALB target group (health path `/api/health`): new task `172.31.1.26` **healthy**, old target drained |
| Database connectivity | **PASS** | new task's startup log: `[DB] Provider: Postgres`, **23** DB commands executed successfully, `Hosting environment: Staging` |
| No unexpected startup errors | **PASS** | 0 lines matching exception / fail / crit / error in the new task's log stream |
| No unexpected DB changes | **PASS** | no migrations in the release; EF Migrate skipped by config |
| OCR assets packaged + served from origin | **PASS** (S3) / BLOCKED (HTTPS) | `tesseract/worker.min.js` 111,307 B; `tesseract-core-lstm.wasm.js` 3,896,484 B; `tesseract-core-simd-lstm.wasm.js` 3,899,472 B; `lang/eng.traineddata` 5,199,098 B (uncompressed; no `.gz`). sha256 identical to the device-QA'd build. |
| OCR asset cache handling | **PASS with caveat** | served `public,max-age=31536000,immutable` under non-content-hashed names. Content is identical to the previous staging build, so no stale mix today. See backlog H3. |
| API 4xx/5xx since deploy | n/a | ALB: 0 requests, 0 4xx/5xx between deploy and check (no client traffic yet) |
| Unit suite on the release tree | **PASS** | `vitest`: 174 files / 1461 tests passed |
| New JS errors / login page renders | BLOCKED | needs a trusted network (headless Chromium + WebKit smoke, as on 2026-10-01) |
| Workflow list, projects/assets, existing runs, report generation | BLOCKED | needs a trusted network and a staging login |

Evidence on the deploying Mac: `~/strata-ngo-release-evidence/2026-11-01/` (baseline AWS state,
`taskdef-46-full.json`, `taskdef-new.json`, `docker-build.log`, `web-build.log`,
`api-startup-log.txt`, `vitest-release.log`, the web rollback snapshot with checksums).

## 5. Functional acceptance matrix

Physical-device rows can only become PASS after being performed on a device. CI is not evidence for them.
The release dev-native app (`1f31444a2`, staging API) is built and ready in the main checkout;
**installing it was BLOCKED** because the iPhone (`00008150-001C2DD63A2B401C`) was unavailable to
CoreDevice. The phone still has the older dev build `1f4a2d2e8`.

### #376 Camera capture (physical iPhone + mobile web)
| # | Test | Status |
|---|---|---|
| C1 | QR recognition | PENDING (manual/device) |
| C2 | Linear barcode (horizontal) | PENDING (manual/device) |
| C3 | Rotated barcode 90°/270°/180° | PENDING (manual/device) |
| C4 | Target-window isolation | PENDING (manual/device) |
| C5 | Review before field population | PENDING (manual/device) |
| C6 | Use Value commits the edited value | PENDING (manual/device) |
| C7 | Scan Again: live preview | PENDING (manual/device) |
| C8 | OCR explicit Capture | PENDING (manual/device) |
| C9 | OCR Retake | PENDING (manual/device) |
| C10 | OCR confirmation (editable) | PENDING (manual/device) |
| C11 | Cancel leaves the field unchanged | PENDING (manual/device) |
| C12 | Background/foreground recovery | PENDING (manual/device) |
| C13 | Repeated scans: no black screen / premature close | PENDING (manual/device) |
| C14 | Offline OCR | PENDING (manual/device) |

Context, not acceptance evidence for this release: on the PR #376 branch builds (Sept/Oct), the
iPhone passed stacking, Retake, OCR, editable review, offline and the QR lifecycle stress test;
rotation (C3) was never reported back.

### #377 Supporting Documents
| # | Test | Status |
|---|---|---|
| D1 | Visible at the run review stage | PENDING (manual) |
| D2 | Usable before lock (max 3) | PENDING (manual) |
| D3 | Persist after save/reopen; same docs on the asset-row Documents action | PENDING (manual) |
| D4 | Workflows without documents run normally | PENDING (manual) |
| D5 | Locking/completion unchanged | PENDING (manual) |

### #379 Six regressions
| # | Test | Status |
|---|---|---|
| R1 | Commissioning report title + filename (`<TYPE>_<PROJECT>_<TAG>_<WORKFLOW>.pdf`, no `installation-record`) | PENDING (manual) |
| R2a/b/c | Optional media omitted / included / required-missing flagged | PENDING (manual) |
| R3a/b/c | PDF issue columns · Issues Board Type column · step-only historical numbering | PENDING (manual) |
| R4a/b/c | Actual installer signature (customer-signed / waived / historical) | PENDING (manual) |
| R5a–f | Blocking CTA matrix + backend/frontend agreement | PENDING (manual). Note: the backend field this depends on is now deployed (API `1f31444a2`). |
| R6a–d | Waiver qualifies for Closed & Signed / bulk export / no fabricated signature / unsigned-unwaived excluded | PENDING (manual) |

How to complete: from a trusted network (or a phone on cellular), log in to
`https://staging.strata-ngo.com` with a staging test account, use a **dedicated staging test
project**, and work through section 5 of the runbook. Don't modify shared staging records
you don't own.

## 6. Defects

| Severity | Item | Status |
|---|---|---|
| — | No release defects found. Functional acceptance not yet executed (see §5). | — |
| Low (tooling) | `scripts/deploy-phase-c-aws.sh` treats `www` as staging (Step 1 would alias production's host to staging; Step 4 always fails); hard-coded `EXPECTED_SHA`; mutable-tag deploy | fix in **PR #382** (not merged) |
| Low (tooling) | `update-architecture-docs.mjs` stamps `unknown` branch/commit when run in a linked git worktree (reads `.git/HEAD` as a file) | backlog |

## 7. Rollback (verified targets, not executed)

| Part | Command / target | Verified |
|---|---|---|
| API | `aws ecs update-service --cluster default --service commtrac-api-ae2c --task-definition default-commtrac-api-ae2c:46` → `aws ecs wait services-stable` → verify digest `7f760116…` and ALB health | `:46` is ACTIVE; image digest present and protected by tag `ab9b3655…` |
| Web | re-upload `~/strata-ngo-release-evidence/2026-11-01/rollback-staging-web-56de85086/` (assets with `--delete`, then `index.html` + manifest no-cache), invalidate `E1YN5XTWDWRHYP` | byte-exact snapshot of 176/176 objects + sha256 list; manifest `56de85086`. Fallback: rebuild `56de85086` from git. |
| Database | nothing to roll back | no schema/data changes in this release |
| Automatic | ECS circuit breaker + `RollbackAlarm` + canary on `commtrac-api-ae2c` | config captured in `baseline/staging-ecs-service.json` |

S3 bucket versioning is not readable by the agent role (`s3:GetBucketVersioning` denied), so the
snapshot, not object versions, is the web recovery artifact.

## 8. PR #375

Reviewed against `main`. The report-title half is **superseded** by #379 (`documentType` →
`"<TYPE> REPORT"`); the step-number badge centering was **still missing** (`badgeCY + 2.5`).
That fix alone is in **PR #381** (from current `main`, with tests that fail without it), without
#375's older title logic. A comment on #375 recommends closing it as superseded once #381 is
accepted. Nothing was merged or closed.

## 9. Open PRs created by this release work (none merged)

- **#380**: this documentation (handoff, runbook, acceptance report).
- **#381**: report step-number badge centering (remaining part of #375).
- **#382**: staging deploy-script fix (www cutover, immutable tag, EXPECTED_SHA).

## 10. Future-work backlog (not in this release)

- **H1 Issue item references:** persist the originating item/input id on new issues so numbering
  can show `1.a`, `1.b`…; historical issues stay step-only; no guessed mappings, no destructive migration.
- **H2 Auth token at rest:** on native, `secureStorage.ts` treats Keychain as authoritative but
  **mirrors secure keys (incl. `auth_token`) into WebKit localStorage** "as a fast mirror". That
  contradicts its own header and CLAUDE.md, and leaves the token in the app's WebKit storage
  (readable from the app container / backups). Needs a threat model and a reviewed migration
  (e.g. in-memory cache only on native, remove the mirror, clean up existing values). No behaviour
  change was made here.
- **H3 OCR asset caching:** `/tesseract/*` names aren't content-versioned but are served
  `immutable` for a year, so a Tesseract upgrade could leave clients mixing worker/WASM/model
  versions. Use versioned paths (e.g. `/tesseract/<version>/…`) or a short cache policy for that prefix.
- **H4 Deployment reliability:**
  - ECR `prod` tag points at a digest (`d2cdc01b…`) production doesn't run;
  - PR #382 for the staging script;
  - staging API CORS still allows `https://www.strata-ngo.com` (production web origin), so review it;
  - the known intermittently-timing-out test `ProjectForm.approvalDecision` ("new project defaults to Draft");
  - `@zxing/browser` is unused since #376.

## 11. Gates

| Gate | Status |
|---|---|
| Exact frontend and backend SHA verified | **PASS** (AWS evidence); HTTPS confirmation BLOCKED |
| Backend service healthy | **PASS** (ALB health + ECS) |
| No unexpected database changes | **PASS** |
| Rollback procedure available | **PASS** (targets verified, not executed) |
| Relevant automated tests passed | **PASS** (CI 7/7, unit 1461/1461); staging HTTPS smoke BLOCKED |
| Functional acceptance matrix completed | **PENDING** |
| Physical-device checks performed | **PENDING / BLOCKED** (device unavailable) |
| No unresolved release-blocking defects | none known; acceptance not run |

**→ NOT READY FOR PRODUCTION.** Staging is deployed and healthy, ready for manual acceptance.
