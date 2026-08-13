# Prompt Implementation Report

## Scope

This report covers the prompt-pack work implemented locally on `main`, including
all currently uncommitted files in the worktree at commit time.

## Prompt Status

### Prompt 1 — SYNC-1: sync after re-login

Status: Implemented

What changed:
- `src/hooks/useSyncEngine.ts`

Summary:
- The sync engine now listens for `auth-change`.
- After successful login/re-login, it clears the sticky `token-expired` state.
- It immediately attempts a queue flush so offline changes do not stay stuck
  until a brand-new edit happens.

### Prompt 2 — WAKE-1: ping + flush on app resume/foreground

Status: Implemented

What changed:
- `src/hooks/useSyncEngine.ts`

Summary:
- On native app foreground/resume, the app now forces `pingNow()`.
- It also attempts a sync flush immediately instead of waiting for the regular
  connectivity interval.

### Prompt 3 — OfflineModeContext

Status: Implemented

What changed:
- `src/contexts/OfflineModeContext.tsx`
- `src/services/offlineModeState.ts`
- `src/main.tsx`

Summary:
- Added a single shared offline-mode source of truth.
- It tracks radio state, server reachability, and a manual offline override.
- It exposes the state to React through context and to service/interceptor code
  through a small non-React state module.

### Prompt 4 — Offline banner

Status: Implemented for phone app only

What changed:
- `src/components/layout/OfflineModeBanner.tsx`
- `src/components/layout/AppShell.tsx`

Summary:
- Added an offline banner that appears only on native iPhone/Android.
- The banner does not render in the web frontend.
- It shows that the phone is offline and includes the pending sync count.

### Prompt 5 — API skips network in offline mode

Status: Implemented

What changed:
- `src/services/api.ts`
- `src/services/connectivityMonitor.ts`
- `src/services/offlineModeState.ts`
- `src/contexts/OfflineModeContext.tsx`

Summary:
- Non-auth requests now consult the shared offline-mode state.
- When the phone app is in offline mode, those requests bail immediately
  instead of waiting for the request timeout.
- This keeps API behavior aligned with the shared app-wide offline decision.

### Prompt 6 — recompute local asset status offline

Status: Partially implemented

What changed:
- `src/services/assetWorkflowRunService.ts`

What is implemented:
- The offline `patchIssues(...)` path now recomputes the local asset status
  after offline issue updates are saved.
- This closes the gap where closing/resolving issues offline could leave the
  asset status stale until later refresh/sync.

Why it is marked partial:
- The prompt also references offline signature paths.
- In this codebase, offline signature status refresh already existed in
  `src/services/signatureService.ts`, so that portion was not duplicated here.
- Full verification for Prompt 6 has not been completed in this worktree:
  `npx tsc -b`, `npm run build`, and the requested device smoke test were not
  run before commit/push.

### Prompt 7 — labeling cleanup

Status: Not implemented

Summary:
- No Prompt 7 labeling/action-consistency changes were made in this batch.

## Files Included In This Commit

Source changes:
- `src/components/layout/AppShell.tsx`
- `src/components/layout/OfflineModeBanner.tsx`
- `src/contexts/OfflineModeContext.tsx`
- `src/hooks/useSyncEngine.ts`
- `src/main.tsx`
- `src/services/api.ts`
- `src/services/assetWorkflowRunService.ts`
- `src/services/connectivityMonitor.ts`
- `src/services/offlineModeState.ts`

Additional local files included by user request:
- `0001-fix-offline-update-status-features-actions-after-off.patch`
- `0003-fix-offline-refresh-display-on-signature-sync-and-ru.patch`
- `ios/App/build-sim/`

## Verification State

Not completed in this batch:
- `npx tsc -b`
- `npm run build`
- device smoke tests

This commit packages the current local state as requested; it does not certify
that the prompt work is fully build-verified.
