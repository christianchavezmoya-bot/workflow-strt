# Commtrac Codex 915 — Mobile Agent Prompt
**For: iOS (Swift / Capacitor) and Android (Kotlin / Capacitor) development only**
**Last updated: 2026-05-27**

---

## PRIME DIRECTIVE — READ FIRST

```
╔══════════════════════════════════════════════════════════════╗
║  RULE #1 — IMMUTABLE                                         ║
║                                                              ║
║  NEVER modify, create, or delete any file inside:           ║
║    • server/          (ASP.NET Core API backend)             ║
║    • src/             (React web frontend)                   ║
║    • Any .ts/.tsx/.cs file in the root or existing folders   ║
║                                                              ║
║  The API backend and web frontend are the single source      ║
║  of truth. Your job is to CONSUME the API, not change it.    ║
║                                                              ║
║  If the API doesn't expose something you need → report it.  ║
║  Do NOT work around it by adding backend code.              ║
╚══════════════════════════════════════════════════════════════╝
```

Your scope is **iOS and Android native/hybrid apps only**:
- Swift / SwiftUI / Objective-C for iOS native layers
- Kotlin / Jetpack Compose for Android native layers
- Capacitor plugins and bridge code in `ios/` and `android/` folders
- Any React Native or Flutter wrapper if that direction is chosen

---

## 1. What This App Is

**Commtrac Codex 915** is a project and asset management platform for field operations (installation, commissioning, inspection, repair of industrial equipment).

Key workflows for mobile users:
1. **Open a project** → view assets assigned to it
2. **Run a workflow** on an asset (installation checklist, inspection, etc.) — step by step, capture photos, signatures, measurements
3. **Log issues** against assets or runs
4. **Upload inspection JSON** for INSPECTION_ONLY assets
5. **Sign off** on completed runs (installer + customer)
6. **View run history and evidence**

Mobile users are primarily field technicians (role: `Engineer` or `Installer`) and occasionally Project Managers.

---

## 2. API Backend

### 2.1 Base URL & Auth

```
Base URL:  http://<server-ip>:4000/api
Health:    GET /api/health  → 200 OK (no auth needed — use as ping)

Auth:
  POST /api/auth/login
  Body:    { "email": "user@example.com", "password": "..." }
  Returns: { "token": "eyJ...", "user": { "id", "email", "fullName", "role", "office" } }

All other endpoints:
  Header:  Authorization: Bearer <token>

Token refresh (silent, before expiry):
  POST /api/auth/refresh
  Body:    { "token": "<current-token>" }
  Returns: { "token": "<new-token>" }

Token lifetime: 720 minutes (12 hours)
Refresh strategy: refresh 30 minutes before expiry
```

### 2.2 Roles

| Role | Mobile capabilities |
|---|---|
| `Admin` | Full access |
| `Project Manager` | Full project/asset/workflow access |
| `Engineer` | Own assigned jobs, run workflows, log issues |
| `Installer` | Same as Engineer |
| `Viewer` | Read-only |

### 2.3 HTTP Conventions

- All responses: `Content-Type: application/json`
- `200 OK` — success (GET, PUT, PATCH)
- `201 Created` — success (POST create)
- `204 No Content` — success (DELETE)
- `401` — expired/invalid token → redirect to login
- `403` — insufficient role
- `404` — resource not found
- `422` — business rule violation (body: `{ "error": "message" }`)
- `400` — bad request

---

## 3. Core API Endpoints (Mobile Priority)

### 3.1 Projects

```
GET    /api/projects                    List all projects (filtered by office if header set)
GET    /api/projects/{id}               Single project
POST   /api/projects                    Create (PM/Admin only)
PUT    /api/projects/{id}               Update (PM/Admin only)
```

