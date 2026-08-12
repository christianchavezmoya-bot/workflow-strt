# AWS deploy runbook — Commtrac cloud hosting

Step-by-step guide to stand up **staging**, run the **pre-deploy checklist**, then cut over **production**.

**Prerequisites:** Phases 0–2 + pre-deploy gate merged on `main`. Plan: [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md). Checklist: [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md).

**v1 constraint:** deploy **one API instance** until SSE multi-instance strategy is resolved (`SseHub` is in-memory).

---

## Architecture (v1)

```
Users / phones
    │
    ├─► CloudFront ──► S3 (static dist/)
    │
    └─► HTTPS ──► App Runner or ALB+ECS (API container :8080)
                      │
                      ├─► RDS PostgreSQL
                      ├─► S3 (Storage/ media)
                      └─► Secrets Manager (JWT, DB password, SeedAdmin)
```

---

## 0 — Naming and domains (decide once)

| Item | Staging example | Production example |
|------|-----------------|-------------------|
| Web | `staging.yourdomain.com` | `app.yourdomain.com` |
| API | `api.staging.yourdomain.com` | `api.yourdomain.com` |
| S3 web bucket | `commtrac-web-staging` | `commtrac-web-prod` |
| S3 media bucket | `commtrac-media-staging` | `commtrac-media-prod` |
| RDS identifier | `commtrac-staging` | `commtrac-prod` |

---

## 1 — RDS PostgreSQL

1. Create **RDS PostgreSQL 16** (db.t4g.small or larger for staging).
2. Database name: `commtrac`. User: `commtrac`. Store password in **Secrets Manager**.
3. Security group: allow **5432** from API security group only.
4. Enable automated backups; note snapshot ID before first prod cutover.

**Connection string (env var):**

```
Host=<rds-endpoint>;Port=5432;Database=commtrac;Username=commtrac;Password=<secret>
```

---

## 2 — S3 media bucket

1. Create bucket (e.g. `commtrac-media-staging`).
2. Block public access (API reads/writes via IAM role).
3. Optional lifecycle rules for old report shares.

**API config:**

```json
"Storage": {
  "Provider": "S3",
  "Bucket": "commtrac-media-staging",
  "Region": "us-east-1",
  "KeyPrefix": "commtrac"
}
```

4. Attach IAM policy to API task role: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on bucket + prefix.

---

## 3 — Secrets Manager

Store (minimum):

| Secret key | Notes |
|------------|--------|
| `Jwt__Key` | 32+ random chars |
| `ConnectionStrings__DefaultConnection` | RDS string |
| `SeedAdmin__Password` | First boot only |
| `Email__ResendApiKey` | If using Resend |

Map secrets to App Runner / ECS environment variables or use AWS SDK sidecar pattern.

**Never** commit these to git. Use `appsettings.Staging.json` / `appsettings.Production.json` as templates only.

---

## 4 — Database migrations (before API starts)

Production/Staging set `Database:RunMigrationsOnStartup=false`.

From CI or a one-off job (same network as RDS):

**PowerShell:**

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Staging"
$env:Database__Provider = "Postgres"
$env:ConnectionStrings__DefaultConnection = "<rds-connection-string>"
.\scripts\cloud-migrate.ps1
```

**Bash:**

```bash
export ASPNETCORE_ENVIRONMENT=Staging
export Database__Provider=Postgres
export ConnectionStrings__DefaultConnection="<rds-connection-string>"
./scripts/cloud-migrate.sh
```

Verify: connect to RDS; `__EFMigrationsHistory` populated.

---

## 5 — API container (App Runner recommended for v1 single instance)

### Build and push image

```bash
# repo root
docker build -t commtrac-api:latest .
# tag + push to ECR
```

### App Runner settings

| Setting | Value |
|---------|--------|
| Port | `8080` |
| Env | `ASPNETCORE_ENVIRONMENT=Staging` or `Production` |
| Env | `Database__Provider=Postgres` |
| Env | `Database__RunMigrationsOnStartup=false` |
| Env | `Storage__Provider=S3` |
| Env | `Storage__Bucket=...` |
| Env | `Cors__AllowedOrigins__0=https://staging.yourdomain.com` |
| Secrets | JWT, connection string, SeedAdmin password |

### Health check

- Path: `/api/health`
- Expect: `{ "status": "healthy", "database": "connected", "databaseProvider": "Postgres" }`

### SSE note

Before choosing App Runner long-term, run a **30+ minute dashboard session** on staging. If SSE drops silently, prefer **ALB + ECS/Fargate** with idle timeout ≥ 3600s.

---

## 6 — Web static hosting (S3 + CloudFront)

### Build web bundle

```bash
cp .env.staging.example .env.staging.local
# edit VITE_API_BASE=https://api.staging.yourdomain.com/api

npm run build:cloud-web:staging
# or production: npm run build:cloud-web
```

Output: `dist/`

### Deploy

1. Upload `dist/` to S3 web bucket (`aws s3 sync dist/ s3://commtrac-web-staging/ --delete`).
2. CloudFront origin → S3; default root `index.html`.
3. SPA routing: custom error 403/404 → `/index.html` (200).
4. ACM certificate on CloudFront for `staging.yourdomain.com`.
5. Route53 alias to CloudFront.

---

## 7 — Native apps (phone)

```bash
cp .env.staging.example .env.staging.local
# same VITE_API_BASE as web

npm run build:cloud-native:staging
```

- **iOS:** Xcode Archive → TestFlight (staging build first).
- **Android:** `./gradlew assembleRelease` (see `docs/MOBILE_BUILD.md`).

Store builds require **HTTPS** API URL.

---

## 8 — Staging verification (mandatory)

Run **[`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)** in full:

- Windows agent: web W1–W11 + automated gates
- Mac agent: phone P1–P8
- Sign-off block must say **Deploy approved: YES**

Do **not** promote to production until staging sign-off.

---

## 9 — Production cutover

1. RDS snapshot of staging (optional) or fresh prod RDS.
2. Repeat steps 1–7 with production names/secrets.
3. Run migrations job against prod RDS.
4. Deploy API container (single instance).
5. Deploy web `dist/` to prod CloudFront.
6. Ship phone builds pointing at prod API (staged rollout: TestFlight / internal track first).
7. Post-deploy smoke: health, admin login web + phone, one workflow path.

---

## 10 — Rollback

| Layer | Rollback |
|-------|----------|
| API | Redeploy previous ECR image tag |
| Web | Re-sync previous `dist/` artifact from CI |
| DB | Restore RDS snapshot (data loss since snapshot) |
| Phone | Previous store build / MDM package |

---

## Local parity (before AWS)

Test profiles without AWS account:

```bash
docker compose up -d postgres minio
# PostgresLocal + S3Local launch profiles — see server/README.md
```

---

## Related scripts

| Script | Purpose |
|--------|---------|
| `scripts/cloud-migrate.ps1` / `.sh` | EF migrations before instance boot |
| `scripts/build-cloud-web.mjs` | Web build + `VITE_API_BASE` validation |
| `scripts/build-cloud-native.mjs` | Web build + `cap sync` |
| `Dockerfile` | API container image |

## Related docs

- [`CLOUD_HOSTING_AWS_PLAN.md`](./CLOUD_HOSTING_AWS_PLAN.md)
- [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)
- [`WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md`](./WINDOWS_AGENT_CLOUD_HOSTING_PROMPT.md)
- [`IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md`](./IOS_MAC_AGENT_CLOUD_HOSTING_PROMPT.md)
- [`MOBILE_BUILD.md`](./MOBILE_BUILD.md)
