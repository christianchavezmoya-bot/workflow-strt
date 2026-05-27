# Offline Mobile Handoff

Date: 2026-05-25  
Repo: `/Users/christianchavez/Desktop/workflow-strt`  
Branch: `main`  
State: local uncommitted work in progress

## Important context

This Mac worktree contains significant local mobile/frontend changes that are not committed yet.

The apps installed on iPhone and Android include the latest local offline/mobile build from this Mac, but the apps are **not 100% up to date feature-wise**. There are still phone-side feature gaps and missing UI/behavior work that were known before stopping today.

Do not assume the phone apps are feature-complete just because the latest build is installed.

## Hard rules

- Do not touch `server/`
- Do not change `src/app/routes.tsx`
- Do not revert unrelated local changes
- Do not commit local cache/debug folders like:
  - `.gradle-home/`
  - `ios-debug/`

## What was done

### Mobile/UI forward-port work

Local frontend/mobile UI changes were applied across:

- `src/components/layout/BottomTabBar.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Topbar.tsx`
- `src/features/dashboard/Dashboard.tsx`
- `src/features/projects/ProjectList.tsx`
- `src/features/projects/ProjectsPage.tsx`
- `src/features/installations/AssetInstallationPage.tsx`
- `src/features/workInstructions/WorkflowBuilder.tsx`
- `src/index.css`
- `src/onboarding/components/HelpCenterLauncher.tsx`

These include native-mobile topbar/nav/home/projects adjustments from pre-integration local work.

### iOS connectivity fix

- `ios/App/App/Info.plist`

iOS ATS was updated so the app can reach the current LAN API host used in testing.

### Offline field-work foundation

New services added:

- `src/services/offlineStore.ts`
- `src/services/mediaStore.ts`
- `src/services/syncQueue.ts`

Existing services/hooks updated:

- `src/services/localDB.ts`
- `src/services/assetWorkflowRunService.ts`
- `src/services/projectAssetService.ts`
- `src/services/signatureService.ts`
- `src/services/workflowConfigService.ts`
- `src/services/workflowTemplateService.ts`
- `src/repositories/AssetRepository.ts`
- `src/hooks/useSyncEngine.ts`

UI/components wired into offline/media flow:

- `src/components/ui/MediaCapture.tsx`
- `src/components/ui/IssueDetailDialog.tsx`
- `src/features/workInstructions/WorkOrderRunner.tsx`
- `src/features/installations/AssetInstallationPage.tsx`
- `src/features/issues/IssuesBoard.tsx`

## Root cause already identified and partially fixed

Original offline failure:

- App could detect a previous run existed
- But on resume after restart while offline it still called:
  - `GET /asset-workflow-runs/:runId`
- The full run payload was not durably stored locally
- So it failed offline with:
  - `Could not load run. Please try again.`

Implemented fix:

- Previous run lookup now falls back locally
- Run payloads are cached into offline storage
- Run progress/completion can persist locally and queue sync ops

## What is implemented now

- Cached project/assets/config/template reads for mobile flows
- Offline resume of already-cached workflow runs after app restart
- Offline local persistence for run progress and run completion
- Queued replay for:
  - workflow run progress updates
  - workflow run completion
  - workflow run issue patch updates
  - asset updates
  - signature submission
- Filesystem-backed mobile media persistence on native platforms
- Media tokens are resolved back into uploadable payloads before API sync

## What is still incomplete / risky

These are the key reasons this is **not finished**:

- Full real-device end-to-end offline proof is still missing
- Starting a brand-new workflow run fully offline is not complete
- Temp-id to server-id remapping for brand-new offline-created runs is not complete
- Media/signature replay has been wired, but still needs real-device proof
- Some mobile feature/UI work is still missing from phones compared with intended app state
- There may still be additional missing phone features from the pre-integration Mac/Windows merge line

## What was validated today

Build validation:

- `npx tsc --noEmit` passed
- `npm run build` passed
- `npx cap sync ios` passed
- `npx cap sync android` passed

Install validation:

- iPhone app installed successfully
- Android app installed successfully to:
  - Samsung phone
  - Pixel emulator

## What needs to happen next

Next agent should:

1. Review local `git diff` and understand the current offline/mobile architecture.
2. Run real-device offline smoke tests on iPhone and Android:
   - online: start a real run
   - fill several steps
   - add photo/video if applicable
   - add installer/customer signature if applicable
   - force quit
   - reopen fully offline
   - continue previous run
   - complete run offline
   - create/close issue offline with media
   - reconnect
   - verify sync to server with no duplicates
3. Fix only client/mobile issues found during that test.
4. Rebuild, reinstall, and retest.
5. Only after the full flow is proven, prepare a clean commit/integration plan.

## Files to inspect first tomorrow

- `src/services/offlineStore.ts`
- `src/services/mediaStore.ts`
- `src/services/syncQueue.ts`
- `src/services/assetWorkflowRunService.ts`
- `src/hooks/useSyncEngine.ts`
- `src/services/signatureService.ts`
- `src/repositories/AssetRepository.ts`
- `src/components/ui/MediaCapture.tsx`
- `src/features/workInstructions/WorkOrderRunner.tsx`
- `src/features/installations/AssetInstallationPage.tsx`
- `src/features/issues/IssuesBoard.tsx`

## Suggested prompt for next agent

```text
You are continuing local uncommitted work in /Users/christianchavez/Desktop/workflow-strt on branch main.

Important:
- Do not touch server/
- Do not change src/app/routes.tsx
- Do not revert unrelated local changes
- Do not commit .gradle-home/ or ios-debug/

Read HANDOFF_OFFLINE_MOBILE.md first.

This repo has local mobile/offline work in progress. The latest local build is already installed on iPhone and Android, but the apps are not 100% feature-complete yet. There are still missing phone-side features and offline flow gaps.

Your task:
1. Review git diff and understand the offline/mobile architecture already added.
2. Run real-device offline smoke tests on iPhone and Android:
   - online: start a real run, fill steps, add media/signature if applicable
   - force quit
   - offline: reopen and continue previous run
   - complete run offline
   - create/close issue offline with media
   - reconnect and verify sync
3. Identify any remaining failures in offline resume, offline creation, media persistence, signature queueing, or replay.
4. Fix only client/mobile code.
5. Rebuild, reinstall, and retest.
6. Prepare a clean commit set only after the full flow is proven.
```