**ProjectDto shape:**
```json
{
  "id": "string",
  "customerName": "string",
  "customerId": "string",
  "siteId": "string|null",
  "siteName": "string|null",
  "jobNumber": "string",
  "purchaseOrderNumber": "string",
  "description": "string",
  "startDate": "string",
  "finishDate": "string",
  "office": "string",
  "officeId": "string|null",
  "region": "string|null",
  "projectType": "Internal|External",
  "status": "Draft|In Planning|Pending Approval|Approved|In Progress|On Hold|Completed|Cancelled",
  "approvalDecision": "string|null",
  "isInstallationProject": true,
  "installationMode": "string|null",
  "workflowMode": "INSTALLATION_ONLY|INSPECTION_ONLY|MIXED",
  "projectManager": "string|null",
  "contractValue": null,
  "probabilityStage": null,
  "productIds": ["string"],
  "productFeatureValues": {},
  "assetCount": 0,
  "teamMemberIds": ["user-id-1", "user-id-2"]   // ← NEW 2026-05-27: project team
}
```

### 3.2 Project Assets

```
GET    /api/project-assets?projectId={id}&workflowType={type}   List assets
GET    /api/project-assets/{id}                                  Single asset
POST   /api/project-assets                                       Create asset
PUT    /api/project-assets/{id}                                  Update asset
DELETE /api/project-assets/{id}                                  Delete asset
PATCH  /api/project-assets/{id}/status                          Update status only
```

**Key fields in asset response:**
```json
{
  "id": "string",
  "projectId": "string",
  "assetTag": "string",
  "assetName": "string",
  "serialNumber": "string|null",
  "assetModel": "string|null",
  "siteName": "string|null",
  "assignedTech": "string|null",
  "status": "NotStarted|InProgress|Complete|OnHold|Cancelled",
  "workflowSummary": {
    "hasWorkflow": true,
    "evidenceStatus": "Pending|Running|Paused|Complete|MissingData",
    "requiredItems": 5,
    "completedItems": 5,
    "missingItems": 0,
    "latestRunId": "string|null",
    "latestRunStatus": "string|null",
    "isLocked": true,
    "signatureStatus": "string|null",
    "hasOpenIssues": false,
    "startedAt": "ISO8601|null",
    "completedAt": "ISO8601|null"
  }
}
```

### 3.3 Workflow Types

```
GET  /api/workflow-types    List all workflow types
```

Pre-seeded types (IDs are stable):

| id | name |
|---|---|
| `wftype-installation` | Installation |
| `wftype-commissioning` | Commissioning |
| `wftype-inspection` | Inspection |
| `wftype-repair` | Repair |
| `wftype-other` | Other |

### 3.4 Workflow Configs (Builder output)

```
GET  /api/workflow-configs                      List all configs
GET  /api/workflow-configs/{id}                 Single config
```

**WorkflowConfig shape (simplified):**
```json
{
  "id": "string",
  "name": "string",
  "status": "Draft|Published|Archived",
  "workflowTypeId": "wftype-installation",
  "configType": "Installation",
  "stepsJson": "[...]",
  "featureSelectionsJson": "[...]"
}
```

**Steps JSON structure** (parsed from `stepsJson`):
```json
[
  {
    "id": "step-uuid",
    "order": 1,
    "title": "Pre-Installation Check",
    "description": "...",
    "inputs": [
      {
        "id": "inp-uuid",
        "type": "checkbox|text|number|choice|photo|video|signature|note|scan|date|component|user-select",
        "label": "Work area is clear",
        "required": true,
        "options": ["Option A", "Option B"],    // for "choice" type only
        "subFields": [{ "id": "sf-1", "name": "Serial No" }]  // for "component" type only
      }
    ],
    "captureFields": [
      {
        "id": "cf-uuid",
        "key": "serialNumber",
        "label": "Serial Number",
        "type": "text|number|scan|date",
        "required": true,
        "unit": "V"
      }
    ]
  }
]
```

**`user-select` input type** (added 2026-05-27):
- Label auto-defaults to "Installed By" (Installation) or "Inspected By" (Inspection)
- At runtime: populate with `project.teamMemberIds` → resolve names from `/api/users`
- If team is empty: fall back to all active users from `/api/users`
- Store selected value as the person's **full name** (plain string, not an ID)

### 3.5 Asset Workflow Assignments

```
GET  /api/asset-workflow-assignments?assetId={id}    Assignments for an asset
POST /api/asset-workflow-assignments                  Assign config to asset
DELETE /api/asset-workflow-assignments/{id}           Remove assignment
```

**AssignmentDto:**
```json
{
  "id": "string",
  "assetId": "string",
  "workflowConfigId": "string",
  "workflowTypeId": "string",
  "assignedAt": "ISO8601"
}
```

