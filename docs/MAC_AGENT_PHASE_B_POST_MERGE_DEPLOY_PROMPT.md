# Mac agent — Phase B post-merge DEV deploy (#328)

**Copy everything between PROMPT START and PROMPT END into Claude Code on the Mac.**

**When to use:** Immediately after **PR #328** merges to `main` (Phase B build separation). Christian approved merge; execute DEV API + web + iPhone **N-Go DEV** install. **Do not start Phase C** (DNS cutover).

**Prerequisites:** AWS MCP + profile **`strata-agent`**. Handoff: [`CLAUDE_CODE_AWS_HANDOFF.md`](./CLAUDE_CODE_AWS_HANDOFF.md).

**Expected merged main SHA:** `839b7376933c6c4ba6f8be95a196d9578bf1a01f` (verify with `git rev-parse HEAD` after pull).

**Authoritative source commit:** Every artifact in this deploy must trace to **`839b7376933c6c4ba6f8be95a196d9578bf1a01f`**. Do not deploy from a different commit unless Christian explicitly approves a newer merge.

**Current gate status:**

| Gate | Status |
|------|--------|
| Phase B code | **PASS / MERGED** (#328) |
| Phase B deployment | **PENDING** (this runbook) |
| Phase B device acceptance | **PENDING** |
| Phase C | **BLOCKED** |

**Do not commit:** `.env.staging.local`, secrets, LAN IPs, `dist/`.

---

## PROMPT START

You are the **Mac Phase B DEV deploy agent** for Commtrac / **Strata N-Go**.

### Your job

1. Pull merged `main` (#328).
2. Redeploy **DEV API** with `GIT_SHA` + `BUILD_TIME` build args.
3. Deploy **DEV web** with `npm run build:dev-web` only.
4. Build/install **N-Go DEV** native (`npm run build:dev-native`) on Christian's iPhone.
5. Hand off device acceptance checklist to Christian.
6. Fill in the report at the end.

**Deploy order:** `API → web → native install`

**Artifact alignment (primary gate):** After deploy, all identity chains must resolve to the same SHA:

```
Git main (839b7376…)
  → Docker image (GIT_SHA build-arg)
  → running ECS task
  → GET /api/version.gitSha

Git main (839b7376…)
  → npm run build:dev-web
  → dist/build-manifest.json.buildSha
  → live www.strata-ngo.com/build-manifest.json

Git main (839b7376…)
  → npm run build:dev-native
  → dist/build-manifest.json.buildSha
  → installed N-Go DEV (com.strata.ngo.field.dev)
```

**STOP if any chain diverges** — do not proceed to the next deploy step.

**Do not:** change DNS, deploy prod artifacts, or start Phase C.

---

## Step 0 — Docker / disk cleanup (mandatory before `docker build`)

Follow **`docs/MAC_AGENT_DOCKER_CLEANUP_BEFORE_REBUILD.md`** (full PROMPT START…END).

| ID | PASS if |
|----|---------|
| D1 | ≥ **8 GB free** on `/` |
| D2 | Docker build cache pruned |
| D3 | Cleanup completed **before** API docker build |

---

## Step 1 — Sync repo

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin
git checkout main
git pull --no-rebase origin main
git log -1 --oneline
export MAIN_SHA="$(git rev-parse HEAD)"
echo "MAIN_SHA=$MAIN_SHA"
```

| ID | PASS if |
|----|---------|
| G1 | On `main`, pull succeeded |
| G2 | `MAIN_SHA` equals **`839b7376933c6c4ba6f8be95a196d9578bf1a01f`** (or Christian-approved newer merge) |

If `MAIN_SHA` differs from the authoritative commit, **stop** and confirm with Christian before building.

---

## Step 2 — Preflight API health (before deploy)

```bash
export STAGING_API="https://api.staging.strata-ngo.com/api"
curl -sf "${STAGING_API%/}/health" | head -c 500
echo
```

| ID | PASS if |
|----|---------|
| P0 | JSON contains `"status":"healthy"` and `"database":"connected"` |

---

## Step 3 — Build API Docker image (Phase B identity)

**Only after Step 0 PASS.**

```bash
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker build \
  --build-arg GIT_SHA="$MAIN_SHA" \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  -t commtrac-api:staging .
```

| ID | PASS if |
|----|---------|
| B1 | `docker build` exits 0 |

---

## Step 4 — Push to ECR

```bash
aws ecr get-login-password --region ap-southeast-2 --profile strata-agent \
  | docker login --username AWS --password-stdin 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com

docker tag commtrac-api:staging 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push 920154935299.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
```

Record image digest from push output → `IMAGE_DIGEST=sha256:…`

| ID | PASS if |
|----|---------|
| E1 | Push exits 0 |

---

## Step 5 — ECS task definition + deploy + verify API

**Critical:** Staging task definitions pin the container **image by immutable digest** (`commtrac-api@sha256:…`), not the mutable `:staging` tag. **`force-new-deployment` alone does NOT pick up a new ECR push** — it only restarts the same digest. After every ECR push you must:

1. Resolve the new digest (from push output or `aws ecr describe-images …`)
2. **Register a new task definition revision** with only the container `image` field updated (copy prior rev verbatim — task role, env, secrets unchanged)
3. `update-service --task-definition …:<NEW_REV>` (optionally also `--force-new-deployment`)

```bash
# After push — get digest (example)
IMAGE_DIGEST=$(aws ecr describe-images \
  --repository-name commtrac-api \
  --image-ids imageTag=staging \
  --profile strata-agent --region ap-southeast-2 \
  --query 'imageDetails[0].imageDigest' --output text)
echo "IMAGE_DIGEST=$IMAGE_DIGEST"

# Fetch current task def, patch image to digest, register new rev — use AWS MCP or:
# aws ecs describe-task-definition --task-definition default-commtrac-api-ae2c \
#   --query taskDefinition > /tmp/td.json
# (strip status/revision/compat fields, set containerDefinitions[0].image to $ECR@$IMAGE_DIGEST)
# aws ecs register-task-definition --cli-input-json file:///tmp/td-register.json

aws ecs update-service \
  --cluster default \
  --service commtrac-api-ae2c \
  --task-definition default-commtrac-api-ae2c:<NEW_REV> \
  --force-new-deployment \
  --profile strata-agent \
  --region ap-southeast-2
```

Ensure task env includes `ASPNETCORE_ENVIRONMENT=Staging` (unchanged).

Wait until service stable and ALB target **Healthy**.

**ALB:** Sync priority‑10 custom-domain rule weights to match rule 44990 (see handoff).

Record ECS task definition revision:

```bash
aws ecs describe-services \
  --cluster default \
  --services commtrac-api-ae2c \
  --profile strata-agent \
  --region ap-southeast-2 \
  --query 'services[0].taskDefinition' \
  --output text
```

**Post-deploy API verification:**

```bash
curl -sf "${STAGING_API%/}/health"
echo
curl -sS -w "\nHTTP:%{http_code}\n" "${STAGING_API%/}/version"
```

**`/api/version` auth note:** Pre-deploy, `/api/version` may return **HTTP 401** because the route does not exist on the live API yet — unknown routes hit the authenticated-by-default fallback policy in `Program.cs`. After deploying the Phase B image, `/api/version` **must** return **HTTP 200** without a JWT. The merged implementation marks `VersionController` with `[AllowAnonymous]` (same pattern as `/api/health`) and exposes only non-sensitive fields: `application`, `version`, `environment`, `gitSha`, `builtAt`.

| If post-deploy | Action |
|----------------|--------|
| HTTP 200, correct JSON | PASS — proceed |
| HTTP 401 | **Report as blocker** — do **not** change auth during this deploy; Christian decides separately |
| HTTP 404 | Image likely not deployed or wrong service — inspect ECS task |

| ID | PASS if |
|----|---------|
| S1 | ECS stable, task Running |
| S2 | `/api/health` → `"status":"healthy"`, `"database":"connected"` |
| S2b | `/api/version` → **HTTP 200** (no auth header) |
| S3 | `/api/version` → `gitSha` **exactly equals** `839b7376933c6c4ba6f8be95a196d9578bf1a01f` |
| S4 | `/api/version` → `builtAt` populated (non-empty) |
| S5 | `/api/version` → `environment` is **`Staging`** |
| S6 | CloudWatch logs — no fatal startup errors |

**STOP if S2b or S3 fails** — do not proceed to web/native until API identity matches main.

---

## Step 6 — DEV web build + S3/CloudFront

**Use canonical Phase B command only:**

```bash
npm run build:dev-web
```

Verify build identity before upload:

```bash
cat dist/build-manifest.json
npm run check:artifact-isolation -- --profile dev --dist dist
grep -oE 'index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1
```

| ID | PASS if |
|----|---------|
| W0 | `build-manifest.json` → `profile=dev`, `appEnv=dev`, `buildSha=$MAIN_SHA`, `apiBase` = staging API, `debugFeaturesEnabled=true` |
| W0b | `check:artifact-isolation` PASS |
| W0c | No LAN/private IP in `dist/assets/*.js` |

Upload `dist/` to bucket **`strata-ngo-web-staging`** (immutable `/assets/*`, no-cache `index.html`). Invalidate CloudFront **`E1YN5XTWDWRHYP`** for `/*` or at minimum `/index.html`.

**Live verification** (www still serves DEV until Phase C — expected):

```bash
curl -sS https://www.strata-ngo.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
curl -sS https://www.strata-ngo.com/build-manifest.json
```

Browser checks on `https://www.strata-ngo.com`:

| ID | PASS if |
|----|---------|
| W1 | Login page loads (HTTP 200) |
| W2 | **DEV badge** visible in top bar |
| W3 | Network tab → API host is `api.staging.strata-ngo.com` |
| W4 | Debug tools available (bug icon / debug panel — DEV only) |
| W5 | `build-manifest.json` → `buildSha` = **`839b7376933c6c4ba6f8be95a196d9578bf1a01f`** |
| W6 | No localhost/LAN IP in loaded JS |

**Web artifact alignment:** Live `build-manifest.json.buildSha` must equal `$MAIN_SHA` and `/api/version.gitSha`.

---

## Step 7 — N-Go DEV native build + iPhone install

```bash
npm run build:dev-native
npx cap sync ios
```

**Pre-install verification:**

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ios/App/App/Info.plist 2>/dev/null || \
  grep PRODUCT_BUNDLE_IDENTIFIER ios/App/App.xcodeproj/project.pbxproj | head -1
cat dist/build-manifest.json
grep -o 'api.staging.strata-ngo.com' dist/assets/index-*.js | head -1
```

| ID | PASS if |
|----|---------|
| N1 | Bundle ID = **`com.strata.ngo.field.dev`** |
| N2 | Display name = **`N-Go DEV`** |
| N3 | API = staging (`api.staging.strata-ngo.com`) |
| N4 | Manifest profile = **dev**, buildSha = `$MAIN_SHA` |

```bash
open ios/App/App.xcworkspace
```

Xcode → physical iPhone → **Product → Run**.

| ID | PASS if |
|----|---------|
| N5 | App installs as **N-Go DEV** (separate from legacy Kinet app) |
| N6 | Login screen loads |

**Note:** `com.strata.ngo.field.dev` is a **fresh sandbox**. An **empty local database on first launch** is expected — not a regression. Absence of legacy Kinet IndexedDB/queue is correct.

---

## Step 8 — Christian device acceptance (handoff)

Christian performs concise clean-baseline test on **N-Go DEV** (`com.strata.ngo.field.dev`):

1. Launch **N-Go DEV** — confirm DEV identification visible (badge / app name).
2. **First launch:** empty local store is expected (no legacy Kinet data).
3. Login → bootstrap → confirm field data downloads → **Ready for offline**.
4. Complete one workflow **online** (photos + installer signature).
5. **Decisive offline test:** create new field work **offline** with **multiple time-state transitions**, plus photos, installer signature, and completion.
6. Reconnect → queue drains to **Pending: 0 actions**.
7. Force-close and reopen → **Pending: 0** remains; valid cached/offline assets still usable.

Legacy Kinet app may remain installed for comparison — N-Go DEV must not inherit its data.

**STOP conditions (report immediately):**

- `/api/version.gitSha` ≠ deployed main
- N-Go DEV sees legacy Kinet local data
- Wrong bundle ID or API in native build
- PROD identity in DEV build
- Sync queue won't drain
- Valid offline data disappears
- DEV loses diagnostics

---

## Report template (return to Christian)

```
Phase B post-merge DEV deploy — report
Date:
Authoritative SHA: 839b7376933c6c4ba6f8be95a196d9578bf1a01f
Git MAIN_SHA (actual):
BUILD_TIME (API):
Disk cleanup D1-D3:

G1-G2 git:              PASS / FAIL
P0 preflight health:    PASS / FAIL
B1 docker build:        PASS / FAIL
E1 ECR push:            PASS / FAIL
Image digest:
ECS task definition rev:
S1-S6 API verify:       PASS / FAIL
/api/version HTTP code:
/api/version JSON:

Artifact alignment:
  main == docker GIT_SHA:     PASS / FAIL
  main == /api/version.gitSha: PASS / FAIL
  main == web manifest SHA:   PASS / FAIL
  main == native manifest SHA: PASS / FAIL

W0-W6 web:              PASS / FAIL
Live web bundle:
Live build-manifest.json:

N1-N6 native:           PASS / FAIL
Bundle ID:
Display name:
Native build SHA:

iPhone install:         PASS / FAIL / PENDING
Christian acceptance:   PASS / FAIL / PENDING

Phase B deployment:     PASS / FAIL / PENDING
Phase B acceptance:     PASS / FAIL / PENDING
Phase C started:        NO (must remain NO)

Blockers:
Notes:
```

## PROMPT END
