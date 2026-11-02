# Customer-signature waivers: who can close a run without the customer's signature

Applies from `main` `6e34de6f` (PR #388). It is deployed to staging (API `default-commtrac-api-ae2c:49`,
2026-11-02) and is **not yet in production**.

A waiver closes a completed run as **"Closed without customer signature"**
(`SignatureStatus = WaivedCustomer`) and marks the asset **Closed**. It's a customer-facing
sign-off decision, so the server only lets these people do it:

| Who | Can waive | Why |
|---|---|---|
| **Admin** | any live asset | manages sign-off |
| **Project Manager** | any live asset | same role that sends e-sign links and records paper completions |
| **A member of the project's team** | assets in that project | team membership is set by an Admin/PM |
| **The user named as the project's manager** | assets in that project | set by an Admin/PM |
| Anyone else (Installer, Supervisor, Viewer…) | **no** (HTTP 403) | |

## For installers
- You can tap **"Close asset run without customer signature"** only on projects where you're on
  the **project team**. Otherwise the app shows "Asset run could not be closed without customer
  signature." (the server answers 403). Ask your PM to add you to the team, or to close the run for
  you.
- Being **assigned to the asset**, or having **run the workflow**, is *not* enough on its own. Anyone
  can take an asset over by assigning it to themselves, and the app records the technician from
  the device, so neither can grant sign-off rights.
- A deleted asset or project can't be waived by anyone.

## For project managers
- **To let an installer close runs without a customer signature:** add them to the project team
  (Edit Project → the team-members field; its label can be renamed in settings). Only Admins and PMs can change the team or the project-manager
  field. Installers can't add themselves.
- **You can always waive yourself**, from the run, or with **Record paper completion → Waive
  customer signature**.
- **Every waiver is recorded** in the audit log (`AuditLogs`, action `customer_signature_waived`):
  who did it (user id and email), when (UTC), which run, asset and job, and the reason if one was
  given. The API accepts an optional `{ "reason": "…" }` (up to 300 characters); today's app doesn't
  send one yet. Refused attempts are recorded as `customer_signature_waive_denied`.

## Inspection imports (inspection-only projects)
Importing an inspection result auto-completes the asset's open runs and closes them with the
customer signature waived. The same rules apply:
- **If the uploader isn't allowed to waive for that asset,** the import is still saved, but nothing
  is completed. It waits for a PM to assign or reprocess it.
- **If the asset or any of its open runs has an unresolved blocking issue,** nothing is completed
  for anyone, PMs included, until the issue is resolved.

## API reference
| Path | Who | Result for others |
|---|---|---|
| `POST /api/asset-workflow-runs/{id}/waive-customer-signature` (body optional: `{ "reason" }`) | Admin, PM, project team member, named project manager | **403** (the run's state is not revealed); **409** for Admin/PM if the asset or project is missing or deleted |
| `POST /api/inspection-imports`, `/upload` (auto-complete) | same | import saved, nothing completed; denial audited |
| `POST /api/project-assets/{id}/record-paper-completion` with `waiveCustomerSignature` | Admin, PM | 403 (role check) |

Implementation: `server/Commtrac.Api/Authorization/CustomerWaiverPolicy.cs`. Tests:
`server/Commtrac.Api.Tests/CustomerWaiverAuthorizationTests.cs`.

## Before rolling out to production
Count the runs currently awaiting a customer signature that, after this change, only an Admin or PM
could waive, because their project has no team members and no project manager. The query is
read-only and works on SQLite and Postgres:

```sql
SELECT COUNT(*) FROM "AssetWorkflowRuns" r
JOIN "ProjectAssets" a ON a."Id" = r."AssetId"
JOIN "Projects" p ON p."Id" = a."ProjectId"
WHERE r."SignatureStatus" = 'PendingCustomer' AND r."IsLocked" = 1
  AND COALESCE(p."ProjectManager", '') = '' AND COALESCE(p."TeamMemberIdsJson", '[]') = '[]';
```

For active projects where installers will need to waive, add those installers to the project
team before the release.