### 3.6 Workflow Runs (Execute a workflow)

```
POST   /api/asset-workflow-runs/start              Start a run
PATCH  /api/asset-workflow-runs/{id}/step          Save step progress
POST   /api/asset-workflow-runs/{id}/complete      Lock and complete a run
POST   /api/asset-workflow-runs/{id}/pause         Pause a run
GET    /api/asset-workflow-runs?assetId={id}       Run history for asset
GET    /api/asset-workflow-runs/{id}               Single run
```

**Start run body:**
```json
{
  "assetId": "string",
  "workflowConfigId": "string",
  "startedBy": "string"
}
```

**Step save body (PATCH /step):**
```json
{
  "stepId": "string",
  "values": { "input-id": "captured-value" },
  "completedAt": "ISO8601"
}
```

**Step result values by input type:**

| Input type | Value stored |
|---|---|
| `text` | Plain string |
| `number` | Numeric string e.g. `"24.5"` |
| `checkbox` | `"true"` or `""` |
| `choice` | Selected option string |
| `note` | Multiline string |
| `date` | `"YYYY-MM-DD"` |
| `scan` | Scanned string |
| `photo` / `video` | JSON array of base64 data URLs: `["data:image/jpeg;base64,..."]` |
| `signature` | Base64 data URL: `"data:image/png;base64,..."` |
| `component` | JSON object: `{"sf-id": "value", ...}` |
| `user-select` | Full name string e.g. `"John Smith"` |

**Run response shape:**
```json
{
  "id": "string",
  "assetId": "string",
  "workflowConfigId": "string",
  "status": "InProgress|Paused|Complete",
  "isLocked": false,
  "startedAt": "ISO8601",
  "completedAt": "ISO8601|null",
  "stepResultsJson": "[{\"stepId\":\"...\",\"values\":{...},\"completedAt\":\"...\"}]",
  "workflowSnapshotJson": "{\"stepsJson\":\"[...]\"}",
  "issuesJson": "[...]",
  "signatureStatus": "None|AwaitingInstaller|AwaitingCustomer|Complete"
}
```

### 3.7 Issues

```
GET    /api/issues?projectId={id}           Issues for a project
GET    /api/issues?assetId={id}             Issues for an asset
POST   /api/issues                          Create issue
PUT    /api/issues/{id}                     Update issue
DELETE /api/issues/{id}                     Delete issue
```

**Issue body:**
```json
{
  "projectId": "string",
  "assetId": "string|null",
  "runId": "string|null",
  "title": "string",
  "description": "string",
  "issueType": "string",
  "isBlocking": false,
  "status": "Open|InProgress|Resolved|Closed",
  "priority": "Low|Medium|High|Critical",
  "reportedBy": "string"
}
```

### 3.8 Inspection Imports

```
GET    /api/inspection-imports?assetId={id}       List imports for an asset
POST   /api/inspection-imports                     Create import (paste JSON)
POST   /api/inspection-imports/upload              Upload JSON file (multipart)
POST   /api/inspection-imports/{id}/reprocess      Re-process a MAPPED import (PM/Admin)
POST   /api/inspection-imports/{id}/mark-failed    Mark as failed
DELETE /api/inspection-imports/{id}                Delete import
GET    /api/inspection-imports/{id}/raw            Get raw JSON text
```

**Import statuses:** `RECEIVED → NEEDS_ASSIGNMENT → MAPPED → FAILED`

**Create body:**
```json
{
  "source": "LOCAL|ONEDRIVE|EMAIL|API|generic-kv",
  "rawJson": "{...canonical inspection JSON...}",
  "projectId": "string",
  "assetId": "string",
  "uploadedBy": "user@email.com"
}
```

**Canonical JSON format:**
```json
{
  "inspectionDate": "2026-05-01T10:00:00Z",
  "technicianName": "John Smith",
  "assetTag": "RC-001",
  "notes": "All checks passed",
  "results": [
    {
      "checkId": "chk-001",
      "label": "Voltage",
      "value": "24.5",
      "unit": "V",
      "pass": true,
      "notes": ""
    }
  ]
}
```

When successfully imported for an INSPECTION_ONLY project, the backend auto-creates a locked `AssetWorkflowRun` and sets `evidenceStatus = "Complete"`.

