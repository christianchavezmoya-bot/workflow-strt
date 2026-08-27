# Strata NGO — AWS staging Step 2 (plain English)

**For:** Christian Chavez · AWS account `920154935299` · region **Sydney (`ap-southeast-2`)**  
**Domain:** `strata-ngo.com` · DNS: **Cloudflare**  
**App code:** merged on `main` (PR #305 — sync UX + bell restore)

This guide is Step 2 only: create AWS infrastructure. Step 3 (phone build) comes after the API has HTTPS.

---

## Names we will use

| Purpose | URL |
|---------|-----|
| Web app (browser) | `https://www.strata-ngo.com` |
| API (phone + web) | `https://api.staging.strata-ngo.com` |
| S3 media bucket | `strata-ngo-media-staging` (or add suffix if name taken) |
| S3 web bucket | `strata-ngo-web-staging` |
| RDS database | `commtrac` |

---

## Before you start

- [ ] Logged in as **Christian_admin** (not root)
- [ ] AWS region (top-right) = **Asia Pacific (Sydney)**
- [ ] Password manager ready for DB password, JWT key, admin password

---

## 2A — Secrets Manager (~10 min)

1. AWS Console → search **Secrets Manager** → **Store a new secret**
2. Choose **Other type of secret**
3. Create **one secret** named `commtrac/staging/app` with these key/value pairs:

| Key | Value |
|-----|--------|
| `Jwt__Key` | Random 32+ character string |
| `ConnectionStrings__DefaultConnection` | Leave blank for now — fill after RDS is created |
| `SeedAdmin__Password` | Strong password for first login |
| `SeedAdmin__Email` | `admin@StrataNgo.local` (optional override) |

4. **Store** → note the secret ARN

**Connection string format (after RDS):**

```
Host=YOUR-RDS-ENDPOINT.ap-southeast-2.rds.amazonaws.com;Port=5432;Database=commtrac;Username=commtrac;Password=YOUR_DB_PASSWORD
```

Edit the secret and paste the full connection string when RDS is ready.

---

## 2B — RDS PostgreSQL (~20–30 min wait)

1. AWS Console → **RDS** → **Create database**
2. Choose:
   - **Standard create**
   - Engine: **PostgreSQL 16**
   - Template: **Dev/Test** (cheaper for staging)
   - DB instance: **db.t4g.micro** or **db.t4g.small**
   - Identifier: `strata-ngo-staging`
   - Master username: `commtrac`
   - Master password: (same as in your secret / password manager)
   - Database name: `commtrac`
3. **Connectivity:**
   - VPC: default is OK for v1
   - **Public access: No**
   - VPC security group: create new e.g. `strata-ngo-rds-sg`
4. **Additional:** enable automated backups (7 days is fine)
5. **Create database** → wait until status = **Available**
6. Copy **Endpoint** (hostname only, no port path)

Update Secrets Manager `ConnectionStrings__DefaultConnection` with the connection string.

---

## 2C — S3 buckets (~5 min)

Create **two** buckets in **ap-southeast-2**:

### Media bucket (API uploads)

1. **S3** → **Create bucket**
2. Name: `strata-ngo-media-staging` (if taken, try `strata-ngo-media-staging-9201`)
3. Region: **ap-southeast-2**
4. **Block all public access** — ON
5. Create

### Web bucket (static React app)

1. Name: `strata-ngo-web-staging`
2. Same region and public access blocked
3. Create

---

## 2D — IAM role for API (S3 access)

App Runner needs permission to read/write the media bucket.

1. **IAM** → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **App Runner** → **App Runner instance role**
3. Attach policy: create inline policy (JSON):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::strata-ngo-media-staging",
        "arn:aws:s3:::strata-ngo-media-staging/*"
      ]
    }
  ]
}
```

4. Role name: `commtrac-staging-apprunner-s3`
5. Create

(Replace bucket name if you used a different one.)

---

## 2E — Build and push API Docker image

On your Mac (with Docker running), from the repo after `git pull origin main`:

```bash
# Login to ECR (one-time per session)
aws ecr create-repository --repository-name commtrac-api --region ap-southeast-2
# Follow AWS login instructions, then:

