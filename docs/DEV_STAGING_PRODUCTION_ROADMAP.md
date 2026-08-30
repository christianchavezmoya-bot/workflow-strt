# Development → Staging → Production roadmap

**Status:** Planning — start **after** baseline sync PASS (`main` = AWS staging = iPhone source).

**Problem today:** Staging (`www.strata-ngo.com` + `api.staging.strata-ngo.com`) is both the **test environment** and the **only shared environment** Christian's team uses. Day-to-day development and PR deploys target the same URLs real field testing uses. That worked for bootstrap; it does **not** scale once real N-Go users onboard.

**Goal:** Three clearly separated environments with a controlled promotion path. Normal development **never** happens on the environment end users touch.

---

## Target architecture (v1)

```
┌─────────────────┐     merge + promote      ┌─────────────────┐     promote + gate     ┌─────────────────┐
│  DEVELOPMENT    │  ──────────────────────► │    STAGING      │  ───────────────────► │   PRODUCTION    │
│  (local + CI)   │                          │  (pre-prod QA)  │                       │  (real users)   │
└─────────────────┘                          └─────────────────┘                       └─────────────────┘
  Mac / Docker / Cloud Agent                   www.strata-ngo.com *                      app.strata-ngo.com
  localhost / dev API (TBD)                    api.staging.strata-ngo.com                api.strata-ngo.com
  feature branches                             main after acceptance                     tagged releases only
```

\* Today `www.strata-ngo.com` **is** staging web — rename or add `staging.strata-ngo.com` when splitting (DNS decision required).

---

## Environment definitions

| | Development | Staging | Production |
|---|-------------|---------|------------|
| **Purpose** | Build features, break things safely | Christian + PM acceptance, field pilot | Paying / production users |
| **Git source** | Feature branches | `main` (after PR merge) | Release tags / protected branch |
| **Deploy trigger** | Developer / agent locally | Auto or manual promote from `main` | Manual promote from staging PASS |
| **Database** | Local SQLite / Docker Postgres | RDS `strata-ngo-staging` | RDS prod (new) |
| **Media bucket** | Local / MinIO | `strata-ngo-media-staging` | `strata-ngo-media-prod` (new) |
| **Web** | `localhost:5173` | S3/CF staging bucket | S3/CF prod bucket |
| **API** | `localhost:4000` | ECS `commtrac-api-ae2c` | ECS prod service (new) |
| **Mobile builds** | LAN IP / dev API | Staging API URL baked in | Prod API URL baked in |
| **Secrets** | `.env.local` / dev seed | Secrets Manager staging | Secrets Manager prod |

---

## Promotion rules (proposed)

### Development → Staging

1. PR merged to `main` (review + CI gates).
2. Mac/cloud agent deploys **`main` only** to staging (API + web + optional TestFlight/internal iOS).
3. Christian runs **acceptance checklist** (short — not full regression every time).
4. **PASS** recorded before any production consideration.

### Staging → Production

1. Staging **VERIFIED END-TO-END** for the release scope.
2. Tag release on `main` (e.g. `v1.2.0`).
3. Deploy **same artifact digests** tested on staging (image digest + web bundle hash — not a fresh build).
4. DB migrations run via controlled job (backup first).
5. Smoke test prod → Christian sign-off → monitor CloudWatch.

**Never:** deploy feature branches directly to production.  
**Never:** run daily dev against production API from developer machines.

---

## Implementation phases

### Phase 0 — Baseline (NOW)

- [ ] Mac agent: deploy `f2fc7920` to staging API + web + iPhone (`docs/MAC_AGENT_BASELINE_SYNC_MAIN_PROMPT.md`)
- [ ] VERSION STATUS table: GitHub main = AWS staging = iPhone **YES**
- [ ] Document current staging ARNs, buckets, ECS rev, CloudFront ID in handoff doc

### Phase 1 — Process (no new AWS yet)

- [ ] Written rule: **all PR staging deploys from `main` only** after merge
- [ ] Acceptance checklist template (5–10 items max per release)
- [ ] Branch policy: `main` protected, require PR
- [ ] Stop deploying open PR branches to shared staging (PR #321 lesson)

### Phase 2 — Naming & DNS clarity

- [ ] Decide: keep `www` as staging **or** move staging to `staging.strata-ngo.com` and reserve `www` for prod marketing/app
- [ ] Cloudflare records documented
- [ ] Update `Email__FrontendBaseUrl` / invite links when URLs change

### Phase 3 — Production AWS (new stack)

- [ ] RDS prod instance (or separate database on shared cluster — prefer isolated)
- [ ] S3 media + web buckets prod
- [ ] ECS service prod (separate from `commtrac-api-ae2c`)
- [ ] Secrets Manager prod
- [ ] IAM task roles prod (copy staging pattern — S3 task role from day one)
- [ ] CloudFront + ACM prod

### Phase 4 — CI/CD automation (optional)

- [ ] GitHub Actions: build + test on PR
- [ ] Staging deploy on merge to `main` (Mac agent or pipeline)
- [ ] Production deploy manual approval gate

### Phase 5 — Mobile release channels

- [ ] **Staging build:** internal TestFlight / ad-hoc → staging API
- [ ] **Production build:** App Store → prod API
- [ ] Version numbering tied to git tags

---

## What changes for Christian (plain English)

**After this roadmap is live:**

- Developers work on **their Mac** or a **dev server** — not on the site you test every day.
- When a feature is ready, it lands on **`main`**, gets deployed to **staging**, and **you** test there.
- Only when you say PASS does it go to **production** for real users.
- Your iPhone **staging app** always matches what's on `main` in GitHub — not random PR branches.

---

## Decisions needed from Christian (before Phase 3)

1. Production domain: `app.strata-ngo.com`? `ngo.strata-ngo.com`?
2. Keep `www.strata-ngo.com` as staging permanently or flip to prod?
3. First production users: internal pilot only or external customers?
4. App Store vs enterprise distribution for prod iOS?

---

## Related docs

- Baseline sync (execute first): `docs/MAC_AGENT_BASELINE_SYNC_MAIN_PROMPT.md`
- AWS handoff: `docs/CLAUDE_CODE_AWS_HANDOFF.md`
- Pre-deploy checklist: `docs/CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`
- Full AWS plan: `docs/CLOUD_HOSTING_AWS_PLAN.md`