### 3.9 Users

```
GET  /api/users          List all users (Admin/PM)
GET  /api/users/{id}     Single user
```

**User shape:**
```json
{
  "id": "string",
  "email": "string",
  "fullName": "string",
  "role": "Admin|Project Manager|Engineer|Viewer|Installer|Supervisor|Customer",
  "office": "string",
  "isActive": true
}
```

Use this endpoint to resolve `teamMemberIds` → names for the `user-select` input picker.

### 3.10 Signatures

```
GET  /api/signature-tokens?runId={id}    Signature tokens for a run
POST /api/signature-tokens               Generate token (returns URL for external signing)
```

Customers sign via a public URL: `GET /sign/{tokenId}` (no auth required).

### 3.11 Dashboard

```
GET  /api/dashboard/evidence?projectId={id}    Evidence completeness for a project
GET  /api/dashboard/workflow-health            Workflow health across all projects
```

---

## 4. Offline-First Architecture

### 4.1 Strategy

```
Online:
  → All reads go to API
  → All writes go to API immediately
  → Cache every GET response locally (keyed by URL)

Offline:
  → Reads served from local cache
  → Writes queued locally (pending_actions store)
  → On reconnect: flush queue in order → re-fetch affected resources

Conflict resolution:
  → API is source of truth
  → Last-write-wins for non-critical fields
  → Step results: merge by stepId (don't overwrite later server state with older local state)
```

### 4.2 Data to Cache Locally

Priority order for offline use:

| Data | Endpoint | Refresh interval |
|---|---|---|
| Current user profile | `/api/auth/login` response | On login |
| Projects list | `/api/projects` | On app foreground |
| Assets for active project | `/api/project-assets?projectId=x` | On project open |
| Workflow assignments | `/api/asset-workflow-assignments?assetId=x` | On asset open |
| Workflow config (steps) | `/api/workflow-configs/{id}` | On assignment load |
| Active run state | `/api/asset-workflow-runs/{id}` | On step save |
| Users list (for team picker) | `/api/users` | Daily / on login |
| Workflow types | `/api/workflow-types` | On login (rarely changes) |

### 4.3 Pending Actions Queue Schema

Each queued action:
```json
{
  "id": "local-uuid",
  "method": "POST|PUT|PATCH|DELETE",
  "url": "/api/asset-workflow-runs/{id}/step",
  "body": { ... },
  "headers": { "Authorization": "Bearer ..." },
  "createdAt": "ISO8601",
  "retryCount": 0,
  "assetId": "string"
}
```

Flush order: chronological by `createdAt`. On 4xx error (except 409): discard and log. On 5xx or network error: retry with exponential backoff (max 3 retries, then park).

### 4.4 Sync Status UI

Show a sync indicator whenever `pendingActions.length > 0`:
- Amber/yellow badge = pending writes
- Green = all synced
- Red = sync failed (show count of failed actions)

---

## 5. Key Workflows — Step-by-Step for Mobile

### 5.1 Run a Workflow (Online)

```
1. GET /api/projects → user picks project
2. GET /api/project-assets?projectId={id} → user picks asset
3. GET /api/asset-workflow-assignments?assetId={id} → get assignments
4. GET /api/workflow-configs/{workflowConfigId} → load steps
5. POST /api/asset-workflow-runs/start → create run, get runId
6. For each step:
   a. Display step.inputs + step.captureFields to user
   b. User fills values
   c. PATCH /api/asset-workflow-runs/{runId}/step  { stepId, values, completedAt }
7. POST /api/asset-workflow-runs/{runId}/complete → lock run
8. If signature required: POST /api/signature-tokens { runId } → show QR or send link
```

### 5.2 Run a Workflow (Offline)

```
1–4: Serve from local cache
5. Generate local runId (UUID), save to pending_actions queue
6. Save each step to local run state + pending_actions queue
7. On reconnect: flush queue in order
   - POST /start executes first → server returns real runId
   - All subsequent step PATCHes and complete use the real runId
   - Map localRunId → serverRunId after step 5 response
```

### 5.3 User-Select Input (Team Member Picker)

