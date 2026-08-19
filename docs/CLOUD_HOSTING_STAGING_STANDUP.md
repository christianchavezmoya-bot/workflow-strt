# Staging standup — local Docker + AWS

**Execution plan (phases, gates, seed): [`CLOUD_MOVE_EXECUTION_PLAN.md`](./CLOUD_MOVE_EXECUTION_PLAN.md)** · Seed wishlist: [`CLOUD_MOVE_SEED_WISHLIST.md`](./CLOUD_MOVE_SEED_WISHLIST.md)

Two paths to staging. **Run local Docker first** to validate cloud profiles before paying for AWS.

| Path | When | Command / doc |
|------|------|----------------|
| **Local Docker staging** | Now — parity test on your PC | `./scripts/standup-staging.sh` or `.\scripts\standup-staging.ps1` |
| **AWS staging** | After local Docker passes | [`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md) |

Pre-deploy gate (web + phone): [`CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md`](./CLOUD_HOSTING_PRE_DEPLOY_CHECKLIST.md)

**Windows field agent:** copy [`WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md`](./WINDOWS_AGENT_DOCKER_STAGING_PROMPT.md) (PROMPT START → PROMPT END) into Cursor on your PC.

**Mac field agent:** copy [`MAC_AGENT_DOCKER_STAGING_PROMPT.md`](./MAC_AGENT_DOCKER_STAGING_PROMPT.md) (**PROMPT START → PROMPT END**) into Cursor on your Mac. The agent runs all terminal steps itself, including `git pull --no-rebase origin main` when branches diverge.

---

## 1 — Local Docker staging (recommended first)

**Requires:** Docker Desktop (Windows or Mac).

### Quick start

**Windows (PowerShell):**

```powershell
cd C:\path\to\workflow-strt
git pull origin main
.\scripts\standup-staging.ps1 -BuildWeb
```

**Mac/Linux:**

```bash
cd ~/path/to/workflow-strt
git pull origin main
chmod +x scripts/standup-staging.sh
./scripts/standup-staging.sh --build-web
```

### What starts

| Service | URL | Notes |
|---------|-----|--------|
| API | http://localhost:8080/api | Postgres + S3 (MinIO); env `StagingDocker` |
| Health | http://localhost:8080/api/health | Expect `databaseProvider: Postgres` |
| MinIO console | http://localhost:9001 | `commtrac` / `commtrac_dev` |
| Web (with `--build-web`) | http://localhost:5174 | nginx serving `dist/` |

**Login:** `admin@StrataNgo.local` / `Admin123!` (PM: `project.manager@StrataNgo.local` / `Pm123!`)

Fresh Docker volume seeds: 2 offices, 2 customers (BHP/Mining), 4 divisions (3 Strata + HazardAvert-Coal), **1 product (AIM-100 under Strata AI, description “AI Proximity Detection”)**, `Chambers_default` workflow. No tips/documents. No starter project. Admin/PM require password change on first login.

**If standup fails on Postgres migrations** (e.g. `InvalidCastException`, `relation "lowercase" does not exist`): pull latest `main`, discard local migration edits, then `docker compose -f docker-compose.staging.yml down -v` and re-run standup — partial migration state requires a fresh volume.

### Web without nginx

```powershell
copy .env.staging.docker.example .env.staging.local
# VITE_API_BASE=http://localhost:8080/api
npm run dev
# browse http://localhost:5173
```

### Teardown

```bash
docker compose -f docker-compose.staging.yml down
# add -v to wipe postgres/minio data
```

---

## 2 — Verify staging (before AWS)

Run checklist sections against local Docker URLs:

1. **Automated:** `dotnet test`, `npm run build:cloud-web:staging`
2. **Web W1–W11** on http://localhost:5174 (or :5173 dev)
3. **Phone P1–P8** — point native build at `http://<LAN-IP>:8080/api` (API container must bind LAN; for phone use Windows LAN IP instead of localhost in `.env.production.local`)

For phone testing against Docker API from LAN, ensure Docker publishes `8080:8080` and Windows firewall allows port 8080.

---

## 3 — AWS staging (after local pass)

Follow **[`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md)** sections 1–8:

1. RDS Postgres  
2. S3 media bucket  
3. Secrets Manager  
4. `scripts/cloud-migrate.ps1`  
5. App Runner (single instance)  
6. CloudFront + S3 web  
7. `npm run build:cloud-web:staging` with real staging domain  
8. **Pre-deploy checklist** on `https://staging.yourdomain.com`

---

## Files reference

| File | Purpose |
|------|---------|
| `docker-compose.staging.yml` | Postgres, MinIO, API, optional nginx |
| `appsettings.StagingDocker.json` | In-container staging config |
| `.env.staging.docker.example` | Web build API URL for local Docker |
| `scripts/standup-staging.ps1` / `.sh` | One-command standup |
