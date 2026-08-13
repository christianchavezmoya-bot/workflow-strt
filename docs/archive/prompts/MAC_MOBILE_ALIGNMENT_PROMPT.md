# Commtrac Codex 915 - Mac Mobile Alignment Prompt
**For: Mac-based iOS / Capacitor / Android mobile agent work**
**Last updated: 2026-06-07**

Use this prompt when working from the Mac side to align the phone apps with the current backend and frontend behavior already implemented in the main repository.

---

## Prime Directive

You are working on the mobile app layer only.

Do not modify:
- `server/`
- `src/`
- existing `.ts`, `.tsx`, or `.cs` files outside mobile-native scope

The backend API and the React web app are the source of truth.
Your job is to align the mobile app with them, not to redesign the contract.

If the mobile app needs data that is not exposed by the API, report the gap.
Do not invent a parallel backend contract.

---

## Current Verified State

These points were verified in the current repo and should be treated as the latest aligned behavior:

1. The correct backend must run on `http://<host>:4000/api`.
2. The backend must be started with:
   `dotnet run --project server/Commtrac.Api/Commtrac.Api.csproj --launch-profile http`
3. `GET /api/health` returns `200`.
4. `GET /api/project-assets/dashboard-workspace` exists on the current backend.
5. The web frontend no longer boots into the old fake demo PM identity (`u-100`).
6. Installer dashboard assignment data is now loading from real backend data.
7. The PM inspection summary card in the web dashboard was relabeled from `Inspections` to `Inspection Inbox` because it is summary scope, not purely personal-assignment scope.

---

## Important Frontend/Backend Alignment Notes

### 1. Personal workspace vs summary scope

There are two different inspection concepts already present in the web app:

- Personal inspection workspace:
  - uses `GET /api/project-assets/dashboard-workspace`
  - returns:
    - `currentInstalls`
    - `currentInspections`
    - `installHistory`
    - `inspectionHistory`
  - this is the user-specific "my work" dataset

- Inspection summary / inbox signals:
  - uses:
    - `GET /api/asset-workflow-runs?workflowType=Inspection`
    - `GET /api/inspection-imports?status=NEEDS_ASSIGNMENT`
    - `GET /api/inspection-imports?status=FAILED`
  - this is broader summary data, especially for PM/Admin dashboards

Do not merge these concepts by accident in mobile.
If mobile shows a "My Inspections" screen, it should use the personal workspace data.
If mobile shows inspection inbox health or summary badges, it should use the summary endpoints.

### 2. Project team support is live

`ProjectDto.teamMemberIds` is now part of the contract.

Use it for:
- project team display
- `user-select` workflow inputs

Resolve user IDs through:
- `GET /api/users`

Store the selected value as the person's full name string, not the user ID.

### 3. Inspection-only flows are real

Projects can use:
- `INSTALLATION_ONLY`
- `INSPECTION_ONLY`
- `MIXED`

For `INSPECTION_ONLY`:
- inspection JSON import can auto-create a locked workflow run
- evidence may already be complete without a manual mobile workflow start

Mobile must respect this and not assume every inspection begins with a local run start.

### 4. Dashboard workspace route matters

The current web dashboard depends on:
- `GET /api/project-assets/dashboard-workspace`

Expected shape:

```json
{
  "currentInstalls": [],
  "currentInspections": [],
  "installHistory": [],
  "inspectionHistory": []
}
```

If the mobile app needs a "home" screen aligned with current product behavior, this route is the closest source of truth for the user's personal work queues.

### 5. Device networking

For real iPhone/Android device testing:
- do not use `localhost`
- use a LAN IP such as `http://192.168.x.x:4000/api`

`localhost` is only valid for the machine running the backend itself.

---

## Mobile Implementation Rules

When building or updating phone features, follow these rules:

1. Auth
   - login via `POST /api/auth/login`
   - store token securely
   - refresh via `POST /api/auth/refresh`
   - never keep fake fallback users

2. Dashboard / home
   - prefer `dashboard-workspace` for personal work lists
   - keep personal assignments separate from PM/admin summary badges

3. Workflow execution
   - use workflow assignments and configs from API
   - support `user-select`
   - support offline queued writes

4. Inspection imports
   - support viewing import state
   - support upload for inspection JSON where applicable
   - understand that imported inspections may map to locked runs

5. Evidence / status
   - trust `workflowSummary.evidenceStatus`
   - do not recompute evidence completeness on-device

---

## Recommended Mobile Feature Mapping

Map phone app features to current API/web behavior like this:

- Home / My Work
  - `dashboard-workspace`

- Project list
  - `GET /api/projects`

- Project assets
  - `GET /api/project-assets?projectId={id}`

- Inspection work queue
  - `dashboard-workspace.currentInspections`

- Installation work queue
  - `dashboard-workspace.currentInstalls`

- Inspection inbox summary
  - inspection run summary + import status endpoints

- Workflow runner
  - assignments + configs + runs endpoints

- Team picker
  - `project.teamMemberIds` + `/api/users`

---

## What To Avoid

Do not:
- assume the web UI labels exactly match the mobile information architecture
- treat PM summary inspection counts as personal assigned assets
- hardcode `localhost` for phone builds
- add backend workarounds from the mobile side
- recreate the old fake-auth bootstrap behavior

---

## Prompt To Use Verbatim

Use the following instruction block for the Mac mobile agent:

```text
You are working on the Commtrac Codex 915 mobile app layer only.

Treat the ASP.NET backend and the React web app as the source of truth. Do not modify server/ or src/. Align iOS/Android/Capacitor behavior to the current API and current web product behavior.

Important current state:
- backend runs at http://<LAN-IP>:4000/api
- GET /api/health must return 200
- GET /api/project-assets/dashboard-workspace is the current personal dashboard workspace API
- dashboard-workspace returns currentInstalls, currentInspections, installHistory, inspectionHistory
- project.teamMemberIds is live and must be resolved through GET /api/users
- user-select workflow values must store the selected person's full name, not the ID
- inspection-only projects can receive locked runs from imported JSON
- evidenceStatus from workflowSummary is authoritative
- the web PM dashboard distinguishes between personal inspection workspace data and broader inspection inbox summary signals

Build or update mobile features to match those rules. Prefer consuming existing endpoints over inventing local interpretations. If you find a gap between mobile needs and the API contract, report the gap instead of changing the contract.
```