```
1. Load project.teamMemberIds from cached project
2. GET /api/users → resolve IDs to names (cache this list)
3. If teamMemberIds is empty: show all active users as fallback
4. User selects a person → store their fullName as the input value
5. Submit as part of step values: { "input-id": "John Smith" }
```

### 5.4 Upload Inspection JSON

```
POST /api/inspection-imports/upload
Content-Type: multipart/form-data

Fields:
  file       = <JSON file>
  projectId  = "string"
  assetId    = "string"
  source     = "LOCAL"
  uploadedBy = "user@email.com"

On success: status 201, import record returned
Backend auto-creates a locked workflow run for INSPECTION_ONLY assets
```

---

## 6. Important Business Rules

1. **WorkflowMode** — every project has one of: `INSTALLATION_ONLY`, `INSPECTION_ONLY`, `MIXED`. Assets in `INSPECTION_ONLY` projects get their run auto-created when an inspection JSON is imported.

2. **Run locking** — once `isLocked = true` (after `/complete`), step values cannot be changed through normal flow. Use `/reprocess` on an import to update an existing locked run's step data.

3. **Blocking issues** — if an asset has open issues with `isBlocking = true`, the API returns `422` when attempting to complete the run. Mobile must surface these before allowing completion.

4. **Evidence status** — the `workflowSummary.evidenceStatus` on each asset tells you the current state at a glance. Use this for list-view indicators; don't recompute from run data on the client.

5. **Imported step results** — step results created by inspection import use generic keys (`value`, `unit`, `pass`, `label`, `notes`) instead of workflow input IDs. Don't flag these as "missing" — the evidence engine already handles this correctly server-side.

6. **Signature flow** — runs have `signatureStatus`: `None → AwaitingInstaller → AwaitingCustomer → Complete`. A signature token URL is sent to the customer for remote signing (no app needed on customer side).

7. **Project team** — `project.teamMemberIds` is a list of user IDs. Resolve against `/api/users` to get names. This is the population for `user-select` step inputs.

---

## 7. Step Input Rendering Reference

| Type | UI Control | Value format |
|---|---|---|
| `text` | Text field | Plain string |
| `number` | Numeric input | `"24.5"` |
| `checkbox` | Toggle/switch | `"true"` or `""` |
| `choice` | Button group / segmented control | Selected option string |
| `note` | Multi-line text area | Plain string |
| `date` | Date picker | `"YYYY-MM-DD"` |
| `scan` | Barcode/QR scanner + text fallback | Scanned string |
| `photo` | Camera capture | `["data:image/jpeg;base64,..."]` JSON array |
| `video` | Video capture | `["data:video/mp4;base64,..."]` JSON array |
| `signature` | Touch signature canvas | `"data:image/png;base64,..."` |
| `component` | Group of sub-fields | `{"sf-id":"value"}` JSON object |
| `user-select` | Picker from project team | Full name string `"John Smith"` |

---

## 8. File Upload (Photos / Videos)

- Photos and videos are embedded as base64 data URLs directly in the step result JSON
- No separate upload endpoint needed for step media
- For document uploads: `POST /api/documents` with `multipart/form-data`
- For inspection JSON file upload: `POST /api/inspection-imports/upload` with `multipart/form-data`

---

## 9. Error Handling

```
401 → Token expired → POST /api/auth/refresh → retry once → if fails, logout + redirect login
403 → Show "Access denied" (do not retry)
404 → Resource gone → remove from local cache
422 → Show business rule error message from body.error
5xx → Queue for retry (offline strategy applies)
Network timeout → Queue for retry
```

---

## 10. DO NOT / NEVER

- ❌ Never modify `server/` files
- ❌ Never modify `src/` files
- ❌ Never add new API endpoints — report the gap instead
- ❌ Never store passwords or raw tokens in plaintext local storage
- ❌ Never skip JWT on API calls
- ❌ Never assume the user is online — always handle the offline case
- ❌ Never hardcode server IPs — use a configurable base URL setting
- ❌ Never display raw stack traces to users
- ✅ Always cache GET responses locally
- ✅ Always queue writes when offline
- ✅ Always sync on reconnect
- ✅ Always resolve `teamMemberIds` to names before showing the user-select picker
- ✅ Always check `evidenceStatus` from `workflowSummary` — don't recompute on mobile
