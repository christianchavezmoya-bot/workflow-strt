# Phase C — DEV DNS clarity (`staging.strata-ngo.com`)

**Goal:** Canonical DEV web at **`https://staging.strata-ngo.com`**. **`www.strata-ngo.com`** keeps serving the same DEV app until Phase F, then flips to production.

**Prerequisites:** Phase B **CLOSED / PASS** · main at `509a3cdf…` or newer · PR with Phase C URL policy merged.

**Order:** Christian DNS + CloudFront alias → Mac API ECS env redeploy → Mac web deploy → verify both hosts → link smoke on staging host.

---

## Christian — DNS (do first)

Copy into Cloudflare for **strata-ngo.com**:

```
PHASE C — Christian DNS only

1. In Cloudflare DNS, add:
   staging.strata-ngo.com  →  CNAME  →  (same CloudFront target as www today)
   Proxy: ON (orange cloud) · SSL: Full (strict)

2. Tell the Mac agent the CloudFront domain name if asked (from www CNAME target).

3. Do NOT repoint www to production yet — that is Phase F.

4. Reply "DNS C done" when saved.

5. After Mac agent adds staging to CloudFront alternate domains, confirm:
   https://staging.strata-ngo.com loads the login page (same app as www).
```

---

## Mac agent — paste into Claude Code

```
PHASE C — DEV DNS deploy agent (Strata N-Go)

AWS profile: strata-agent · region ap-southeast-2
Do NOT start Phase D/F. www stays on DEV origin until Phase F.

═══════════════════════════════════════════════════════════════
STEP 0 — Sync + wait for Christian
═══════════════════════════════════════════════════════════════
git checkout main && git pull origin main
git log -1 --oneline

STOP until Christian confirms "DNS C done" AND staging.strata-ngo.com resolves.
If DNS not live, proceed with CloudFront alias prep only.

═══════════════════════════════════════════════════════════════
STEP 1 — CloudFront alternate domain (required for HTTPS)
═══════════════════════════════════════════════════════════════
Distribution: E1YN5XTWDWRHYP · bucket strata-ngo-web-staging

Add alternate domain name: staging.strata-ngo.com
Attach ACM cert (us-east-1) covering staging.strata-ngo.com (request if missing).
Do NOT remove www alias — both hosts serve DEV during Phase C.

Verify:
  curl -sS -o /dev/null -w "%{http_code}\n" https://staging.strata-ngo.com/
  curl -sS https://staging.strata-ngo.com/build-manifest.json

PASS: HTTP 200, same build-manifest profile=dev as www.

═══════════════════════════════════════════════════════════════
STEP 2 — ECS API env (backend Phase C — register new task def)
═══════════════════════════════════════════════════════════════
Update task definition (copy prior rev verbatim except env):

  Email__FrontendBaseUrl=https://staging.strata-ngo.com
  Cors__AllowedOrigins__0=https://staging.strata-ngo.com
  Cors__AllowedOrigins__1=https://www.strata-ngo.com
  ASPNETCORE_ENVIRONMENT=Staging

Register new revision with NEW image digest if code PR merged (Phase C URL policy).
If image unchanged, env-only new revision is fine.

Deploy: update-service with new task-definition rev (NOT force-new-deployment alone — use digest-pinned image update pattern from Phase B).

Verify:
  curl -sf https://api.staging.strata-ngo.com/api/health
  curl -sf https://api.staging.strata-ngo.com/api/version

Settings → Notifications → Public frontend URL should show staging.strata-ngo.com after boot patch.

═══════════════════════════════════════════════════════════════
STEP 3 — DEV web (both hosts)
═══════════════════════════════════════════════════════════════
npm run build:dev-web
npm run check:artifact-isolation -- --profile dev --dist dist
aws s3 sync dist/ s3://strata-ngo-web-staging/ --delete --profile strata-agent --region ap-southeast-2
aws cloudfront create-invalidation --distribution-id E1YN5XTWDWRHYP --paths "/*" --profile strata-agent

Verify BOTH:
  https://staging.strata-ngo.com — DEV badge, login, Admin dashboard
  https://www.strata-ngo.com — still loads (transition), same bundle hash

═══════════════════════════════════════════════════════════════
STEP 4 — Link smoke on STAGING host (L1–L5)
═══════════════════════════════════════════════════════════════
Browse https://staging.strata-ngo.com as Admin:

| ID | Check | PASS if |
|----|-------|---------|
| L1 | Settings → Notifications → Public frontend URL | staging.strata-ngo.com |
| L2 | Re-send test invite | Email link host is staging.strata-ngo.com |
| L3 | Open invite link | Create-password page loads |
| L4 | Workflow phone upload QR | URL starts https://staging.strata-ngo.com/mobile-upload |
| L5 | Customer signature copy link | staging.strata-ngo.com/sign/… |

═══════════════════════════════════════════════════════════════
STEP 5 — Optional native
═══════════════════════════════════════════════════════════════
No native rebuild required unless frontend changed again.
API URL unchanged (api.staging.strata-ngo.com).

Report: main SHA, CF alias status, ECS rev, /api/version, live bundles on staging+www, L1–L5, Phase C PASS/FAIL
```

---

## Phase C gate

| Check | PASS if |
|-------|---------|
| `staging.strata-ngo.com` resolves + HTTPS 200 | Login loads |
| Invite/QR links | Use **staging** host |
| `www.strata-ngo.com` | Still serves DEV (unchanged origin) |
| API CORS | Both staging + www origins allowed |
| Team comms | Christian notifies team to use staging for DEV testing |

**Phase C CLOSED** when Mac report PASS + Christian confirms staging URL in daily use.

**Phase D** (prod AWS stack) is separate — do not start automatically.