docker build -t commtrac-api:staging .
docker tag commtrac-api:staging YOUR_ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
docker push YOUR_ACCOUNT.dkr.ecr.ap-southeast-2.amazonaws.com/commtrac-api:staging
```

Replace `YOUR_ACCOUNT` with `920154935299`.

---

## 2F — Run database migrations (before API starts)

From your Mac (must reach RDS — use **RDS Query Editor**, **Session Manager bastion**, or temporarily allow your IP on the RDS security group):

```bash
export ASPNETCORE_ENVIRONMENT=Staging
export Database__Provider=Postgres
export ConnectionStrings__DefaultConnection="Host=...;Port=5432;Database=commtrac;Username=commtrac;Password=..."
export SeedProfile=StrataNgo
./scripts/cloud-migrate.sh
```

**Tip:** For first staging, easiest path is add your home IP to RDS security group inbound (5432) temporarily, run migrate, then remove the rule.

---

## 2G — App Runner service

1. **App Runner** → **Create service**
2. Source: **Container registry** → ECR → `commtrac-api:staging`
3. Port: **8080**
4. Instance role: `commtrac-staging-apprunner-s3`
5. **Environment variables:**

| Name | Value |
|------|--------|
| `ASPNETCORE_ENVIRONMENT` | `Staging` |
| `Database__Provider` | `Postgres` |
| `Database__RunMigrationsOnStartup` | `false` |
| `Storage__Provider` | `S3` |
| `Storage__Bucket` | `strata-ngo-media-staging` |
| `Storage__Region` | `ap-southeast-2` |
| `Storage__KeyPrefix` | `commtrac` |
| `Cors__AllowedOrigins__0` | `https://www.strata-ngo.com` |
| `Cors__AllowDeviceOrigins` | `true` |
| `SeedProfile` | `StrataNgo` |
| `Email__FrontendBaseUrl` | `https://www.strata-ngo.com` |

6. **Secrets** (from Secrets Manager `commtrac/staging/app`):
   - `Jwt__Key`
   - `ConnectionStrings__DefaultConnection`
   - `SeedAdmin__Password`

7. Health check path: `/api/health`
8. Create → wait until **Running**
9. Note the default App Runner URL (e.g. `xxxxx.ap-southeast-2.awsapprunner.com`)

**Test:** open `https://YOUR-APPRUNNER-URL/api/health` — expect `"database":"connected"`.

---

## 2H — Custom domain for API (Cloudflare)

1. **App Runner** → your service → **Custom domains** → add `api.staging.strata-ngo.com`
2. App Runner shows a **CNAME target** (validation + routing)
3. **Cloudflare** → `strata-ngo.com` → **DNS** → **Add record**
   - Type: **CNAME**
   - Name: `api.staging`
   - Target: (paste App Runner CNAME)
   - Proxy status: **DNS only** (grey cloud) for first test — orange cloud can break cert validation
4. Wait for App Runner domain status = **Active**
5. Test: `https://api.staging.strata-ngo.com/api/health`

---

## 2I — Web app (S3 + CloudFront) — can do after API works

```bash
cp .env.staging.strata-ngo.example .env.staging.local
npm run build:cloud-web:staging
aws s3 sync dist/ s3://strata-ngo-web-staging/ --delete --region ap-southeast-2
```

Then create CloudFront distribution → origin = web bucket → custom domain `staging.strata-ngo.com` → ACM cert → Cloudflare CNAME for `staging`.

(Full CloudFront steps: [`CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md`](./CLOUD_HOSTING_AWS_DEPLOY_RUNBOOK.md) §6.)

---

## 2J — Phone build (Step 3 — after API HTTPS works)

```bash
cp .env.staging.strata-ngo.example .env.staging.local
npm run build:cloud-native:staging
npx cap sync
# Xcode → install on iPhone
```

---

## Checklist — Step 2 done when

- [ ] RDS **Available** + migrations run
- [ ] S3 media bucket created
- [ ] App Runner **Running**
- [ ] `https://api.staging.strata-ngo.com/api/health` returns healthy + Postgres
- [ ] Web health (optional this pass): `staging.strata-ngo.com` loads login

---

## Push notifications (later)

Server push (lock-screen alerts) needs APNs + FCM keys in API config. **In-app bell** works via polling once the phone reaches the HTTPS API. Configure push after core staging is stable.

---

## Need help?

Reply with:
- RDS endpoint (hostname only)
- App Runner default URL
- Result of `/api/health`
- Any error screenshot

Next guide: Step 3 phone TestFlight / field test against staging.
