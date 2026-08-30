# ECS S3 task role fix — staging upload blocker

> **Status: RESOLVED (2026-08-30)** — IAM role `commtrac-staging-ecs-s3` live on ECS rev **:22**. Christian confirmed PASS: asset-row 3-document upload + Documents page upload. **Do not change upload/backend/S3 logic further** unless a new defect is reported.

**Symptom (Christian, 2026-08-30):** Document upload, asset document attach, and Closed & Signed Assets → Save PDF all fail with:

> File storage unavailable: Unable to get IAM security credentials from EC2 Instance Metadata Service.

**Root cause:** Staging API uses `Storage:Provider=S3` (`appsettings.Staging.json` → bucket `strata-ngo-media-staging`), but the ECS task definition has **no task role**. The execution role (`ecsTaskExecutionRole`) pulls images and reads Secrets Manager only — it does **not** grant S3 access at runtime. The AWS SDK credential chain falls through to EC2 instance metadata, which is unavailable on Fargate without a task role.

**PR #321 code is working:** The backend now surfaces this error as HTTP 503 with a readable message (previously opaque 500). Multipart boundary fixes on the frontend are unrelated — uploads cannot succeed until IAM is fixed.

**Not a frontend merge blocker for IAM:** Fix infrastructure first; Christian retests uploads; no app code change required for this specific failure.

---

## Who does what

| Step | Owner | Why |
|------|--------|-----|
| Create IAM role + S3 policy | **Christian** (AWS Console admin) | `StrataClaudeAgentRole` is **denied** `iam:CreateRole` |
| Register ECS task def with `taskRoleArn` | **Claude Code Mac** (`strata-agent`) | Allowed: `ecs:RegisterTaskDefinition`, `ecs:UpdateService` |
| Force ECS redeploy + verify upload | **Claude Code Mac** | Same deploy workflow as API releases |
| Retest uploads 1–4 | **Christian** | PASS/FAIL only |

---

## Step 1 — Christian: create task role (Console)

1. **IAM** → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **Elastic Container Service** → **Elastic Container Service Task**
3. Skip permission policies on the wizard (add inline next)
4. Role name: **`commtrac-staging-ecs-s3`**
5. After create: **Add permissions** → **Create inline policy** → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MediaBucketReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::strata-ngo-media-staging",
        "arn:aws:s3:::strata-ngo-media-staging/*"
      ]
    }
  ]
}
```

6. Policy name: `CommtracStagingS3Media`
7. Copy the role ARN, e.g. `arn:aws:iam::920154935299:role/commtrac-staging-ecs-s3`

---

## Step 2 — Mac agent: attach role to ECS task definition

Use profile **`strata-agent`** only.

1. Fetch current task definition (family `default-commtrac-api-ae2c`):

```bash
aws ecs describe-task-definition \
  --task-definition default-commtrac-api-ae2c \
  --profile strata-agent \
  --region ap-southeast-2 \
  --query taskDefinition > /tmp/task-def.json
```

2. Edit `/tmp/task-def.json`:
   - Remove read-only fields: `taskDefinitionArn`, `revision`, `status`, `requiresAttributes`, `compatibilities`, `registeredAt`, `registeredBy`
   - Set `"taskRoleArn": "arn:aws:iam::920154935299:role/commtrac-staging-ecs-s3"`
   - Leave **`executionRoleArn`** as `ecsTaskExecutionRole` (unchanged)

3. Register new revision:

```bash
aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def.json \
  --profile strata-agent \
  --region ap-southeast-2
```

4. Update service (same as normal deploy):

```bash
aws ecs update-service \
  --cluster default \
  --service commtrac-api-ae2c \
  --task-definition default-commtrac-api-ae2c:<NEW_REV> \
  --force-new-deployment \
  --profile strata-agent \
  --region ap-southeast-2
```

5. Wait for deployment **COMPLETED**, target **Healthy**, `/api/health` → 200.
6. Sync ALB priority-10 rule if canary tg mismatch recurs (see `CLAUDE_CODE_AWS_HANDOFF.md`).

---

## Step 3 — Verify (Mac agent before Christian)

```bash
# Health still OK
curl -sf https://api.staging.strata-ngo.com/api/health | jq .

# CloudWatch: tail startup — expect "[Storage] Provider: S3 (bucket=strata-ngo-media-staging)"
# After Christian uploads: no "Unable to get IAM security credentials" in logs
```

Optional API smoke (with valid JWT):

```bash
# POST multipart to /api/documents/upload — expect 201, not 503
```

---

## Step 4 — Christian retest checklist

1. Asset row **Documents (n/3)** → upload PDF → PASS/FAIL  
2. **Documents** page → Upload New → PASS/FAIL  
3. Admin header → **no triple clocks** (web `www.strata-ngo.com`, hard refresh)  
4. Project Assets header → **one clock max**  
5. Closed & Signed Assets → **Save PDF** → PASS/FAIL (same S3 path as uploads)  
6. iPhone debug 404 storm → **requires native rebuild** (see below); web-only verification is not enough for phone

---

## iPhone native bundle (separate from IAM)

The stale-asset 404 fix (PR #321, `bde2fa75`) is in the **web** bundle (`index-4daJy4H_.js`). Christian's debug snapshot still shows `"Request failed with status code 404"` — the **old** axios message — proving the installed Capacitor app has not been rebuilt.

After IAM fix + web deploy:

```bash
npm run build
npx cap sync ios
# Xcode → install on Christian's phone
```

Or Christian tests phone-debug fix in **Safari** against `https://www.strata-ngo.com` (not the installed app).

---

## Update handoff doc

After role is live, change `docs/CLAUDE_CODE_AWS_HANDOFF.md`:

| Task role | `arn:aws:iam::920154935299:role/commtrac-staging-ecs-s3` |

Remove the incorrect "Task role: None" line.
